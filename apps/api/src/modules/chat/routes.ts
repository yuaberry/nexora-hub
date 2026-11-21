import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  conversationsOf,
  MAX_EXCERPT_LENGTH,
  MAX_MESSAGE_LENGTH,
  messagesOf,
  openDirectConversation,
  otherParticipant,
  sendMessage,
  type ChatState,
  type Conversation,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Chat — conversas directas entre **amigos**.
 *
 * A regra de quem conversa com quem é a mesma das amizades: só amigos
 * conversam. Um estranho não abre conversa, e uma conversa de outras duas
 * pessoas devolve 404 (não confirma que existe). O histórico vive na base; a
 * interface actualiza-se sozinha — o *push* em tempo real pelo gateway é o
 * passo seguinte, e até lá a página pergunta.
 */

/** Limite de mensagens lidas de uma vez. */
const MAX_MESSAGES = 100;

/** Corpo da abertura de conversa (o email da pessoa). */
const OpenConversationBody = z.object({ email: z.string().min(3).max(254) });

/** Corpo do envio de mensagem. */
const SendMessageBody = z.object({ body: z.string().min(1).max(MAX_MESSAGE_LENGTH) });

/** O estado do chat de um utilizador, como o domínio o manipula. */
async function chatStateOf(repositories: Repositories, userId: string): Promise<ChatState> {
  const rows = await repositories.chat.listForUser(userId);
  const messages = await Promise.all(
    rows.map(async (row) => repositories.chat.listMessages(row.id, MAX_MESSAGES)),
  );
  return {
    conversations: rows.map((row) => ({
      id: row.id,
      participants: [row.userIdA, row.userIdB] as [string, string],
      createdAt: row.createdAt.toISOString(),
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessageExcerpt: row.lastMessageExcerpt,
    })),
    messages: messages.flat().map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      authorId: message.authorId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

/** Nomes de vários utilizadores (a lista mostra com quem se fala). */
async function peopleView(
  repositories: Repositories,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, { displayName: string | null; email: string | null }>> {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const user = await repositories.users.findById(userId);
      return [userId, { displayName: user?.displayName ?? null, email: user?.email ?? null }] as const;
    }),
  );
  return new Map(entries);
}

/** Regista as rotas do chat. */
export function registerChatRoutes(app: FastifyInstance, repositories: Repositories): void {
  // As minhas conversas, da mais recente para a mais antiga.
  app.get('/api/v1/chat/conversations', async (request) => {
    const actor = requireAuth(request);
    const state = await chatStateOf(repositories, actor.id);
    const mine = conversationsOf(state, actor.id);
    const others = mine.map((conversation) => otherParticipant(conversation, actor.id) ?? actor.id);
    const people = await peopleView(repositories, [...new Set(others)]);
    return {
      items: mine.map((conversation) => {
        const other = otherParticipant(conversation, actor.id) ?? actor.id;
        return {
          id: conversation.id,
          other: {
            userId: other,
            displayName: people.get(other)?.displayName ?? null,
            email: people.get(other)?.email ?? null,
          },
          lastMessageAt: conversation.lastMessageAt,
          lastMessageExcerpt: conversation.lastMessageExcerpt,
          createdAt: conversation.createdAt,
        };
      }),
    };
  });

  // Abre (ou reutiliza) a conversa directa com um amigo.
  app.post('/api/v1/chat/conversations', async (request, reply) => {
    const actor = requireAuth(request);
    const parsed = OpenConversationBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'email', message: 'Email inválido.', code: 'invalid_value' },
      ]);
    }
    const target = await repositories.users.findByEmail(parsed.data.email.toLowerCase());
    if (target === null) {
      throw errors.notFound('Nenhuma conta com esse email.');
    }
    // Só amigos conversam: a amizade tem de existir nos dois sentidos.
    const friendLink = (await repositories.friends.listFriends(actor.id)).some(
      (row) => row.friendId === target.id,
    );
    if (!friendLink) {
      throw errors.forbidden('Só podes conversar com quem é teu amigo.');
    }
    const state = await chatStateOf(repositories, actor.id);
    // O domínio valida as regras (falar consigo mesmo, recusas de estado).
    const outcome = openDirectConversation(state, {
      conversationId: randomUUID(),
      actorId: actor.id,
      withId: target.id,
      now: new Date().toISOString(),
    });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    // O repositório é **idempotente** e é quem manda no identificador: abrir
    // duas vezes o mesmo par devolve a mesma conversa. Foi um bug real: a
    // rota devolvia o id gerado pelo domínio e a base guardava outro — o
    // cliente ficava com um id que não existia.
    const stored = await repositories.chat.openDirect(actor.id, target.id);
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'chat.open',
      entity: 'conversation',
      entityId: stored.id,
      metadata: { withUserId: target.id },
      requestId: request.id,
    });
    reply.status(201);
    return { id: stored.id, other: { userId: target.id } };
  });

  // As mensagens de uma conversa (só participantes).
  app.get('/api/v1/chat/conversations/:conversationId/messages', async (request) => {
    const actor = requireAuth(request);
    const conversationId = (request.params as { conversationId: string }).conversationId;
    const row = await repositories.chat.findById(conversationId);
    if (row === null || (row.userIdA !== actor.id && row.userIdB !== actor.id)) {
      // A conversa dos outros é indistinguível de uma inexistente.
      throw errors.notFound('Conversa não encontrada.');
    }
    const query = request.query as Record<string, unknown>;
    const limit = Number(query['limit'] ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MESSAGES) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_MESSAGES}.`, code: 'invalid_value' },
      ]);
    }
    const state = await chatStateOf(repositories, actor.id);
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (conversation === undefined) {
      throw errors.notFound('Conversa não encontrada.');
    }
    const authors = await peopleView(repositories, [
      ...new Set(messagesOf(state, conversationId).map((message) => message.authorId)),
    ]);
    return {
      items: messagesOf(state, conversationId).slice(-limit).map((message) => ({
        id: message.id,
        authorId: message.authorId,
        authorName: authors.get(message.authorId)?.displayName ?? null,
        body: message.body,
        createdAt: message.createdAt,
        mine: message.authorId === actor.id,
      })),
    };
  });

  // Envia uma mensagem.
  app.post('/api/v1/chat/conversations/:conversationId/messages', async (request, reply) => {
    const actor = requireAuth(request);
    const conversationId = (request.params as { conversationId: string }).conversationId;
    const parsed = SendMessageBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'body', message: `Mensagem entre 1 e ${MAX_MESSAGE_LENGTH} caracteres.`, code: 'invalid_value' },
      ]);
    }
    const row = await repositories.chat.findById(conversationId);
    if (row === null || (row.userIdA !== actor.id && row.userIdB !== actor.id)) {
      throw errors.notFound('Conversa não encontrada.');
    }
    const state = await chatStateOf(repositories, actor.id);
    const conversation: Conversation | undefined = state.conversations.find(
      (item) => item.id === conversationId,
    );
    if (conversation === undefined) {
      throw errors.notFound('Conversa não encontrada.');
    }
    const outcome = sendMessage(state, {
      messageId: randomUUID(),
      conversationId,
      authorId: actor.id,
      body: parsed.data.body,
      now: new Date().toISOString(),
    });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    const message = outcome.message;
    if (message === undefined) {
      throw errors.internal();
    }
    await repositories.chat.addMessage({
      conversationId,
      authorId: actor.id,
      body: message.body,
      excerpt: message.body.slice(0, MAX_EXCERPT_LENGTH),
      now: new Date(),
    });
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'chat.message',
      entity: 'conversation',
      entityId: conversationId,
      requestId: request.id,
    });
    reply.status(201);
    return {
      id: message.id,
      authorId: message.authorId,
      body: message.body,
      createdAt: message.createdAt,
      mine: true,
    };
  });
}

/** Traduz uma recusa do domínio no erro do contrato. */
function refusal(reason: string): ReturnType<typeof errors.conflict> {
  switch (reason) {
    case 'empty-body':
    case 'too-long':
      return errors.invalidRequest('Mensagem recusada.');
    default:
      // `self-chat`, `not-participant`, `conversation-not-found`.
      return errors.conflict('Pedido recusado pelo estado actual.', { reason });
  }
}
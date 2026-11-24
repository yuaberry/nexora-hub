import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MAX_POST_BODY_LENGTH,
  MAX_THREAD_TITLE_LENGTH,
  canReply,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { pageMeta } from '../../lib/pagination.js';
import type { ForumThreadRecord } from '../../repositories/types.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Fóruns de jogo — tópicos e respostas.
 *
 * Regras que estas rotas impõem:
 *
 * - escrever exige sessão (quem pergunta, responde);
 * - **apagar e fechar filtram pelo dono**: um recurso de outro utilizador
 *   devolve `404`, nunca `403` — não confirma existência;
 * - um tópico **fechado** só aceita resposta do autor (a regra vive no
 *   domínio, `canReply`, testada sem rede);
 * - a ordem da lista é pela última actividade: quem responde sobe.
 */

/** Limites declarados. */
const MAX_PAGE_LIMIT = 50;

/** Corpo da criação de um tópico. */
const ThreadBody = z.object({
  title: z.string().min(1).max(MAX_THREAD_TITLE_LENGTH),
  body: z.string().min(1).max(MAX_POST_BODY_LENGTH),
});

/** Corpo de uma resposta. */
const PostBody = z.object({
  body: z.string().min(1).max(MAX_POST_BODY_LENGTH),
});

/**
 * Query do jogo.
 *
 * O identificador do jogo na biblioteca local é um **caminho**
 * (`/home/…/steamapps/common/…`): barras codificadas não sobrevivem ao
 * roteador de caminhos, por isso o jogo viaja na *query* — um caminho com
 * barras é um valor como qualquer outro.
 */
const GameQuery = z.object({ game: z.string().min(1).max(512) });

/** Parâmetro do tópico. */
const ThreadParams = z.object({ threadId: z.string().uuid() });

/** Parâmetro da resposta. */
const PostParams = z.object({ postId: z.string().uuid() });

/** Paginação declarada. */
function pagination(query: unknown): { limit: number; offset: number } {
  const record = (query ?? {}) as Record<string, unknown>;
  const limit = Number(record['limit'] ?? 20);
  const offset = Number(record['offset'] ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT || !Number.isInteger(offset) || offset < 0) {
    throw errors.invalidRequest('Consulta inválida.', [
      { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_PAGE_LIMIT}.`, code: 'invalid_value' },
    ]);
  }
  return { limit, offset };
}

/** Vista de um tópico (o dono aparece como id, nunca com dados do user). */
function threadView(row: ForumThreadRecord): Record<string, unknown> {
  return {
    id: row.id,
    gameId: row.gameId,
    authorId: row.authorId,
    title: row.title,
    body: row.body,
    replyCount: row.replyCount,
    locked: row.locked,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

/** Vista de uma resposta. */
function postView(row: {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Regista as rotas dos fóruns. */
export function registerForumRoutes(app: FastifyInstance, repositories: Repositories): void {
  // ---- Tópicos ---------------------------------------------------------

  app.get('/api/v1/threads', async (request) => {
    const params = GameQuery.safeParse(request.query);
    if (!params.success) {
      throw errors.invalidRequest('Jogo inválido.');
    }
    const { limit, offset } = pagination(request.query);
    const rows = await repositories.forums.listThreads(params.data.game, limit, offset);
    return {
      items: rows.map(threadView),
      page: pageMeta(rows.length, { limit, offset }),
      hasMore: rows.length === limit,
    };
  });

  app.post('/api/v1/threads', async (request, reply) => {
    const actor = requireAuth(request);
    const params = GameQuery.safeParse(request.query);
    if (!params.success) {
      throw errors.invalidRequest('Jogo inválido.');
    }
    const body = ThreadBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Título e mensagem são obrigatórios.', [
        { path: 'title', message: `Título entre 1 e ${MAX_THREAD_TITLE_LENGTH} caracteres.`, code: 'too_small' },
      ]);
    }
    const row = await repositories.forums.createThread({
      gameId: params.data.game,
      authorId: actor.id,
      title: body.data.title,
      body: body.data.body,
    });
    reply.status(201);
    return threadView(row);
  });

  // ---- Um tópico e as suas respostas ------------------------------------

  app.get<{ Params: { threadId: string } }>('/api/v1/threads/:threadId', async (request) => {
    const params = ThreadParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Tópico inválido.');
    }
    const { limit, offset } = pagination(request.query);
    const thread = await repositories.forums.findThread(params.data.threadId);
    if (thread === null) {
      throw errors.notFound('Tópico não encontrado.');
    }
    const posts = await repositories.forums.listPosts(params.data.threadId, limit, offset);
    return {
      thread: threadView(thread),
      items: posts.map(postView),
      page: pageMeta(posts.length, { limit, offset }),
      hasMore: posts.length === limit,
    };
  });

  app.post<{ Params: { threadId: string } }>('/api/v1/threads/:threadId/posts', async (request, reply) => {
    const actor = requireAuth(request);
    const params = ThreadParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Tópico inválido.');
    }
    const body = PostBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Mensagem entre 1 e 4000 caracteres.', [
        { path: 'body', message: 'Mensagem entre 1 e 4000 caracteres.', code: 'too_small' },
      ]);
    }
    const thread = await repositories.forums.findThread(params.data.threadId);
    if (thread === null) {
      throw errors.notFound('Tópico não encontrado.');
    }
    // A regra vive no domínio: fechado, só o autor responde.
    if (!canReply({ ...thread, createdAt: thread.createdAt.toISOString(), lastActivityAt: thread.lastActivityAt.toISOString() }, actor.id)) {
      throw errors.forbidden('Este tópico está fechado: só quem o criou pode responder.');
    }
    const post = await repositories.forums.createPost({
      threadId: params.data.threadId,
      authorId: actor.id,
      body: body.data.body,
    });
    reply.status(201);
    return postView(post);
  });

  /** Fecha ou abre um tópico (só o autor). */
  app.post<{ Params: { threadId: string } }>('/api/v1/threads/:threadId/lock', async (request) => {
    const actor = requireAuth(request);
    const params = ThreadParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Tópico inválido.');
    }
    const body = z.object({ locked: z.boolean() }).safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Estado inválido.');
    }
    const changed = await repositories.forums.setLocked(params.data.threadId, actor.id, body.data.locked);
    if (!changed) {
      throw errors.notFound('Tópico não encontrado.');
    }
    return { ok: true, locked: body.data.locked };
  });

  /** Apaga um tópico (só o autor, com as respostas). */
  app.delete<{ Params: { threadId: string } }>('/api/v1/threads/:threadId', async (request, reply) => {
    const actor = requireAuth(request);
    const params = ThreadParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Tópico inválido.');
    }
    const removed = await repositories.forums.deleteOwnedThread(params.data.threadId, actor.id);
    if (!removed) {
      throw errors.notFound('Tópico não encontrado.');
    }
    reply.status(204);
    return null;
  });

  /** Apaga uma resposta (só o autor). */
  app.delete<{ Params: { postId: string } }>('/api/v1/posts/:postId', async (request, reply) => {
    const actor = requireAuth(request);
    const params = PostParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Resposta inválida.');
    }
    const removed = await repositories.forums.deleteOwnedPost(params.data.postId, actor.id);
    if (!removed) {
      throw errors.notFound('Resposta não encontrada.');
    }
    reply.status(204);
    return null;
  });
}
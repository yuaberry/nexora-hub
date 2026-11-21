import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  friendIds,
  removeFriend,
  requestFriend,
  visiblePresence,
  type FriendRequest,
  type FriendsState,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Amigos e presença — o contrato social do launcher.
 *
 * As regras vivem no domínio (`@nexora/core/social`): quem pode pedir,
 * aceitar, cancelar e remover. A API carrega o estado, aplica a transição e
 * persiste — a mesma regra corre em memória e em PostgreSQL.
 *
 * A presença é um **coração que bate**: o launcher envia o heartbeat (com o
 * jogo em curso, quando há um), e quem passou da validade aparece offline.
 * Só amigos vêem a presença uns dos outros — a de um estranho não existe
 * nesta API.
 */

/** Corpo do pedido de amizade (o email de quem se quer convidar). */
const FriendRequestBody = z.object({ email: z.string().min(3).max(254) });

/** Corpo do heartbeat. */
const HeartbeatBody = z.object({ gameId: z.string().min(1).max(512).nullable().optional() });

/** Estado de amizades de um utilizador, como o domínio o manipula. */
async function friendsStateOf(repositories: Repositories, userId: string): Promise<FriendsState> {
  const [friends, incoming, outgoing] = await Promise.all([
    repositories.friends.listFriends(userId),
    repositories.friends.listIncomingRequests(userId),
    repositories.friends.listOutgoingRequests(userId),
  ]);
  const requests: readonly FriendRequest[] = [...incoming, ...outgoing].map((row) => ({
    id: row.id,
    fromId: row.fromUserId,
    toId: row.toUserId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  }));
  return {
    requests,
    friends: friends.map((row) => ({ userId: row.friendId, since: row.since.toISOString() })),
  };
}

/** Nome público de um utilizador (para a lista de amigos). */
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

/** Regista as rotas de amigos e presença. */
export function registerFriendsRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Amigos, pedidos recebidos e pedidos enviados.
  app.get('/api/v1/friends', async (request) => {
    const user = requireAuth(request);
    const state = await friendsStateOf(repositories, user.id);
    const ids = [...friendIds(state), ...state.requests.flatMap((row) => [row.fromId, row.toId])];
    const people = await peopleView(repositories, [...new Set(ids)]);
    return {
      friends: state.friends.map((friend) => ({
        userId: friend.userId,
        since: friend.since,
        displayName: people.get(friend.userId)?.displayName ?? null,
        email: people.get(friend.userId)?.email ?? null,
      })),
      incoming: state.requests
        .filter((row) => row.toId === user.id && row.status === 'pending')
        .map((row) => ({
          id: row.id,
          from: row.fromId,
          displayName: people.get(row.fromId)?.displayName ?? null,
          email: people.get(row.fromId)?.email ?? null,
          createdAt: row.createdAt,
        })),
      outgoing: state.requests
        .filter((row) => row.fromId === user.id && row.status === 'pending')
        .map((row) => ({
          id: row.id,
          to: row.toId,
          displayName: people.get(row.toId)?.displayName ?? null,
          email: people.get(row.toId)?.email ?? null,
          createdAt: row.createdAt,
        })),
    };
  });

  // Pede amizade a um email (a pessoa tem de ter conta).
  app.post('/api/v1/friends', async (request, reply) => {
    const actor = requireAuth(request);
    const parsed = FriendRequestBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'email', message: 'Email inválido.', code: 'invalid_value' },
      ]);
    }
    const target = await repositories.users.findByEmail(parsed.data.email.toLowerCase());
    if (target === null) {
      throw errors.notFound('Nenhuma conta com esse email.');
    }
    const state = await friendsStateOf(repositories, actor.id);
    const outcome = requestFriend(state, {
      requestId: randomUUID(),
      fromId: actor.id,
      toId: target.id,
      now: new Date().toISOString(),
    });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    const created = await repositories.friends.createRequest({
      id: randomUUID(),
      fromUserId: actor.id,
      toUserId: target.id,
    });
    if (created === null) {
      // Já existe um pendente entre os dois (a base confirma antes do domínio).
      throw errors.conflict('Já existe um pedido pendente entre os dois.', { reason: 'request-pending' });
    }
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'friends.request',
      entity: 'friend_request',
      entityId: created.id,
      metadata: { toUserId: target.id },
      requestId: request.id,
    });
    reply.status(201);
    return { id: created.id, to: target.id, status: 'pending' };
  });

  // Aceita um pedido recebido — a amizade nasce nos dois sentidos.
  app.post('/api/v1/friends/requests/:requestId/accept', async (request) => {
    const actor = requireAuth(request);
    const requestId = (request.params as { requestId: string }).requestId;
    const state = await friendsStateOf(repositories, actor.id);
    const outcome = acceptFriendRequest(state, { actorId: actor.id, requestId, now: new Date().toISOString() });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    const responded = await repositories.friends.respondRequest(requestId, 'accepted', new Date());
    if (responded === null) {
      throw errors.notFound('Pedido não encontrado.');
    }
    const now = new Date();
    await repositories.friends.addFriendship(actor.id, responded.fromUserId, now);
    await repositories.friends.addFriendship(responded.fromUserId, actor.id, now);
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'friends.accept',
      entity: 'friend_request',
      entityId: requestId,
      requestId: request.id,
    });
    return { status: 'accepted', friendId: responded.fromUserId };
  });

  // Recusa um pedido recebido.
  app.post('/api/v1/friends/requests/:requestId/decline', async (request) => {
    const actor = requireAuth(request);
    const requestId = (request.params as { requestId: string }).requestId;
    const state = await friendsStateOf(repositories, actor.id);
    const outcome = declineFriendRequest(state, { actorId: actor.id, requestId, now: new Date().toISOString() });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    await repositories.friends.respondRequest(requestId, 'declined', new Date());
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'friends.decline',
      entity: 'friend_request',
      entityId: requestId,
      requestId: request.id,
    });
    return { status: 'declined' };
  });

  // Cancela um pedido enviado.
  app.post('/api/v1/friends/requests/:requestId/cancel', async (request) => {
    const actor = requireAuth(request);
    const requestId = (request.params as { requestId: string }).requestId;
    const state = await friendsStateOf(repositories, actor.id);
    const outcome = cancelFriendRequest(state, { actorId: actor.id, requestId, now: new Date().toISOString() });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    await repositories.friends.respondRequest(requestId, 'cancelled', new Date());
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'friends.cancel',
      entity: 'friend_request',
      entityId: requestId,
      requestId: request.id,
    });
    return { status: 'cancelled' };
  });

  // Remove um amigo (nos dois sentidos).
  app.delete('/api/v1/friends/:userId', async (request, reply) => {
    const actor = requireAuth(request);
    const targetId = (request.params as { userId: string }).userId;
    const state = await friendsStateOf(repositories, actor.id);
    const outcome = removeFriend(state, { actorId: actor.id, userId: targetId });
    if (!outcome.ok) {
      throw refusal(outcome.reason);
    }
    await repositories.friends.removeFriendship(actor.id, targetId);
    // O outro lado também esquece: um amigo fantasma é pior que nenhum.
    await repositories.friends.removeFriendship(targetId, actor.id);
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'friends.remove',
      entity: 'friendship',
      entityId: targetId,
      requestId: request.id,
    });
    reply.status(204);
    return null;
  });

  // Presença visível: a minha e a dos meus amigos.
  app.get('/api/v1/friends/presence', async (request) => {
    const actor = requireAuth(request);
    const state = await friendsStateOf(repositories, actor.id);
    const ids = [...friendIds(state), actor.id];
    const records = await repositories.presence.list(ids);
    const now = new Date().toISOString();
    const friends = visiblePresence(
      records.map((row) => ({
        userId: row.userId,
        status: 'online' as const,
        gameId: row.gameId,
        at: row.at.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
      { friendIds: ids, now, excludeUserId: actor.id },
    );
    const people = await peopleView(repositories, ids.filter((id) => id !== actor.id));
    const mine = records.find((row) => row.userId === actor.id);
    return {
      self: mine === undefined
        ? { status: 'offline', gameId: null }
        : { status: 'online', gameId: mine.gameId },
      friends: friends.map((row) => ({
        userId: row.userId,
        displayName: people.get(row.userId)?.displayName ?? null,
        gameId: row.gameId,
        at: row.at,
      })),
      // A validade é do domínio — declarada, não escondida.
      ttlSeconds: 45,
    };
  });

  // Heartbeat: o launcher bate enquanto joga (e quando pára, diz que parou).
  app.post('/api/v1/presence/heartbeat', async (request) => {
    const actor = requireAuth(request);
    const parsed = HeartbeatBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'gameId', message: 'Identificador de jogo inválido.', code: 'invalid_value' },
      ]);
    }
    const now = new Date();
    await repositories.presence.heartbeat({
      userId: actor.id,
      gameId: parsed.data.gameId ?? null,
      at: now,
      expiresAt: new Date(now.getTime() + 45_000),
    });
    // Registos velhos são lixo: a limpeza corre a escrever, não num relógio
    // escondido — e devolve quantos tirou.
    const pruned = await repositories.presence.prune(now);
    return { status: 'online', gameId: parsed.data.gameId ?? null, pruned };
  });
}

/** Traduz uma recusa do domínio no erro do contrato. */
function refusal(reason: string): ReturnType<typeof errors.conflict> {
  switch (reason) {
    case 'self-friend':
      return errors.invalidRequest('Não te podes adicionar a ti mesmo.');
    case 'not-recipient':
      return errors.forbidden('Este pedido não é teu.');
    case 'request-not-found':
      return errors.notFound('Pedido não encontrado.');
    default:
      // `already-friends`, `request-pending`: o pedido é válido, o estado é
      // que não permite — daí o 409.
      return errors.conflict('Pedido recusado pelo estado actual.', { reason });
  }
}
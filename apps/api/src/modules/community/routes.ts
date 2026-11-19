import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { pageMeta } from '../../lib/pagination.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Comunidade — comentários e reviews por jogo.
 *
 * Regras que estas rotas impõem:
 *
 * - comentar e reviewar exigem sessão (quem escreve, responde);
 * - **apagar filtra pelo dono**: um recurso de outro utilizador devolve
 *   `404`, nunca `403` — não confirma existência;
 * - a review é **uma por utilizador e jogo**: `PUT` cria ou substitui, sem
 *   duplicar;
 * - a nota é 1–10 e as categorias são opcionais — validação declarada, não
 *   esperança.
 */

/** Limites declarados. */
const MAX_BODY_LENGTH = 4_000;
const MAX_PAGE_LIMIT = 50;

/** Corpo de um comentário. */
const CommentBody = z.object({
  body: z.string().min(1).max(MAX_BODY_LENGTH),
});

/** Corpo de uma review (upsert). */
const ReviewBody = z.object({
  rating: z.number().int().min(1).max(10),
  story: z.number().int().min(1).max(10).nullable().optional(),
  gameplay: z.number().int().min(1).max(10).nullable().optional(),
  graphics: z.number().int().min(1).max(10).nullable().optional(),
  sound: z.number().int().min(1).max(10).nullable().optional(),
  body: z.string().max(MAX_BODY_LENGTH).optional(),
});

/** Vista de um comentário (o dono aparece como id, nunca com dados do user). */
function commentView(row: {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly body: string;
  readonly createdAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    gameId: row.gameId,
    userId: row.userId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Vista de uma review. */
function reviewView(row: {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly rating: number;
  readonly story: number | null;
  readonly gameplay: number | null;
  readonly graphics: number | null;
  readonly sound: number | null;
  readonly body: string;
  readonly updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    gameId: row.gameId,
    userId: row.userId,
    rating: row.rating,
    story: row.story,
    gameplay: row.gameplay,
    graphics: row.graphics,
    sound: row.sound,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Regista as rotas da comunidade. */
export function registerCommunityRoutes(app: FastifyInstance, repositories: Repositories): void {
  // ---- Comentários ----------------------------------------------------

  app.get('/api/v1/games/:gameId/comments', async (request) => {
    const gameId = (request.params as { gameId: string }).gameId;
    const query = request.query as Record<string, unknown>;
    const limit = Number(query['limit'] ?? 20);
    const offset = Number(query['offset'] ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT || !Number.isInteger(offset) || offset < 0) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_PAGE_LIMIT}.`, code: 'invalid_value' },
      ]);
    }
    const rows = await repositories.comments.listByGame(gameId, limit, offset);
    const items = rows.map(commentView);
    // A contagem total exige uma consulta própria; a página devolve o que
    // tem, e o cliente sabe que há mais quando a página veio cheia.
    return { items, page: pageMeta(items.length, { limit, offset }), hasMore: items.length === limit };
  });

  app.post('/api/v1/games/:gameId/comments', async (request, reply) => {
    const user = requireAuth(request);
    const gameId = (request.params as { gameId: string }).gameId;
    const parsed = CommentBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'body', message: 'Comentário entre 1 e 4000 caracteres.', code: 'invalid_value' },
      ]);
    }
    const row = await repositories.comments.create({ gameId, userId: user.id, body: parsed.data.body });
    reply.status(201);
    return commentView(row);
  });

  app.delete('/api/v1/comments/:commentId', async (request, reply) => {
    const user = requireAuth(request);
    const commentId = (request.params as { commentId: string }).commentId;
    const removed = await repositories.comments.deleteOwned(commentId, user.id);
    if (!removed) {
      // Não é teu (ou não existe): a resposta não distingue.
      throw errors.notFound('Comentário não encontrado.');
    }
    reply.status(204);
    return null;
  });

  // ---- Reviews --------------------------------------------------------

  app.get('/api/v1/games/:gameId/reviews', async (request) => {
    const gameId = (request.params as { gameId: string }).gameId;
    const query = request.query as Record<string, unknown>;
    const limit = Number(query['limit'] ?? 20);
    const offset = Number(query['offset'] ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT || !Number.isInteger(offset) || offset < 0) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_PAGE_LIMIT}.`, code: 'invalid_value' },
      ]);
    }
    const [rows, aggregate] = await Promise.all([
      repositories.reviews.listByGame(gameId, limit, offset),
      repositories.reviews.aggregate(gameId),
    ]);
    return {
      items: rows.map(reviewView),
      aggregate: {
        count: aggregate.count,
        averageRating: aggregate.averageRating,
        averageStory: aggregate.averageStory,
        averageGameplay: aggregate.averageGameplay,
        averageGraphics: aggregate.averageGraphics,
        averageSound: aggregate.averageSound,
      },
    };
  });

  // Cria ou substitui a review do utilizador (uma por jogo).
  app.put('/api/v1/games/:gameId/reviews/me', async (request) => {
    const user = requireAuth(request);
    const gameId = (request.params as { gameId: string }).gameId;
    const parsed = ReviewBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'rating', message: 'Nota de 1 a 10 (categorias opcionais, de 1 a 10).', code: 'invalid_value' },
      ]);
    }
    const row = await repositories.reviews.upsert({
      gameId,
      userId: user.id,
      rating: parsed.data.rating,
      story: parsed.data.story ?? null,
      gameplay: parsed.data.gameplay ?? null,
      graphics: parsed.data.graphics ?? null,
      sound: parsed.data.sound ?? null,
      body: parsed.data.body ?? '',
    });
    return reviewView(row);
  });

  app.delete('/api/v1/reviews/:reviewId', async (request, reply) => {
    const user = requireAuth(request);
    const reviewId = (request.params as { reviewId: string }).reviewId;
    const removed = await repositories.reviews.deleteOwned(reviewId, user.id);
    if (!removed) {
      throw errors.notFound('Review não encontrada.');
    }
    reply.status(204);
    return null;
  });
}
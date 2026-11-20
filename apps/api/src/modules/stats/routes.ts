import type { FastifyInstance } from 'fastify';
import { summarizeSessions } from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Estatísticas e timeline — agregadas no **servidor**.
 *
 * O cliente não soma listas: a API agrega sobre as sessões do utilizador e
 * devolve o resumo. Um jogo sem sessão não aparece no top, e uma hora sem
 * sessão não aparece no histograma — nada é inventado.
 */

/** Limite de eventos da timeline. */
const MAX_TIMELINE = 50;

/** Regista as rotas de estatísticas. */
export function registerStatsRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Resumo das estatísticas do utilizador.
  app.get('/api/v1/stats/summary', async (request) => {
    const user = requireAuth(request);
    const sessions = await repositories.sessions.listAllByUser(user.id);
    const library = await repositories.library.listByUser(user.id);

    // As etiquetas vêm da biblioteca do utilizador: o género favorito é o
    // que ele realmente tem.
    const tagsByGame = new Map<string, readonly string[]>();
    for (const entry of library) {
      tagsByGame.set(entry.externalKey, entry.tags);
    }

    const samples = sessions.map((session) => ({
      gameId: session.gameId,
      startedAt: session.startedAt.toISOString(),
      durationSeconds: session.durationSeconds,
    }));

    const summary = summarizeSessions(samples, tagsByGame);
    return {
      totalHours: summary.totalHours,
      sessionCount: summary.sessionCount,
      distinctGames: summary.distinctGames,
      topGames: summary.topGames,
      topTags: summary.topTags,
      hourHistogram: summary.hourHistogram,
      peakHour: summary.peakHour,
    };
  });

  // Timeline de actividade (sessões, comentários, reviews, desejos).
  app.get('/api/v1/timeline', async (request) => {
    const user = requireAuth(request);
    const query = request.query as Record<string, unknown>;
    const rawLimit = query['limit'];
    const limit =
      typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TIMELINE) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_TIMELINE}.`, code: 'invalid_value' },
      ]);
    }

    const [sessions, comments, reviews, wishlist] = await Promise.all([
      repositories.sessions.listEndedByUser(user.id, limit),
      repositories.comments.listByUser(user.id, limit),
      repositories.reviews.listByUser(user.id, limit),
      repositories.wishlist.listByUser(user.id),
    ]);

    const events = [
      ...sessions.map((session) => ({
        id: `session:${session.id}`,
        type: 'session-ended' as const,
        at: (session.endedAt ?? session.startedAt).toISOString(),
        gameId: session.gameId,
        summary: `${Math.round(session.durationSeconds / 60)} min`,
      })),
      ...comments.map((comment) => ({
        id: `comment:${comment.id}`,
        type: 'comment-created' as const,
        at: comment.createdAt.toISOString(),
        gameId: comment.gameId,
        summary: comment.body.slice(0, 120),
      })),
      ...reviews.map((review) => ({
        id: `review:${review.id}`,
        type: 'review-created' as const,
        at: review.updatedAt.toISOString(),
        gameId: review.gameId,
        summary: `Nota ${review.rating}`,
      })),
      ...wishlist.map((item) => ({
        id: `wishlist:${item.gameId}`,
        type: 'wishlist-added' as const,
        at: item.createdAt.toISOString(),
        gameId: item.gameId,
        summary: item.gameId,
      })),
    ];

    // A ordem é do mais recente para o mais antigo — a timeline não esconde
    // o que é novo.
    const sorted = events.sort((left, right) => right.at.localeCompare(left.at)).slice(0, limit);
    return { items: sorted };
  });
}
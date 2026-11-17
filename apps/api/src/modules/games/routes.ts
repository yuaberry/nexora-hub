import type { FastifyInstance } from 'fastify';
import { CURATED_GAMES, searchGames } from '@nexora/core';
import type { GameSearchHit } from '@nexora/protocol';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { pageMeta } from '../../lib/pagination.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Pesquisa de jogos.
 *
 * A ordenação vive no `@nexora/core` (`searchGames`) — a API não reimplementa
 * o ranking, apenas alimenta-o com o contexto de posse do utilizador. É o
 * mesmo motor da barra de pesquisa do desktop, servido por HTTP.
 */

/** Limite de resultados da pesquisa. */
const MAX_SEARCH_LIMIT = 50;

/** Regista as rotas de catálogo e pesquisa. */
export function registerGameRoutes(app: FastifyInstance, repositories: Repositories): void {
  app.get('/api/v1/games/search', async (request, reply) => {
    const user = requireAuth(request);
    const query = request.query as Record<string, unknown>;
    const rawQuery = query['q'];

    if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'q', message: 'Termo de pesquisa em falta.', code: 'invalid_value' },
      ]);
    }

    const rawLimit = query['limit'];
    const limit =
      typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_SEARCH_LIMIT}.`, code: 'invalid_value' },
      ]);
    }

    const totals = await repositories.library.totalsByGame(user.id);
    const ownership = {
      ownedIds: new Set(totals.keys()),
    };

    const hits = searchGames(rawQuery, CURATED_GAMES, { ownership, limit });
    const items: GameSearchHit[] = hits.map((hit) => ({
      game: {
        id: hit.game.id,
        title: hit.game.title,
        cover: hit.game.cover,
        provider: 'local' as const,
        tags: hit.game.tags,
        adult: hit.game.adult,
        installPath: null,
        executablePath: null,
        favorite: false,
        collections: [],
        lastPlayedAt: null,
        totalSeconds: 0,
      },
      score: hit.score,
      match: hit.match,
    }));

    return reply.code(200).send({
      items,
      page: pageMeta(items.length, { limit, offset: 0 }),
    });
  });
}
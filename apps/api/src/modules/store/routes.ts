import type { FastifyInstance } from 'fastify';
import { STORE_CATALOG, filterStore, type StorePlatform } from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { randomUUID } from 'node:crypto';
import type { Repositories } from '../../repositories/types.js';

/**
 * Loja — directório de compras e lista de desejos.
 *
 * A loja é um **directório**: mostra jogos com ligações para lojas oficiais.
 * A NEXORA não vende nem hospedeia nada — quem compra, compra na loja. A
 * lista de desejos é do utilizador (exige sessão), e a rota pública do
 * directório é pública de propósito: para ver sem conta.
 */

/** Plataformas válidas (validação declarada). */
const PLATFORMS: readonly StorePlatform[] = ['windows', 'linux', 'macos'];

/** Regista as rotas da loja. */
export function registerStoreRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Directório público: pesquisa, filtro adulto e filtro de plataforma.
  app.get('/api/v1/store', async (request) => {
    const query = request.query as Record<string, unknown>;
    const rawQuery = query['q'];
    const rawPlatform = query['platform'];
    const rawHideAdult = query['hideAdult'];

    if (rawPlatform !== undefined && typeof rawPlatform !== 'string') {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'platform', message: 'Plataforma inválida.', code: 'invalid_value' },
      ]);
    }
    if (rawPlatform !== undefined && !PLATFORMS.includes(rawPlatform as StorePlatform)) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'platform', message: 'Plataforma inválida.', code: 'invalid_value' },
      ]);
    }

    const items = filterStore(STORE_CATALOG, {
      query: typeof rawQuery === 'string' ? rawQuery : '',
      platform: (rawPlatform as StorePlatform | undefined) ?? null,
      hideAdult: rawHideAdult === 'false' ? false : true,
    });
    return { items, total: items.length };
  });

  // Lista de desejos do utilizador (exige sessão).
  app.get('/api/v1/wishlist', async (request) => {
    const user = requireAuth(request);
    const rows = await repositories.wishlist.listByUser(user.id);
    return {
      items: rows.map((row) => ({
        gameId: row.gameId,
        addedAt: row.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/v1/wishlist/:gameId', async (request, reply) => {
    const user = requireAuth(request);
    const gameId = (request.params as { gameId: string }).gameId;
    const exists = STORE_CATALOG.some((game) => game.id === gameId);
    if (!exists) {
      throw errors.notFound('Jogo não encontrado no directório.');
    }
    const row = await repositories.wishlist.add(user.id, gameId, randomUUID());
    reply.status(201);
    return { gameId: row.gameId, addedAt: row.createdAt.toISOString() };
  });

  app.delete('/api/v1/wishlist/:gameId', async (request, reply) => {
    const user = requireAuth(request);
    const gameId = (request.params as { gameId: string }).gameId;
    const removed = await repositories.wishlist.remove(user.id, gameId);
    if (!removed) {
      throw errors.notFound('Jogo não encontrado na lista de desejos.');
    }
    reply.status(204);
    return null;
  });
}
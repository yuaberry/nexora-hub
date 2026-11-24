import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { pageMeta } from '../../lib/pagination.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Biblioteca sincronizada — a conta guarda o que o utilizador tem.
 *
 * O que sobe é **metadado**: título, appid, capa pública, favorito e o tempo
 * medido. Caminhos locais e executáveis ficam na máquina — a conta não precisa
 * de saber onde os ficheiros estão.
 *
 * Sincronizar substitui pela chave externa: enviar duas vezes não duplica.
 */

/** Limites declarados. */
const MAX_ENTRIES_PER_SYNC = 500;
const MAX_KEY_LENGTH = 512;

/** Uma entrada a sincronizar. */
const EntryBody = z.object({
  externalKey: z.string().min(1).max(MAX_KEY_LENGTH),
  title: z.string().min(1).max(300),
  steamAppId: z.string().min(1).max(20).nullable().optional(),
  /** Só URLs públicas: um caminho local é rejeitado (não sobe). */
  coverUrl: z.string().url().max(500).nullable().optional(),
  installed: z.boolean().optional(),
  favorite: z.boolean().optional(),
  totalSeconds: z.number().int().min(0).optional(),
});

/** Corpo da sincronização. */
const SyncBody = z.object({ entries: z.array(EntryBody).min(1).max(MAX_ENTRIES_PER_SYNC) });

/** Regista as rotas da biblioteca sincronizada. */
export function registerLibrarySyncRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Sincroniza a biblioteca local com a conta.
  app.put('/api/v1/library/sync', async (request) => {
    const actor = requireAuth(request);
    const body = SyncBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Entradas inválidas (a capa tem de ser uma URL pública).');
    }
    const report = await repositories.librarySync.sync(actor.id, body.data.entries);
    return { ok: true, updated: report.updated, added: report.added };
  });

  // A biblioteca sincronizada da conta (para a web e outra máquina).
  // (A rota `/api/v1/library` é do directório; esta é a do utilizador.)
  app.get('/api/v1/library/mine', async (request) => {
    const actor = requireAuth(request);
    const query = request.query as Record<string, unknown>;
    const limit = Number(query['limit'] ?? 100);
    const offset = Number(query['offset'] ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
      throw errors.invalidRequest('Consulta inválida.');
    }
    const rows = await repositories.librarySync.list(actor.id);
    const items = rows.slice(offset, offset + limit).map((row) => ({
      externalKey: row.externalKey,
      title: row.title,
      steamAppId: row.steamAppId,
      coverUrl: row.coverUrl,
      installed: row.installed,
      favorite: row.favorite,
      totalSeconds: row.totalSeconds,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return { items, page: pageMeta(items.length, { limit, offset }), total: rows.length };
  });
}

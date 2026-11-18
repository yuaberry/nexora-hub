import type { FastifyInstance } from 'fastify';
import { createSourceRegistry, type InstalledSource, type SourceRegistry, type UnifiedGame } from '@nexora/sources';
import { errors, requireAuth, requireRole } from '../../plugins/errorHandler.js';

/**
 * Fontes de downloads — instalação, catálogo unificado e pesquisa.
 *
 * O estado vive em memória, de propósito e declarado: a persistência das
 * fontes instaladas é fase futura (a API reporta o modo em `/health`, como o
 * resto). O que aqui é **invariante**:
 *
 * - instalar exige o papel `admin` — quem distribui fontes responde por elas;
 * - um manifesto sem attestation legal é recusado pelo `@nexora/sources`
 *   (a fronteira), e a API devolve os motivos;
 * - a pesquisa é o mesmo motor da biblioteca (`searchGames`), servido por
 *   HTTP — a barra do desktop e a web citam o mesmo ranking.
 */

/** Registro partilhado pelo processo (uma instância da API, um registro). */
const registry: SourceRegistry = createSourceRegistry();

/** Limites declarados. */
const MAX_MANIFEST_BYTES = 1_000_000;
const MAX_SEARCH_LIMIT = 50;

/** Vista de uma fonte instalada. */
function sourceView(source: InstalledSource): Record<string, unknown> {
  return {
    id: source.manifest.id,
    name: source.manifest.name,
    description: source.manifest.description,
    origin: source.origin,
    installedAt: source.installedAt,
    legal: source.manifest.legal,
    games: source.manifest.games.length,
  };
}

/** Vista de um jogo do catálogo unificado. */
function gameView(game: UnifiedGame): Record<string, unknown> {
  return {
    id: game.id,
    sourceId: game.sourceId,
    title: game.title,
    aliases: game.aliases,
    version: game.version ?? null,
    available: game.available,
    launcherRequired: game.launcherRequired,
    sizeBytes: game.sizeBytes ?? null,
    executables: game.executables,
  };
}

/** Regista as rotas de fontes. */
export function registerSourceRoutes(app: FastifyInstance): void {
  // Instalar um manifesto (admin): o corpo é o JSON cru do manifesto.
  app.post('/api/v1/sources', async (request, reply) => {
    requireRole('admin')(request);
    const body = request.body as unknown;
    const size = JSON.stringify(body ?? {}).length;
    if (size > MAX_MANIFEST_BYTES) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'body', message: `Manifesto acima de ${MAX_MANIFEST_BYTES} caracteres.`, code: 'invalid_value' },
      ]);
    }
    const origin = typeof (request.headers['x-source-origin'] ?? '') === 'string'
      ? String(request.headers['x-source-origin'])
      : 'desconhecida';

    const result = registry.install(body, origin.slice(0, 256));
    if (!result.ok) {
      throw errors.invalidRequest('Manifesto recusado.', result.issues.map((issue) => ({ path: 'manifest', message: issue, code: 'invalid_value' })));
    }
    reply.status(201);
    return sourceView(result.source);
  });

  // Listar fontes instaladas (sessão): inclui a attestation de cada uma.
  app.get('/api/v1/sources', async (request) => {
    requireAuth(request);
    return { items: registry.list().map(sourceView) };
  });

  // Uma fonte com o seu catálogo.
  app.get('/api/v1/sources/:sourceId', async (request) => {
    requireAuth(request);
    const sourceId = (request.params as { sourceId: string }).sourceId;
    const source = registry.get(sourceId);
    if (source === null) {
      throw errors.notFound('Fonte não encontrada.');
    }
    return {
      ...sourceView(source),
      entries: source.manifest.games.map((game) => ({
        id: `${source.manifest.id}/${game.id}`,
        title: game.title,
        available: game.files.some((file) => file.transport === 'http'),
        launcherRequired: game.launcherRequired,
      })),
    };
  });

  // Remover uma fonte (admin).
  app.delete('/api/v1/sources/:sourceId', async (request, reply) => {
    requireRole('admin')(request);
    const sourceId = (request.params as { sourceId: string }).sourceId;
    if (!registry.remove(sourceId)) {
      throw errors.notFound('Fonte não encontrada.');
    }
    reply.status(204);
    return null;
  });

  // Pesquisa no catálogo unificado (o motor da biblioteca, servido por HTTP).
  app.get('/api/v1/sources/search', async (request) => {
    requireAuth(request);
    const query = request.query as Record<string, unknown>;
    const rawQuery = query['q'];
    if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'q', message: 'Termo de pesquisa em falta.', code: 'invalid_value' },
      ]);
    }
    const rawLimit = query['limit'];
    const limit = typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_SEARCH_LIMIT}.`, code: 'invalid_value' },
      ]);
    }
    const hits = registry.search(rawQuery, limit);
    return { items: hits.map((hit) => ({ ...gameView(toUnified(hit.game.id)), score: hit.score, match: hit.match })) };
  });
}

/** Converte um id unificado do motor na vista do contrato. */
function toUnified(unifiedId: string): UnifiedGame {
  const found = registry.game(unifiedId);
  if (found === null) {
    throw errors.notFound('Jogo não encontrado no catálogo unificado.');
  }
  return found;
}
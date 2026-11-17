import type { FastifyInstance } from 'fastify';
import type { LibraryGame } from '@nexora/protocol';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import { pageMeta, parsePagination } from '../../lib/pagination.js';
import type { Repositories } from '../../repositories/types.js';
import { collectionSchema, favoriteSchema, libraryEntrySyncSchema } from './schemas.js';

/**
 * Rotas da biblioteca — metadados dos jogos do utilizador.
 *
 * Os **ficheiros** ficam no computador de quem os tem. O que a API guarda é o
 * metadado, para que a web possa ler a mesma biblioteca.
 *
 * Duas regras que não são negociáveis:
 *
 * - **recurso de outro utilizador devolve `404`**, nunca `403` — o filtro é
 *   sempre pelo dono, e uma linha alheia é indistinguível de uma inexistente;
 * - as **escritas** são auditadas; as leituras não (D22).
 */

/** Converte um registo da base na vista do contrato. */
export function toLibraryGame(entry: {
  id: string;
  externalKey: string;
  title: string;
  cover: string | null;
  provider: LibraryGame['provider'];
  installPath: string | null;
  executablePath: string | null;
  tags: readonly string[];
  adult: boolean;
  favorite: boolean;
  collections: readonly string[];
  lastPlayedAt: Date | null;
  totalSeconds: number;
}): LibraryGame {
  return {
    id: entry.id,
    title: entry.title,
    cover: entry.cover,
    provider: entry.provider,
    tags: entry.tags,
    adult: entry.adult,
    installPath: entry.installPath,
    executablePath: entry.executablePath,
    favorite: entry.favorite,
    collections: entry.collections,
    lastPlayedAt: entry.lastPlayedAt === null ? null : entry.lastPlayedAt.toISOString(),
    totalSeconds: entry.totalSeconds,
  };
}

/** Regista as rotas da biblioteca. */
export function registerLibraryRoutes(app: FastifyInstance, repositories: Repositories): void {
  app.post('/api/v1/library/entries', async (request, reply) => {
    const user = requireAuth(request);
    const input = libraryEntrySyncSchema.parse(request.body);
    const entry = await repositories.library.upsertEntry({
      userId: user.id,
      externalKey: input.externalKey,
      title: input.title,
      cover: input.cover ?? null,
      provider: input.provider,
      installPath: input.installPath ?? null,
      executablePath: input.executablePath ?? null,
      tags: input.tags ?? [],
      adult: input.adult ?? false,
    });

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'library.entry.create',
      entity: 'library_entry',
      entityId: entry.id,
      metadata: { externalKey: entry.externalKey },
      requestId: request.id,
    });

    return reply.code(201).send({ entry: toLibraryGame(entry) });
  });

  app.get('/api/v1/library', async (request, reply) => {
    const user = requireAuth(request);
    const query = parsePagination(request.query as Record<string, unknown>);
    const { items, total } = await repositories.library.list(user.id, query);
    return reply.code(200).send({
      items: items.map((entry) => toLibraryGame(entry)),
      page: pageMeta(total, query),
    });
  });

  app.get('/api/v1/library/:id', async (request, reply) => {
    const user = requireAuth(request);
    const params = request.params as { id?: string };
    if (params.id === undefined) {
      throw errors.invalidRequest('Identificador em falta.');
    }
    const entry = await repositories.library.findById(user.id, params.id);
    if (entry === null) {
      // 404 — nunca 403: não confirma que a entrada existe.
      throw errors.notFound();
    }
    return reply.code(200).send({ entry: toLibraryGame(entry) });
  });

  app.put('/api/v1/library/:id/favorite', async (request, reply) => {
    const user = requireAuth(request);
    const params = request.params as { id?: string };
    if (params.id === undefined) {
      throw errors.invalidRequest('Identificador em falta.');
    }
    const input = favoriteSchema.parse(request.body);
    const entry = await repositories.library.setFavorite(user.id, params.id, input.favorite);
    if (entry === null) {
      throw errors.notFound();
    }

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'library.favorite.update',
      entity: 'library_entry',
      entityId: entry.id,
      metadata: { favorite: input.favorite },
      requestId: request.id,
    });

    return reply.code(200).send({ entry: toLibraryGame(entry) });
  });

  app.post('/api/v1/library/:id/collections', async (request, reply) => {
    const user = requireAuth(request);
    const params = request.params as { id?: string };
    if (params.id === undefined) {
      throw errors.invalidRequest('Identificador em falta.');
    }
    const input = collectionSchema.parse(request.body);
    const entry = await repositories.library.addCollection(user.id, params.id, input.name);
    if (entry === null) {
      throw errors.notFound();
    }

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'library.collection.add',
      entity: 'library_entry',
      entityId: entry.id,
      metadata: { collection: input.name },
      requestId: request.id,
    });

    return reply.code(200).send({ entry: toLibraryGame(entry) });
  });

  app.delete('/api/v1/library/:id', async (request, reply) => {
    const user = requireAuth(request);
    const params = request.params as { id?: string };
    if (params.id === undefined) {
      throw errors.invalidRequest('Identificador em falta.');
    }
    const removed = await repositories.library.remove(user.id, params.id);
    if (!removed) {
      throw errors.notFound();
    }

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'library.entry.remove',
      entity: 'library_entry',
      entityId: params.id,
      requestId: request.id,
    });

    return reply.code(204).send();
  });
}
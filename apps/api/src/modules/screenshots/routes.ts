import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { isScreenshotAcceptable, MAX_SCREENSHOT_BYTES } from '@nexora/core';
import type { Repositories, ScreenshotRecord } from '../../repositories/types.js';

/**
 * Capturas na nuvem — os momentos que o utilizador decidiu guardar.
 *
 * A captura é do utilizador e sobe com a sessão: o ficheiro (PNG) vai para o
 * disco de dados e o índice para a base. Um nome aceitável e o tamanho
 * declarado são validados — e a captura de outro utilizador devolve **404**,
 * nunca 403.
 */

/** Cabeçalhos do envio. */
const UploadHeaders = z.object({
  'x-game-key': z.string().min(1).max(512),
  'x-file-name': z.string().min(1).max(160),
});

/** Vista de uma captura. */
function view(record: ScreenshotRecord): Record<string, unknown> {
  return {
    id: record.id,
    gameKey: record.gameKey,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt.toISOString(),
  };
}

/** O corpo binário como Buffer (o parse do Fastify devolve o que o cliente manda). */
type PngBody = Buffer;

/** Regista as rotas das capturas. */
export function registerScreenshotRoutes(app: FastifyInstance, repositories: Repositories): void {
  app.addContentTypeParser<PngBody>(
    'image/png',
    { parseAs: 'buffer', bodyLimit: MAX_SCREENSHOT_BYTES },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  // Sobe uma captura (o PNG é o corpo).
  app.post<{ Body: PngBody }>('/api/v1/screenshots', async (request, reply) => {
    const actor = requireAuth(request);
    const headers = UploadHeaders.safeParse(request.headers);
    if (!headers.success) {
      throw errors.invalidRequest('Cabeçalhos em falta (jogo e nome do ficheiro).');
    }
    const body = request.body;
    if (body.byteLength === 0) {
      throw errors.invalidRequest('Ficheiro vazio.');
    }
    if (!isScreenshotAcceptable(headers.data['x-file-name'], body.byteLength)) {
      throw errors.invalidRequest(
        `Captura inválida (extensão ou mais de ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB).`,
      );
    }
    const record = await repositories.screenshots.create({
      userId: actor.id,
      gameKey: headers.data['x-game-key'],
      fileName: headers.data['x-file-name'],
      bytes: body,
    });
    reply.status(201);
    return { screenshot: view(record) };
  });

  // As minhas capturas (de um jogo, quando pedido).
  app.get('/api/v1/screenshots', async (request) => {
    const actor = requireAuth(request);
    const game = (request.query as Record<string, unknown>)['game'];
    if (game !== undefined && (typeof game !== 'string' || game === '')) {
      throw errors.invalidRequest('Consulta inválida.');
    }
    const items = await repositories.screenshots.list(actor.id, typeof game === 'string' ? game : undefined);
    return { items: items.map(view), total: items.length };
  });

  // Descarrega uma captura.
  app.get<{ Params: { id: string } }>('/api/v1/screenshots/:id', async (request, reply) => {
    const actor = requireAuth(request);
    const id = (request.params as { id: string }).id;
    const record = await repositories.screenshots.find(actor.id, id);
    if (record === null) {
      throw errors.notFound('Captura não encontrada.');
    }
    const bytes = repositories.screenshots.read(actor.id, id);
    if (bytes === null) {
      throw errors.notFound('Ficheiro não encontrado.');
    }
    return reply
      .header('content-type', 'image/png')
      .header('content-disposition', `inline; filename="${record.fileName}"`)
      .send(bytes);
  });

  // Apaga uma captura.
  app.delete<{ Params: { id: string } }>('/api/v1/screenshots/:id', async (request, reply) => {
    const actor = requireAuth(request);
    const id = (request.params as { id: string }).id;
    const removed = await repositories.screenshots.remove(actor.id, id);
    if (!removed) {
      throw errors.notFound('Captura não encontrada.');
    }
    reply.status(204);
    return null;
  });
}
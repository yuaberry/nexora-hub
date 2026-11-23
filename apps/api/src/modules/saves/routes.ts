import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { AuditRepository } from '../../repositories/types.js';
import { MAX_SAVE_BYTES, SaveStore } from './save-store.js';

/**
 * Saves na nuvem — o progresso de quem joga, guardado com a conta.
 *
 * Quatro operações, todas atrás de sessão: **enviar** uma versão nova,
 * **listar** as que existem (de um jogo ou de todos), **descarregar** uma, e
 * **apagar** uma. O conteúdo é um arquivo (`tar.gz`), e o índice sabe a
 * revisão e o checksum — a decisão de conflito (quem está à frente de quem)
 * é do cliente, onde as duas cópias existem.
 *
 * O save de outro utilizador devolve **404**, nunca 403: a existência de um
 * save que não é teu não é informação a dar. As escritas são auditadas.
 */

/** Querystring da listagem. */
const ListQuery = z.object({
  game: z.string().min(1).max(512).optional(),
});

/** Parâmetro do id. */
const IdParam = z.object({
  id: z.string().uuid(),
});

/** Cabeçalhos do envio. */
const UploadHeaders = z.object({
  'x-game-key': z.string().min(1).max(512),
  'x-save-label': z.string().min(1).max(120).optional(),
  'x-save-checksum': z.string().min(8).max(128),
  'x-save-revision': z.string().regex(/^\d{1,9}$/).optional(),
});

/** O corpo binário como Buffer (o parse do Fastify devolve o que o cliente manda). */
type SaveBody = Buffer;

/**
 * Regista as rotas dos saves na nuvem.
 *
 * O `application/gzip` tem parser próprio: o conteúdo é opaco para a API —
 * a verificação de integridade é o checksum declarado, e o conteúdo só é
 * lido por quem o enviou.
 */
export function registerSaveRoutes(app: FastifyInstance, store: SaveStore, auditRepository: AuditRepository): void {
  app.addContentTypeParser<SaveBody>(
    'application/gzip',
    { parseAs: 'buffer', bodyLimit: MAX_SAVE_BYTES },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  // Enviar uma versão nova (o arquivo é o corpo).
  app.post<{ Body: SaveBody }>('/api/v1/saves', async (request, reply) => {
    const actor = requireAuth(request);
    const headers = UploadHeaders.safeParse(request.headers);
    if (!headers.success) {
      throw errors.invalidRequest('Cabeçalhos do save em falta ou inválidos.');
    }
    const body = request.body;
    if (body.byteLength === 0) {
      throw errors.invalidRequest('Arquivo vazio.');
    }
    const created = store.create({
      userId: actor.id,
      gameKey: headers.data['x-game-key'],
      label: headers.data['x-save-label'] ?? 'Snapshot',
      checksum: headers.data['x-save-checksum'],
      bytes: body,
      revision: headers.data['x-save-revision'] === undefined ? undefined : Number(headers.data['x-save-revision']),
    });
    if (!created.ok) {
      if (created.reason === 'too-large') {
        throw new AppError(413, 'payload_too_large', 'Save demasiado grande.');
      }
      if (created.reason === 'bad-key') {
        throw errors.invalidRequest('Chave de jogo inválida.');
      }
      if (created.reason === 'bad-revision') {
        throw errors.invalidRequest('Revisão inválida.');
      }
      throw errors.internal('Não foi possível guardar o save.');
    }
    await audit(auditRepository, {
      actorId: actor.id,
      action: 'save.upload',
      entity: 'game',
      entityId: created.entry.gameKey,
    });
    return reply.status(201).send({ save: created.entry });
  });

  // Listar os meus saves (de um jogo, quando pedido).
  app.get('/api/v1/saves', async (request) => {
    const actor = requireAuth(request);
    const query = ListQuery.safeParse(request.query);
    if (!query.success) {
      throw errors.invalidRequest('Consulta inválida.');
    }
    const items = store.list(actor.id, query.data.game);
    return { items, total: items.length };
  });

  // Descarregar uma versão.
  app.get<{ Params: { id: string } }>('/api/v1/saves/:id', async (request, reply) => {
    const actor = requireAuth(request);
    const params = IdParam.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Id inválido.');
    }
    const entry = store.find(actor.id, params.data.id);
    if (entry === null) {
      // 404, não 403: um save que não é teu não existe para ti.
      throw errors.notFound('Save não encontrado.');
    }
    const bytes = store.read(actor.id, params.data.id);
    if (bytes === null) {
      throw errors.notFound('Arquivo não encontrado.');
    }
    return reply
      .header('content-type', 'application/gzip')
      .header('content-disposition', `attachment; filename="save-${entry.id}.tar.gz"`)
      .header('x-save-revision', String(entry.revision))
      .header('x-save-checksum', entry.checksum)
      .send(bytes);
  });

  // Apagar uma versão.
  app.delete<{ Params: { id: string } }>('/api/v1/saves/:id', async (request) => {
    const actor = requireAuth(request);
    const params = IdParam.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Id inválido.');
    }
    const removed = store.remove(actor.id, params.data.id);
    if (!removed) {
      throw errors.notFound('Save não encontrado.');
    }
    await audit(auditRepository, {
      actorId: actor.id,
      action: 'save.delete',
      entity: 'save',
    });
    return { ok: true };
  });
}
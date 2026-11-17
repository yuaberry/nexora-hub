import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/errorHandler.js';
import { pageMeta, parsePagination } from '../../lib/pagination.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Painel administrativo — esqueleto.
 *
 * A rota existe e a **guarda é do servidor**: sem o papel `admin`, a resposta
 * é `403`. Esconder a entrada na navegação é conveniência, não segurança.
 *
 * As **leituras não são auditadas** (D22): auditar o *polling* de um painel
 * transformaria o registo de auditoria em ruído. O que o administrador
 * consultou continua rastreável pelo `requestId` de cada resposta.
 */
export function registerAdminRoutes(app: FastifyInstance, repositories: Repositories): void {
  app.get('/api/v1/admin/overview', async (request, reply) => {
    requireRole('admin')(request);

    const [users, audits] = await Promise.all([
      repositories.users.countAll(),
      repositories.audit.list({ limit: 1, offset: 0 }),
    ]);

    return reply.code(200).send({
      overview: {
        users,
        auditEntries: audits.total,
        mode: repositories.mode,
      },
    });
  });

  app.get('/api/v1/admin/audit', async (request, reply) => {
    requireRole('admin')(request);
    const query = parsePagination(request.query as Record<string, unknown>);
    const { items, total } = await repositories.audit.list(query);
    return reply.code(200).send({
      items: items.map((entry) => ({
        id: entry.id,
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        requestId: entry.requestId,
        createdAt: entry.createdAt.toISOString(),
      })),
      page: pageMeta(total, query),
    });
  });
}
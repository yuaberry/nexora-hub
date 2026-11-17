import type { FastifyInstance } from 'fastify';
import type { GameSession } from '@nexora/protocol';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import { pageMeta, parsePagination } from '../../lib/pagination.js';
import type { PlaySessionRecord, Repositories } from '../../repositories/types.js';
import { z } from 'zod';

/**
 * Sessões de jogo — o tempo jogado.
 *
 * A sessão nasce em `POST /sessions` (o utilizador carregou em **Jogar**) e
 * termina em `POST /sessions/:id/end` com o **código de saída** do executável.
 * Um código diferente de zero é um *crash*: fica registado e a interface
 * mostra-o, em vez de o apresentar como um encerramento normal.
 */

/** Converte o registo na vista do contrato. */
export function toGameSession(record: PlaySessionRecord): GameSession {
  return {
    id: record.id,
    gameId: record.gameId,
    state: record.state,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt === null ? null : record.endedAt.toISOString(),
    durationSeconds: record.durationSeconds,
    exitCode: record.exitCode,
    crashed: record.exitCode !== null && record.exitCode !== 0,
  };
}

/** Validação do corpo de início e de fim de sessão. */
const sessionStartSchema = z.object({
  gameId: z.string().trim().min(1, 'Jogo em falta.').max(120, 'Identificador demasiado longo.'),
});

const sessionEndSchema = z.object({
  exitCode: z.number().int().min(-1).max(2_147_483_647).optional(),
});

/** Regista as rotas de sessões. */
export function registerSessionRoutes(app: FastifyInstance, repositories: Repositories): void {
  app.post('/api/v1/sessions', async (request, reply) => {
    const user = requireAuth(request);
    const input = sessionStartSchema.parse(request.body);
    const record = await repositories.sessions.start(user.id, input.gameId);

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'session.start',
      entity: 'game_session',
      entityId: record.id,
      metadata: { gameId: input.gameId },
      requestId: request.id,
    });

    return reply.code(201).send({ session: toGameSession(record) });
  });

  app.post('/api/v1/sessions/:id/end', async (request, reply) => {
    const user = requireAuth(request);
    const params = request.params as { id?: string };
    if (params.id === undefined) {
      throw errors.invalidRequest('Identificador em falta.');
    }
    const input = sessionEndSchema.parse(request.body);

    const endedAt = new Date();
    const record = await repositories.sessions.end(user.id, params.id, {
      endedAt,
      exitCode: input.exitCode ?? 0,
    });
    if (record === null) {
      throw errors.notFound();
    }

    // O tempo jogado do jogo é a soma das sessões: fechar uma sessão soma a
    // duração ao total da entrada da biblioteca (quando ela existe).
    await repositories.library.addPlayedSeconds(user.id, record.gameId, record.durationSeconds, endedAt);

    await audit(repositories.audit, {
      actorId: user.id,
      action: 'session.end',
      entity: 'game_session',
      entityId: record.id,
      metadata: { gameId: record.gameId, durationSeconds: record.durationSeconds, exitCode: record.exitCode },
      requestId: request.id,
    });

    const matching = await repositories.library.findByExternalKey(user.id, record.gameId);

    return reply.code(200).send({
      session: toGameSession(record),
      lastPlayedAt: matching?.lastPlayedAt?.toISOString() ?? null,
    });
  });

  app.get('/api/v1/sessions', async (request, reply) => {
    const user = requireAuth(request);
    const query = parsePagination(request.query as Record<string, unknown>);
    const { items, total } = await repositories.sessions.list(user.id, query);
    return reply.code(200).send({
      items: items.map((record) => toGameSession(record)),
      page: pageMeta(total, query),
    });
  });
}
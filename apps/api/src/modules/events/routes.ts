import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canCancel, canJoin, MAX_EVENT_CAPACITY } from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { pageMeta } from '../../lib/pagination.js';
import type { EventRecord, Repositories } from '../../repositories/types.js';

/**
 * Eventos — encontros marcados pela comunidade.
 *
 * As regras vivem no domínio (`@nexora/core/community/events`): a lotação é
 * aplicada, um evento que já começou não aceita entradas, e cancelar é do
 * anfitrião. A API carrega o estado, aplica a regra e persiste.
 *
 * Um evento de clã exige que quem cria seja do clã (dono ou oficial) — a
 * pertença é lida do repositório de clãs, não do cliente.
 */

/** Limites declarados. */
const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_PAGE_LIMIT = 50;

/** Corpo da criação. */
const CreateEventBody = z.object({
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  startsAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(MAX_EVENT_CAPACITY),
  clanId: z.string().uuid().nullable().optional(),
});

/** Corpo da participação. */
const AttendanceBody = z.object({ status: z.enum(['going', 'interested', 'maybe']) });

/** Parâmetro do evento. */
const EventParams = z.object({ eventId: z.string().uuid() });

/** O evento na forma que o domínio espera (datas em ISO). */
function toDomainEvent(event: EventRecord) {
  return { ...event, startsAt: event.startsAt.toISOString(), createdAt: event.createdAt.toISOString() };
}

/** Vista de um evento. */
function eventView(event: EventRecord): Record<string, unknown> {
  return {
    id: event.id,
    clanId: event.clanId,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    capacity: event.capacity,
    goingCount: event.goingCount,
    hostId: event.hostId,
    cancelled: event.cancelled,
    createdAt: event.createdAt.toISOString(),
  };
}

/** Regista as rotas dos eventos. */
export function registerEventRoutes(app: FastifyInstance, repositories: Repositories): void {
  // ---- Criar e listar -----------------------------------------------

  app.post('/api/v1/events', async (request, reply) => {
    const actor = requireAuth(request);
    const body = CreateEventBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Título, início e lotação (1–100) são obrigatórios.');
    }
    // Um evento de clã exige pertença com poderes (dono ou oficial).
    if (body.data.clanId !== undefined && body.data.clanId !== null) {
      const membership = await repositories.clans.membership(body.data.clanId, actor.id);
      if (membership === null || (membership.role !== 'owner' && membership.role !== 'officer')) {
        throw errors.notFound('Clã não encontrado.');
      }
    }
    const created = await repositories.events.create({
      clanId: body.data.clanId ?? null,
      title: body.data.title,
      description: body.data.description ?? '',
      startsAt: new Date(body.data.startsAt),
      capacity: body.data.capacity,
      hostId: actor.id,
    });
    if (!created.ok) {
      if (created.reason === 'past-start') {
        throw errors.invalidRequest('O evento tem de começar no futuro.');
      }
      throw errors.invalidRequest('Lotação inválida.');
    }
    reply.status(201);
    return { event: eventView(created.event) };
  });

  app.get('/api/v1/events', async (request) => {
    const query = request.query as Record<string, unknown>;
    const limit = Number(query['limit'] ?? 20);
    const offset = Number(query['offset'] ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT || !Number.isInteger(offset) || offset < 0) {
      throw errors.invalidRequest('Consulta inválida.', [
        { path: 'limit', message: `Esperado um inteiro entre 1 e ${MAX_PAGE_LIMIT}.`, code: 'invalid_value' },
      ]);
    }
    const rows = await repositories.events.listUpcoming(limit, offset);
    return {
      items: rows.map(eventView),
      page: pageMeta(rows.length, { limit, offset }),
      hasMore: rows.length === limit,
    };
  });

  // ---- Um evento e as participações ---------------------------------

  app.get<{ Params: { eventId: string } }>('/api/v1/events/:eventId', async (request) => {
    const params = EventParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Evento inválido.');
    }
    const event = await repositories.events.findById(params.data.eventId);
    if (event === null) {
      throw errors.notFound('Evento não encontrado.');
    }
    const participants = await repositories.events.participants(event.id);
    return {
      event: eventView(event),
      participants: participants.map((row) => ({
        userId: row.userId,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { eventId: string } }>('/api/v1/events/:eventId/attendance', async (request) => {
    const actor = requireAuth(request);
    const params = EventParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Evento inválido.');
    }
    const body = AttendanceBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Estado inválido (going, interested ou maybe).');
    }
    const event = await repositories.events.findById(params.data.eventId);
    if (event === null) {
      throw errors.notFound('Evento não encontrado.');
    }
    // A regra vive no domínio: cancelado, começado ou cheio não aceita.
    if (!canJoin(toDomainEvent(event), new Date().toISOString())) {
      throw errors.forbidden('Este evento não aceita mais entradas (cheio, começado ou cancelado).');
    }
    const ok = await repositories.events.setParticipation(event.id, actor.id, body.data.status);
    if (!ok) {
      throw errors.forbidden('Este evento não aceita mais entradas (cheio, começado ou cancelado).');
    }
    return { ok: true, status: body.data.status };
  });

  app.delete<{ Params: { eventId: string } }>('/api/v1/events/:eventId/attendance', async (request, reply) => {
    const actor = requireAuth(request);
    const params = EventParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Evento inválido.');
    }
    const removed = await repositories.events.setParticipation(params.data.eventId, actor.id, null);
    if (!removed) {
      throw errors.notFound('Participação não encontrada.');
    }
    reply.status(204);
    return null;
  });

  app.post<{ Params: { eventId: string } }>('/api/v1/events/:eventId/cancel', async (request) => {
    const actor = requireAuth(request);
    const params = EventParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Evento inválido.');
    }
    const event = await repositories.events.findById(params.data.eventId);
    // 404, não 403: cancelar um evento que não é teu não existe para ti.
    if (event === null || !canCancel(toDomainEvent(event), actor.id)) {
      throw errors.notFound('Evento não encontrado.');
    }
    await repositories.events.cancel(event.id, actor.id);
    return { ok: true };
  });
}
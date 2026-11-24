import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type {
  EventCreation,
  EventParticipantRecord,
  EventRecord,
  EventRepository,
} from './types.js';

/**
 * Eventos em PostgreSQL.
 *
 * A contagem de confirmados é recalculada a partir das participações na mesma
 * instrução que muda a pertença — não há número que possa mentir. Cancelar é
 * do anfitrião (filtrado no `where`), e um evento cancelado não aceita mais
 * nada.
 */

const { eventParticipants, events } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Converte uma linha do banco no registo do domínio. */
function toEvent(row: typeof events.$inferSelect): EventRecord {
  return {
    id: row.id,
    clanId: row.clanId,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    capacity: row.capacity,
    hostId: row.hostId,
    goingCount: row.goingCount,
    cancelled: row.cancelled,
    createdAt: row.createdAt,
  };
}

/** Converte uma linha do banco no registo do domínio. */
function toParticipant(row: typeof eventParticipants.$inferSelect): EventParticipantRecord {
  return {
    eventId: row.eventId,
    userId: row.userId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** Eventos em PostgreSQL. */
export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    clanId: string | null;
    title: string;
    description: string;
    startsAt: Date;
    capacity: number;
    hostId: string;
  }): Promise<EventCreation> {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      return { ok: false, reason: 'capacity-invalid' };
    }
    if (input.startsAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'past-start' };
    }
    const rows = await this.db
      .insert(events)
      .values({
        clanId: input.clanId,
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        capacity: input.capacity,
        hostId: input.hostId,
        goingCount: 0,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('O evento não foi devolvido pelo banco.');
    }
    return { ok: true, event: toEvent(row) };
  }

  async listUpcoming(limit: number, offset: number): Promise<readonly EventRecord[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(sql`${events.startsAt} >= now() and ${events.cancelled} = false`)
      .orderBy(asc(events.startsAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toEvent);
  }

  async findById(eventId: string): Promise<EventRecord | null> {
    const rows = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toEvent(row);
  }

  async participants(eventId: string): Promise<readonly EventParticipantRecord[]> {
    const rows = await this.db
      .select()
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.createdAt));
    return rows.map(toParticipant);
  }

  async participation(eventId: string, userId: string): Promise<EventParticipantRecord | null> {
    const rows = await this.db
      .select()
      .from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toParticipant(row);
  }

  async setParticipation(eventId: string, userId: string, status: 'going' | 'interested' | 'maybe' | null): Promise<boolean> {
    const event = await this.findById(eventId);
    if (event === null || event.cancelled) {
      return false;
    }
    const previous = await this.participation(eventId, userId);
    if (status === null) {
      if (previous === null) {
        return false;
      }
      await this.db
        .delete(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)));
      await this.recount(eventId);
      return true;
    }
    if (status === 'going' && previous?.status !== 'going' && event.goingCount >= event.capacity) {
      return false;
    }
    await this.db
      .insert(eventParticipants)
      .values({ eventId, userId, status })
      .onConflictDoUpdate({
        target: [eventParticipants.eventId, eventParticipants.userId],
        set: { status },
      });
    await this.recount(eventId);
    return true;
  }

  async cancel(eventId: string, hostId: string): Promise<boolean> {
    const rows = await this.db
      .update(events)
      .set({ cancelled: true })
      .where(and(eq(events.id, eventId), eq(events.hostId, hostId), eq(events.cancelled, false)))
      .returning({ id: events.id });
    return rows.length > 0;
  }

  /** Recalcula os confirmados a partir das participações. */
  private async recount(eventId: string): Promise<void> {
    await this.db
      .update(events)
      .set({
        goingCount: sql`(select count(*) from ${eventParticipants} where ${eventParticipants.eventId} = ${eventId} and ${eventParticipants.status} = 'going')`,
      })
      .where(eq(events.id, eventId));
  }
}
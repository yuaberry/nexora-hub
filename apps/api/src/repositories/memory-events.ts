import { randomUUID } from 'node:crypto';
import type {
  EventCreation,
  EventParticipantRecord,
  EventRecord,
  EventRepository,
} from './types.js';

/**
 * Eventos em memória — encontros e participantes.
 *
 * A contagem de confirmados vive no evento e é reescrita pelas operações que
 * mexem nas participações: entrar como `going` soma, mudar para
 * `interested` subtrai, sair liberta — a contagem nunca mente.
 */
export class MemoryEventRepository implements EventRepository {
  private readonly eventRows = new Map<string, EventRecord>();
  private readonly participantRows = new Map<string, EventParticipantRecord>();

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
    const event: EventRecord = {
      id: randomUUID(),
      clanId: input.clanId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      capacity: input.capacity,
      hostId: input.hostId,
      goingCount: 0,
      cancelled: false,
      createdAt: new Date(),
    };
    this.eventRows.set(event.id, event);
    return { ok: true, event };
  }

  async listUpcoming(limit: number, offset: number): Promise<readonly EventRecord[]> {
    const now = Date.now();
    return [...this.eventRows.values()]
      .filter((event) => event.startsAt.getTime() >= now)
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
      .slice(offset, offset + limit);
  }

  async findById(eventId: string): Promise<EventRecord | null> {
    return this.eventRows.get(eventId) ?? null;
  }

  async participants(eventId: string): Promise<readonly EventParticipantRecord[]> {
    return [...this.participantRows.values()]
      .filter((row) => row.eventId === eventId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async participation(eventId: string, userId: string): Promise<EventParticipantRecord | null> {
    return this.participantRows.get(participantKey(eventId, userId)) ?? null;
  }

  async setParticipation(eventId: string, userId: string, status: 'going' | 'interested' | 'maybe' | null): Promise<boolean> {
    const event = this.eventRows.get(eventId);
    if (event === undefined || event.cancelled) {
      return false;
    }
    const previous = this.participantRows.get(participantKey(eventId, userId));
    if (status === null) {
      if (previous === undefined) {
        return false;
      }
      this.participantRows.delete(participantKey(eventId, userId));
      return this.rewrite(event, previous.status, null);
    }
    if (status === 'going' && previous?.status !== 'going' && event.goingCount >= event.capacity) {
      // A lotação conta só os confirmados: quem está interessado ocupa lugar
      // de coração, não de cadeira.
      return false;
    }
    const record: EventParticipantRecord = {
      eventId,
      userId,
      status,
      createdAt: previous?.createdAt ?? new Date(),
    };
    this.participantRows.set(participantKey(eventId, userId), record);
    return this.rewrite(event, previous?.status ?? null, status);
  }

  async cancel(eventId: string, hostId: string): Promise<boolean> {
    const event = this.eventRows.get(eventId);
    if (event === undefined || event.hostId !== hostId || event.cancelled) {
      return false;
    }
    this.eventRows.set(eventId, { ...event, cancelled: true });
    return true;
  }

  /** Recalcula os confirmados a partir da mudança de estado. */
  private rewrite(event: EventRecord, from: string | null, to: string | null): boolean {
    let goingCount = event.goingCount;
    if (from === 'going') {
      goingCount -= 1;
    }
    if (to === 'going') {
      goingCount += 1;
    }
    const updated: EventRecord = { ...event, goingCount: Math.max(0, goingCount) };
    this.eventRows.set(event.id, updated);
    return true;
  }
}

/** Chave composta da participação. */
function participantKey(eventId: string, userId: string): string {
  return `${eventId}::${userId}`;
}

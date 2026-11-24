import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema dos eventos — encontros marcados e participantes.
 *
 * Duas regras que o esquema impõe:
 *
 * - a participação é **uma por evento e utilizador** (chave primária
 *   composta) — mudar de estado substitui, não duplica;
 * - a lotação e os confirmados vivem no evento: entram e saem escrevem as
 *   duas coisas pela mesma operação (a contagem nunca mente).
 */

/** Eventos. */
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** O clã que organiza (`null` para um evento da comunidade). */
  clanId: uuid('clan_id'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  capacity: integer('capacity').notNull(),
  hostId: uuid('host_id').notNull(),
  goingCount: integer('going_count').notNull().default(0),
  cancelled: boolean('cancelled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Participações (uma por evento e utilizador). */
export const eventParticipants = pgTable('event_participants', {
  eventId: uuid('event_id').notNull(),
  userId: uuid('user_id').notNull(),
  /** `going`, `interested` ou `maybe`. */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema social — amizades e presença.
 *
 * Uma amizade vive em **duas linhas** (uma em cada estado): remover apaga as
 * duas, e nenhum dos lados fica com um amigo fantasma. A presença tem
 * validade (`expires_at`): um coração que pára de bater deixa o utilizador
 * offline sem que ninguém tenha de o declarar — é o TTL do domínio, gravado.
 */

/** Pedidos de amizade. */
export const friendRequests = pgTable('friend_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUserId: uuid('from_user_id').notNull(),
  toUserId: uuid('to_user_id').notNull(),
  /** `pending`, `accepted`, `declined` ou `cancelled`. */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
});

/**
 * Amizades estabelecidas — uma linha por lado.
 *
 * O par (utilizador, amigo) é a chave primária: aceitar duas vezes não
 * duplica, e remover é pelo par.
 */
export const friendships = pgTable('friendships', {
  userId: uuid('user_id').notNull(),
  friendId: uuid('friend_id').notNull(),
  since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.friendId] }),
]);

/** Presença — o último coração de cada utilizador, com validade. */
export const presence = pgTable('presence', {
  userId: uuid('user_id').primaryKey(),
  /** Jogo em curso, ou `null` quando não está a jogar. */
  gameId: text('game_id'),
  /** ISO-8601 UTC do último heartbeat. */
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** ISO-8601 UTC em que o registo deixa de valer. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
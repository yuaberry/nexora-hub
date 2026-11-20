import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Lista de desejos.
 *
 * O par (utilizador, jogo) é a chave primária: adicionar duas vezes não
 * duplica, e a remoção é pelo par — nunca por um identificador solto.
 */
export const wishlists = pgTable(
  'wishlists',
  {
    userId: uuid('user_id').notNull(),
    gameId: text('game_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId] }),
  ],
);
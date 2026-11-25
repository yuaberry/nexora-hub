import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema das capturas na nuvem — os momentos que o utilizador guardou.
 *
 * O ficheiro (PNG) vive no disco do servidor; a base guarda o índice (quem,
 * que jogo, que nome, que tamanho). Apagar é do dono — a captura de outro
 * utilizador devolve 404, nunca 403.
 */

/** Capturas na nuvem. */
export const screenshots = pgTable('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  gameKey: text('game_key').notNull(),
  fileName: text('file_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

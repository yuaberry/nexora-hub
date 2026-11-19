import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema da comunidade — comentários e reviews.
 *
 * Duas regras que o esquéma impõe:
 *
 * - um comentário é de quem o escreveu (o `userId` dono) — apagar o de outro
 *   devolve `404`, nunca `403` (não confirma existência);
 * - uma review é **uma por utilizador e jogo** (upsert): índice único
 *   `(gameId, userId)`. A nota é 1–10, validada na rota, e as categorias são
 *   opcionais — uma review sem categoria não é inválida, é incompleta.
 */

/** Comentários num jogo. */
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: text('game_id').notNull(),
  userId: uuid('user_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Reviews de um jogo (uma por utilizador). */
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: text('game_id').notNull(),
  userId: uuid('user_id').notNull(),
  /** Nota global de 1 a 10. */
  rating: integer('rating').notNull(),
  /** Categorias opcionais, cada uma de 1 a 10. */
  story: integer('story'),
  gameplay: integer('gameplay'),
  graphics: integer('graphics'),
  sound: integer('sound'),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Uma review por utilizador e jogo: é o que permite o *upsert* sem duplicar
  // linhas nem precisar de lógica de "existe?" antes de escrever.
  uniqueIndex('reviews_game_user_unique').on(table.gameId, table.userId),
]);
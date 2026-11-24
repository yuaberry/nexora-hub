import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema dos fóruns — tópicos e respostas.
 *
 * Duas regras que o esquema impõe:
 *
 * - um tópico tem **autor dono**: fechá-lo ou apagá-lo é direito dele (a rota
 *   devolve `404` para os outros, nunca `403`);
 * - a última actividade e a contagem de respostas vivem no tópico — a ordem
 *   da lista é uma consulta, não um cálculo em memoria a cada pedido.
 */

/** Tópicos de um jogo. */
export const threads = pgTable('threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: text('game_id').notNull(),
  authorId: uuid('author_id').notNull(),
  title: text('title').notNull(),
  /** O corpo da primeira mensagem (a pergunta). */
  body: text('body').notNull(),
  replyCount: integer('reply_count').notNull().default(0),
  /** Fechado pelo autor: só ele responde. */
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Respostas dentro de um tópico. */
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull(),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
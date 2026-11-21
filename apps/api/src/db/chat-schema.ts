import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema do chat — conversas directas e mensagens.
 *
 * Um par de participantes tem **uma** conversa: o índice único em
 * (usuario_a, usuario_b) garante que mandar segunda mensagem à mesma pessoa
 * continua na mesma conversa. A ordem do par é normalizada (o id menor
 * primeiro) para que (ana, bruno) e (bruno, ana) sejam a mesma linha.
 */

/** Uma conversa directa. */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** O participante de id menor (a ordem é normalizada). */
  userIdA: uuid('user_id_a').notNull(),
  /** O participante de id maior. */
  userIdB: uuid('user_id_b').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  /** Excerto da última mensagem (para a lista não precisar de a ler). */
  lastMessageExcerpt: text('last_message_excerpt'),
}, (table) => [
  // Um par, uma conversa — em qualquer direcção.
  uniqueIndex('conversations_pair_unique').on(table.userIdA, table.userIdB),
]);

/** Uma mensagem. */
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull(),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema dos cosméticos — o que os pontos compraram e o que está à vista.
 *
 * Duas regras que o esquema impõe:
 *
 * - um cosmético comprado é **uma linha** por utilizador (a chave primária é
 *   o par): comprar duas vezes o mesmo é impossível, e os pontos só saem uma
 *   vez — a regra do domínio e a restrição da base dizem o mesmo;
 * - o que está equipado é **uma linha por tipo**: trocar o selo substitui o
 *   anterior, e ficar sem selo algum apaga a linha — nunca dois selos ao
 *   mesmo tempo.
 */

/** Cosméticos comprados por cada utilizador. */
export const userCosmetics = pgTable('user_cosmetics', {
  userId: uuid('user_id').notNull(),
  cosmeticId: text('cosmetic_id').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.cosmeticId] }),
]);

/** O cosmético equipado, por tipo (um de cada). */
export const userCosmeticEquipped = pgTable('user_cosmetic_equipped', {
  userId: uuid('user_id').notNull(),
  /** O tipo de cosmético (`badge`). */
  kind: text('kind').notNull(),
  cosmeticId: text('cosmetic_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.kind] }),
]);
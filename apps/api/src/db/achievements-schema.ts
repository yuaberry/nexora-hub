import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema das conquistas e dos pontos.
 *
 * Duas regras que o esquema impõe:
 *
 * - uma conquista desbloqueada é **uma linha** por utilizador (a chave
 *   primária é o par): desbloquear duas vezes não duplica, e a contagem
 *   global de quantos jogadores a têm sai daqui — não de um número estimado;
 * - os pontos são um **livro de elaboração** (*ledger*) só de AcresCentos: o
 *   saldo é a soma das entradas, nunca um campo guardado, e por isso não pode
 *   divergir do que aconteceu.
 */

/** Conquistas desbloqueadas por cada utilizador. */
export const userAchievements = pgTable('user_achievements', {
  userId: uuid('user_id').notNull(),
  achievementId: text('achievement_id').notNull(),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.achievementId] }),
]);

/** Uma entrada do livro de pontos. */
export const pointEntries = pgTable('point_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  /** Pontos ganhos (sempre positivo: pontos não se gastam nesta fase). */
  delta: integer('delta').notNull(),
  /** Motivo declarado (`achievement.ten-hours`, …). */
  reason: text('reason').notNull(),
  /** Identificador da entidade que deu os pontos (a conquista). */
  entityId: text('entity_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

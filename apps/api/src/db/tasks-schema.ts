import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema das reclamações de tarefas — o que já foi pago.
 *
 * Uma reclamação é uma por utilizador, tarefa e **período** (o dia ou a
 * semana ISO): a chave primária composta é o que impede o pagamento em
 * duplicado sem precisar de lógica de "já existe?" antes de escrever.
 */

/** Reclamações de tarefas. */
export const taskClaims = pgTable('task_claims', {
  userId: uuid('user_id').notNull(),
  taskId: text('task_id').notNull(),
  /** A chave do período (`2026-11-25` para o dia, `2026-W47` para a semana). */
  periodKey: text('period_key').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
});

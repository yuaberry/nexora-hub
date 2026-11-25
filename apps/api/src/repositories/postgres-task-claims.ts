import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { TaskClaimRepository } from './types.js';

/**
 * Reclamações de tarefas em PostgreSQL.
 *
 * A chave primária composta (utilizador, tarefa, período) faz o trabalho:
 * inserir duas vezes no mesmo período não duplica — e o `onConflictDoNothing`
 * devolve zero linhas quando já estava paga.
 */

const { taskClaims } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Reclamações em PostgreSQL. */
export class PostgresTaskClaimRepository implements TaskClaimRepository {
  constructor(private readonly db: Db) {}

  async claim(userId: string, taskId: string, periodKey: string): Promise<boolean> {
    const rows = await this.db
      .insert(taskClaims)
      .values({ userId, taskId, periodKey })
      .onConflictDoNothing()
      .returning({ taskId: taskClaims.taskId });
    return rows.length > 0;
  }

  async listPeriod(userId: string, periodKeys: readonly string[]): Promise<readonly string[]> {
    if (periodKeys.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ taskId: taskClaims.taskId, periodKey: taskClaims.periodKey })
      .from(taskClaims)
      .where(and(eq(taskClaims.userId, userId), inArray(taskClaims.periodKey, [...periodKeys])));
    return rows.map((row) => `${row.taskId}::${row.periodKey}`);
  }
}

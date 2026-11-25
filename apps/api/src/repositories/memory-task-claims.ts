import type { TaskClaimRepository } from './types.js';

/**
 * Reclamações de tarefas em memória — o que já foi pago.
 *
 * A chave composta (utilizador, tarefa, período) vive no mapa: reclamar duas
 * vezes no mesmo período devolve `false` — o saldo não é pago em duplicado.
 */
export class MemoryTaskClaimRepository implements TaskClaimRepository {
  private readonly rows = new Set<string>();

  async claim(userId: string, taskId: string, periodKey: string): Promise<boolean> {
    const key = `${userId}::${taskId}::${periodKey}`;
    if (this.rows.has(key)) {
      return false;
    }
    this.rows.add(key);
    return true;
  }

  async listPeriod(userId: string, periodKeys: readonly string[]): Promise<readonly string[]> {
    const wanted = new Set(periodKeys);
    const claimed: string[] = [];
    for (const key of this.rows) {
      const [owner, taskId, period] = key.split('::');
      if (owner === userId && period !== undefined && wanted.has(period)) {
        claimed.push(`${taskId}::${period}`);
      }
    }
    return claimed;
  }
}

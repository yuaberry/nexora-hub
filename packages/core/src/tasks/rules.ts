/**
 * Tarefas — desafios com regras declaradas.
 *
 * Uma tarefa é um objectivo com uma **medida real** por trás: jogar X minutos,
 * lançar Y jogos, jogar Z horas num dia. O prémio são pontos — e os pontos
 * passam pela mesma trilha auditada das conquistas (nada de saldo solto).
 *
 * Tudo aqui é puro: as regras correm sem tocar na base nem no relógio.
 */

/** A cadência de uma tarefa. */
export type TaskCadence = 'daily' | 'weekly';

/** A medida de uma tarefa (o que conta o progresso). */
export type TaskMetric = 'play-seconds' | 'games-launched' | 'distinct-games';

/** Uma tarefa declarada. */
export interface TaskDefinition {
  readonly id: string;
  /** Chave de tradução do nome. */
  readonly nameKey: string;
  readonly cadence: TaskCadence;
  readonly metric: TaskMetric;
  /** O valor a atingir (segundos, lançamentos ou jogos distintos). */
  readonly target: number;
  /** Pontos atribuídos ao completar. */
  readonly reward: number;
}

/** As tarefas do launcher — declaradas, uma a uma. */
export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    id: 'daily-play',
    nameKey: 'task.dailyPlay.name',
    cadence: 'daily',
    metric: 'play-seconds',
    target: 3_600,
    reward: 10,
  },
  {
    id: 'daily-launch',
    nameKey: 'task.dailyLaunch.name',
    cadence: 'daily',
    metric: 'games-launched',
    target: 1,
    reward: 5,
  },
  {
    id: 'weekly-distinct',
    nameKey: 'task.weeklyDistinct.name',
    cadence: 'weekly',
    metric: 'distinct-games',
    target: 3,
    reward: 25,
  },
];

/** O progresso numa tarefa. */
export interface TaskProgress {
  readonly definition: TaskDefinition;
  /** O valor medido (segundos, lançamentos ou jogos distintos). */
  readonly value: number;
  /** A tarefa está completa? */
  readonly complete: boolean;
  /** A fracação do caminho (0–1). */
  readonly fraction: number;
}

/**
 * Avalia o progresso de uma tarefa a partir das medidas do período.
 *
 * A fracção é `valor / alvo`, limitada a 1 — uma tarefa completa não passa de
 * 100%, e uma medida que passa o alvo completa-a sem exagero.
 */
export function evaluateTask(definition: TaskDefinition, value: number): TaskProgress {
  const measured = Math.max(0, value);
  return {
    definition,
    value: measured,
    complete: measured >= definition.target,
    fraction:
      definition.target <= 0 ? 1 : Math.min(1, measured / definition.target),
  };
}

/**
 * Os pontos de uma lista de progressos (o que se pode reclamar).
 *
 * Só o que está **completo** conta — uma tarefa a 90% não paga metade.
 */
export function pendingPoints(progress: readonly TaskProgress[]): number {
  return progress.filter((task) => task.complete).reduce((total, task) => total + task.definition.reward, 0);
}
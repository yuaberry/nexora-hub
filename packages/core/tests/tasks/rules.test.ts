import { describe, expect, it } from 'vitest';
import {
  evaluateTask,
  pendingPoints,
  TASK_DEFINITIONS,
  type TaskDefinition,
} from '../../src/tasks/rules.js';

/**
 * Tarefas — a medida, o completo e o prémio.
 */
function def(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 't',
    nameKey: 'task.t.name',
    cadence: 'daily',
    metric: 'play-seconds',
    target: 100,
    reward: 10,
    ...overrides,
  };
}

describe('evaluateTask', () => {
  it('a fracção é o caminho até ao alvo', () => {
    const progresso = evaluateTask(def(), 40);
    expect(progresso.value).toBe(40);
    expect(progresso.complete).toBe(false);
    expect(progresso.fraction).toBeCloseTo(0.4);
  });

  it('completa ao atingir o alvo (e não passa de 100%)', () => {
    expect(evaluateTask(def(), 100).complete).toBe(true);
    expect(evaluateTask(def(), 500).fraction).toBe(1);
  });

  it('uma medida negativa não existe', () => {
    expect(evaluateTask(def(), -10).value).toBe(0);
  });
});

describe('pendingPoints', () => {
  it('só o completo paga', () => {
    const progressos = [evaluateTask(def(), 50), evaluateTask(def({ reward: 7 }), 200)];
    expect(pendingPoints(progressos)).toBe(7);
  });

  it('nada completo não paga nada', () => {
    expect(pendingPoints([evaluateTask(def(), 10)])).toBe(0);
  });
});

describe('TASK_DEFINITIONS', () => {
  it('declaradas com prémio e alvo', () => {
    expect(TASK_DEFINITIONS.length).toBeGreaterThanOrEqual(3);
    for (const task of TASK_DEFINITIONS) {
      expect(task.target).toBeGreaterThan(0);
      expect(task.reward).toBeGreaterThan(0);
    }
  });
});

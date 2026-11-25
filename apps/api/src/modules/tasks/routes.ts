import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  evaluateTask,
  pendingPoints,
  TASK_DEFINITIONS,
  type TaskCadence,
  type TaskMetric,
  type TaskProgress,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { PlaySessionRecord, Repositories } from '../../repositories/types.js';

/**
 * Tarefas — desafios por período, com pontos auditados.
 *
 * As medidas são **reais** (as sessões do utilizador) e o período é o dia ou
 * a semana ISO. Reclamar paga os pontos pela mesma trilha das conquistas — e
 * a reclamação é uma por utilizador, tarefa e período.
 */

/** A chave do período (o dia, ou a semana ISO). */
function periodKey(cadence: TaskCadence, now: Date): string {
  if (cadence === 'daily') {
    return now.toISOString().slice(0, 10);
  }
  // Semana ISO: qui, 1 de janeiro de 2026 cai na semana 1.
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/** As medidas do utilizador num período. */
function measure(sessions: readonly PlaySessionRecord[], metric: TaskMetric, cadence: TaskCadence, key: string): number {
  const inPeriod = sessions.filter((session) => periodKey(cadence, session.startedAt) === key);
  switch (metric) {
    case 'play-seconds':
      return inPeriod.reduce((total, session) => total + Math.round(session.durationSeconds), 0);
    case 'games-launched':
      return inPeriod.length;
    case 'distinct-games':
      return new Set(inPeriod.map((session) => session.gameId)).size;
  }
}

/** O progresso das tarefas de um utilizador, com o que já foi reclamado. */
export async function taskProgress(
  repositories: Repositories,
  userId: string,
  now: Date,
): Promise<readonly (TaskProgress & { readonly claimed: boolean; readonly periodKey: string })[]> {
  const sessions = await repositories.sessions.listAllByUser(userId);
  const periods = TASK_DEFINITIONS.map((definition) => periodKey(definition.cadence, now));
  const claimed = new Set(await repositories.taskClaims.listPeriod(userId, periods));
  return TASK_DEFINITIONS.map((definition) => {
    const key = periodKey(definition.cadence, now);
    const value = measure(sessions, definition.metric, definition.cadence, key);
    return {
      ...evaluateTask(definition, value),
      claimed: claimed.has(`${definition.id}::${key}`),
      periodKey: key,
    };
  });
}

/** Regista as rotas das tarefas. */
export function registerTaskRoutes(app: FastifyInstance, repositories: Repositories): void {
  // O progresso (com o que já foi reclamado).
  app.get('/api/v1/tasks', async (request) => {
    const actor = requireAuth(request);
    const progress = await taskProgress(repositories, actor.id, new Date());
    return {
      items: progress.map((task) => ({
        id: task.definition.id,
        cadence: task.definition.cadence,
        metric: task.definition.metric,
        target: task.definition.target,
        reward: task.definition.reward,
        value: task.value,
        complete: task.complete,
        fraction: task.fraction,
        claimed: task.claimed,
        periodKey: task.periodKey,
      })),
      pending: pendingPoints(progress.filter((task) => task.complete && !task.claimed)),
    };
  });

  // Reclama os pontos de uma tarefa completa.
  app.post<{ Params: { taskId: string } }>('/api/v1/tasks/:taskId/claim', async (request) => {
    const actor = requireAuth(request);
    const params = z.object({ taskId: z.string().min(1).max(40) }).safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Tarefa inválida.');
    }
    const definition = TASK_DEFINITIONS.find((task) => task.id === params.data.taskId);
    if (definition === undefined) {
      throw errors.notFound('Tarefa não encontrada.');
    }
    const progress = await taskProgress(repositories, actor.id, new Date());
    const task = progress.find((entry) => entry.definition.id === definition.id);
    if (task === undefined || !task.complete) {
      throw errors.forbidden('A tarefa ainda não está completa.');
    }
    const claimed = await repositories.taskClaims.claim(actor.id, definition.id, task.periodKey);
    if (!claimed) {
      throw errors.conflict('Os pontos desta tarefa já foram reclamados neste período.');
    }
    await repositories.achievements.addPoints({
      userId: actor.id,
      delta: definition.reward,
      reason: `task:${definition.id}`,
      entityId: task.periodKey,
    });
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'task.claim',
      entity: 'task',
      entityId: `${definition.id}:${task.periodKey}`,
    });
    return { ok: true, awarded: definition.reward };
  });
}
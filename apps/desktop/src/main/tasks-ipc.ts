/**
 * IPC das tarefas — listar e reclamar.
 *
 * Os dados vêm da API (a medida é das sessões da conta); o renderer passa o
 * token da sessão e o processo principal reencaminha — nunca guarda
 * credenciais.
 */

import { ipcMain } from 'electron';
import { DEFAULT_API_BASE_URL } from './config.js';

/** Uma tarefa (vista do contrato da API). */
interface TaskItem {
  readonly id: string;
  readonly cadence: 'daily' | 'weekly';
  readonly metric: 'play-seconds' | 'games-launched' | 'distinct-games';
  readonly target: number;
  readonly reward: number;
  readonly value: number;
  readonly complete: boolean;
  readonly fraction: number;
  readonly claimed: boolean;
}

/** Regista os canais das tarefas. */
export function registerTasksIpc(): void {
  ipcMain.handle('tasks:list', async (_event, token: unknown): Promise<{
    readonly ok: boolean;
    readonly items: readonly TaskItem[];
    readonly pending?: number;
    readonly message?: string;
  }> => {
    if (typeof token !== 'string' || token === '') {
      return { ok: false, items: [], message: 'Sessão obrigatória.' };
    }
    try {
      const response = await fetch(`${DEFAULT_API_BASE_URL}/api/v1/tasks`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        return { ok: false, items: [], message: 'Sessão expirada.' };
      }
      const payload = (await response.json()) as { items?: unknown; pending?: unknown };
      const items = Array.isArray(payload.items) ? (payload.items as TaskItem[]) : [];
      const pending = typeof payload.pending === 'number' ? payload.pending : 0;
      return { ok: true, items, pending };
    } catch {
      return { ok: false, items: [], message: 'A API está inacessível.' };
    }
  });

  ipcMain.handle('tasks:claim', async (_event, taskId: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly awarded?: number;
    readonly message?: string;
  }> => {
    if (typeof taskId !== 'string' || taskId === '' || typeof token !== 'string' || token === '') {
      return { ok: false, message: 'Argumentos em falta.' };
    }
    try {
      const response = await fetch(`${DEFAULT_API_BASE_URL}/api/v1/tasks/${encodeURIComponent(taskId)}/claim`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { awarded?: unknown; error?: { message?: string } };
      if (!response.ok) {
        return { ok: false, message: payload.error?.message ?? 'Não foi possível reclamar.' };
      }
      return { ok: true, awarded: typeof payload.awarded === 'number' ? payload.awarded : 0 };
    } catch {
      return { ok: false, message: 'A API está inacessível.' };
    }
  });
}

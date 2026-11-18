
/**
 * IPC de saves — snapshots versionados.
 *
 * O renderer pede o jogo (chave externa), a pasta de saves e o rótulo; o
 * processo principal copia, regista e devolve o registo. A nuvem continua
 * `planned` — nada aqui finge sincronizar.
 */

import { app, ipcMain } from 'electron';
import type {
  SaveSnapshotView,
  SourceOperationResult,
} from '../shared/preload-api.js';
import { createSavesState, snapshotsRootFor, type SavesState } from './saves-state.js';
import type { LocalLibrary } from './db.js';

/** Regista os canais de saves; devolve o estado partilhado. */
export function registerSavesIpc(library: LocalLibrary): SavesState {
  // As cópias vivem no `userData` (o mesmo sítio da base local): nada de
  // snapshots em pastas temporárias que o sistema pode limpar.
  const state = createSavesState(library, snapshotsRootFor(app.getPath('userData')));

  ipcMain.handle('saves:create', async (_event, gameKey: unknown, savePath: unknown, label: unknown): Promise<SourceOperationResult> => {
    if (typeof gameKey !== 'string' || typeof savePath !== 'string') {
      return { ok: false, code: 'invalid', message: 'Jogo ou pasta de saves em falta.' };
    }
    const result = await state.create(gameKey, typeof label === 'string' ? label : 'Snapshot', savePath);
    if (!result.ok) {
      return { ok: false, code: 'create-failed', message: result.reason };
    }
    return { ok: true, sourceId: result.record.id, message: `Snapshot #${result.record.revision} criado.` };
  });

  ipcMain.handle('saves:list', (_event, gameKey: unknown): readonly SaveSnapshotView[] => {
    if (typeof gameKey !== 'string') {
      return [];
    }
    return state.list(gameKey).map((record) => ({
      id: record.id,
      label: record.label,
      createdAt: record.createdAt,
      sizeBytes: record.sizeBytes,
      revision: record.revision,
      checksum: record.checksum,
    }));
  });

  ipcMain.handle('saves:restore', (_event, snapshotId: unknown, savePath: unknown): SourceOperationResult => {
    if (typeof snapshotId !== 'string' || typeof savePath !== 'string') {
      return { ok: false, code: 'invalid', message: 'Snapshot ou pasta em falta.' };
    }
    const result = state.restore(snapshotId, savePath);
    if (!result.ok) {
      return { ok: false, code: 'restore-failed', message: result.reason ?? 'Restauração falhou.' };
    }
    return { ok: true, message: 'Save restaurado.' };
  });

  ipcMain.handle('saves:remove', (_event, gameKey: unknown, snapshotId: unknown): boolean => {
    if (typeof gameKey !== 'string' || typeof snapshotId !== 'string') {
      return false;
    }
    return state.remove(gameKey, snapshotId);
  });

  return state;
}

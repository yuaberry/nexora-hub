/**
 * IPC do otimizador — varre, limpa, restaura.
 *
 * O renderer pede; o processo principal apaga dentro da pasta do utilizador
 * e devolve o que fez. Nenhum caminho vem do renderer: os alvos são os do
 * catálogo, e o que não está no catálogo não se apaga.
 */

import { app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  applyClean,
  findGameMode,
  readHistory,
  restoreRun,
  scanTarget,
  writeHistory,
  type OptimizerRun,
} from './optimizer.js';
import type {
  OptimizerHistoryResult,
  OptimizerRunResult,
  OptimizerScanResult,
} from '../shared/preload-api.js';

/** Identificadores pedidos, filtrados (o que não é texto fica de fora). */
function targetIds(ids: unknown): readonly string[] {
  if (!Array.isArray(ids)) {
    return [];
  }
  return (ids as unknown[]).filter((id): id is string => typeof id === 'string');
}

/** Regista os canais do otimizador. */
export function registerOptimizerIpc(): void {
  // Varre os alvos pedidos (os que não existem dão zero, não erro).
  ipcMain.handle('optimizer:scan', async (_event, ids: unknown): Promise<OptimizerScanResult> => {
    const items = targetIds(ids).map((id) => scanTarget(id)).map((scan) => ({
      targetId: scan.targetId,
      fileCount: scan.fileCount,
      totalBytes: scan.totalBytes,
    }));
    return {
      ok: true,
      items,
      totalBytes: items.reduce((total, item) => total + item.totalBytes, 0),
      fileCount: items.reduce((total, item) => total + item.fileCount, 0),
    };
  });

  // Limpa os alvos pedidos e guarda a execução no histórico.
  ipcMain.handle('optimizer:clean', async (_event, ids: unknown): Promise<OptimizerRunResult> => {
    const scans = targetIds(ids).map((id) => scanTarget(id));
    const limpo = applyClean(scans);
    const run: OptimizerRun = {
      id: randomUUID(),
      at: new Date().toISOString(),
      freedBytes: limpo.freedBytes,
      removed: limpo.removed.map((finding) => finding.path),
      failures: limpo.failures.map((failure) => ({ path: failure.path, reason: failure.reason })),
      restored: false,
    };
    const dataDir = app.getPath('userData');
    writeHistory(dataDir, [run, ...readHistory(dataDir)]);
    return {
      ok: true,
      freedBytes: run.freedBytes,
      removed: run.removed.length,
      failures: run.failures.length,
      runId: run.id,
    };
  });

  // O histórico das execuções (com o ponto de restauro por execução).
  ipcMain.handle('optimizer:history', (): OptimizerHistoryResult => {
    const runs = readHistory(app.getPath('userData'));
    return {
      ok: true,
      runs: runs.map((run) => ({
        id: run.id,
        at: run.at,
        freedBytes: run.freedBytes,
        removed: run.removed.length,
        failures: run.failures.length,
        restored: run.restored,
      })),
    };
  });

  // Aplica o ponto de restauro (recria a estrutura; os ficheiros não voltam).
  ipcMain.handle(
    'optimizer:restore',
    async (_event, runId: unknown): Promise<{ readonly ok: boolean; readonly message?: string }> => {
      if (typeof runId !== 'string' || runId === '') {
        return { ok: false, message: 'Execução em falta.' };
      }
      const restaurado = restoreRun(app.getPath('userData'), runId);
      if (restaurado === null) {
        return { ok: false, message: 'Execução não encontrada ou já restaurada.' };
      }
      return { ok: true };
    },
  );

  // O GameMode está instalado? (diagnóstico honesto do tweak de arranque.)
  ipcMain.handle(
    'optimizer:gamemode',
    (): { readonly available: boolean; readonly path: string | null } => {
      const path = findGameMode();
      return { available: path !== null, path };
    },
  );
}
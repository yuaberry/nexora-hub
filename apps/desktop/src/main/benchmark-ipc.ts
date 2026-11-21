/**
 * IPC do benchmark — correr as cargas e ler o histórico.
 *
 * Canal fino: o renderer pede, o processo principal corre as cargas em
 * processos filhos (nunca no processo principal, que não pode bloquear) e
 * devolve o que mediu. Uma carga que falha volta como não medida — nada de
 * número inventado.
 */

import { ipcMain } from 'electron';
import { app } from 'electron';
import {
  findNodeBinary,
  readBenchmarkHistory,
  runAndStore,
  type BenchmarkRunRecord,
} from './benchmark.js';
import type { BenchmarkRunView } from '../shared/preload-api.js';

/** Converte um registo da corrida na vista do renderer. */
function toView(run: BenchmarkRunRecord): BenchmarkRunView {
  return {
    at: run.at,
    overall: run.overall,
    results: run.results.map((result) => ({
      workloadId: result.workloadId,
      elapsedMs: result.elapsedMs,
      score: result.score,
      measured: result.measured,
    })),
  };
}

/** Regista os canais do benchmark. */
export function registerBenchmarkIpc(): void {
  // Corre o benchmark completo e guarda a corrida.
  ipcMain.handle('benchmark:run', (): { readonly ok: boolean; readonly run?: BenchmarkRunView; readonly message?: string } => {
    // Sem o Node do sistema não há como correr as cargas — e a razão é dita,
    // não substituída por um "não medido" sem explicação.
    if (findNodeBinary() === null) {
      return { ok: false, message: 'Executável do Node não encontrado no sistema.' };
    }
    const dataDir = app.getPath('userData');
    const run = runAndStore(dataDir);
    return { ok: true, run: toView(run) };
  });

  // O histórico das corridas.
  ipcMain.handle('benchmark:history', (): { readonly ok: boolean; readonly runs: readonly BenchmarkRunView[] } => {
    const runs = readBenchmarkHistory(app.getPath('userData'));
    return { ok: true, runs: runs.map(toView) };
  });
}
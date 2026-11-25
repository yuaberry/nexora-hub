/**
 * Diagnóstico — as leituras reais do sistema, num relatório.
 *
 * Nada aqui é estimado: o disco vem do volume onde os jogos estão
 * (`storage:usage`), a carga e a memória do sistema operativo, e as
 * temperaturas dos sensores que a telemetria já lê. O que o sistema não
 * deixa ler fica `unknown` — e a interface diz "sem leitura", nunca um número
 * inventado.
 *
 * As regras (o que é aviso e o que é crítico) vivem no núcleo, testadas sem
 * tocar no sistema.
 */

import { ipcMain } from 'electron';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { buildReport, type DiagnosticReport } from '@nexora/core';
import { readBattery } from './battery.js';
import { TelemetryObserver } from './telemetry.js';

/** A leitura do disco (a mesma da barra de armazenamento). */
async function diskReading(): Promise<{ freeBytes: number | null; totalBytes: number | null }> {
  try {
    const { volumeSpace } = await import('./storage.js');
    const root = process.cwd();
    const volume = volumeSpace(root);
    return { freeBytes: volume.freeBytes, totalBytes: volume.totalBytes };
  } catch {
    // O volume não deu leitura: melhor "sem leitura" que um número falso.
    return { freeBytes: null, totalBytes: null };
  }
}

/** Recolhe as leituras e monta o relatório. */
export async function collectDiagnostics(): Promise<DiagnosticReport> {
  const disk = await diskReading();
  const sample = new TelemetryObserver().sample();
  const cores = cpus().length;

  // A memória: a telemetria dá a percentagem em uso; sem ela, calcula-se do
  // sistema operativo (memória livre sobre o total).
  const memoryPercent =
    sample.memoryPercent ?? (totalmem() > 0 ? ((totalmem() - freemem()) / totalmem()) * 100 : null);

  return buildReport({
    at: new Date().toISOString(),
    freeBytes: disk.freeBytes,
    totalBytes: disk.totalBytes,
    loadAverage: loadavg()[0] ?? null,
    cores,
    memoryPercent,
    temperatures: sample.temperatures.map((reading) => reading.celsius),
  });
}

/** Regista os canais do diagnóstico e da bateria. */
export function registerDiagnosticsIpc(): void {
  ipcMain.handle('diagnostics:report', async (): Promise<DiagnosticReport> => collectDiagnostics());

  // O estado da bateria (`null` quando não há — um desktop não tem).
  ipcMain.handle('diagnostics:battery', (): {
    readonly percent: number;
    readonly status: string;
    readonly charging: boolean;
    readonly level: 'ok' | 'low' | 'critical';
  } | null => readBattery());
}
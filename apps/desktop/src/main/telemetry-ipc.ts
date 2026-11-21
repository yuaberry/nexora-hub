/**
 * IPC da telemetria — leituras do sistema, sem Electron no caminho.
 *
 * Canal fino: o renderer pede uma amostra, o processo principal lê o
 * sistema e devolve. O estado da CPU (a leitura anterior) vive no processo
 * principal, porque a medida por diferença precisa de duas leituras.
 */

import { ipcMain } from 'electron';
import { TelemetryObserver } from './telemetry.js';
import type { TelemetrySampleView } from '../shared/preload-api.js';

/**
 * Observador com estado — uma instância por aplicação.
 *
 * A medida da CPU é a diferença entre esta leitura e a anterior: sem o
 * estado, cada amostra voltaria a "não sei" e o cartão mostraria um
 * tracejado para sempre.
 */
const observer = new TelemetryObserver();

/** Regista o canal da telemetria. */
export function registerTelemetryIpc(): void {
  ipcMain.handle('telemetry:sample', (): TelemetrySampleView => {
    const sample = observer.sample();
    return {
      cpuPercent: sample.cpuPercent,
      memoryPercent: sample.memoryPercent,
      loadAverage: sample.loadAverage,
      temperatures: sample.temperatures.map((reading) => ({
        chip: reading.chip,
        label: reading.label,
        celsius: reading.celsius,
      })),
      at: sample.at,
    };
  });

  // Esquece a leitura anterior (a próxima amostra não sabe o uso da CPU).
  ipcMain.handle('telemetry:reset', (): { readonly ok: boolean } => {
    observer.reset();
    return { ok: true };
  });
}
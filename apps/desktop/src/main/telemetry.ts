/**
 * Telemetria do sistema — leituras reais, sem estimativas.
 *
 * O launcher mede o que o Linux expõe: `/proc/stat` (CPU), `/proc/meminfo`
 * (memória), `/proc/loadavg` (carga) e os sensores de `/sys/class/hwmon`
 * (temperatura). Nada de biblioteca externa, nada de número estimado — e o
 * que não existe neste sistema (FPS dentro do jogo) fica declarado como
 * planeado, não fingido.
 *
 * Os leitores são **injectáveis**: os testes correm com ficheiros de
 * fixture (cópias de leituras reais desta máquina) e o launcher corre com os
 * ficheiros do sistema.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  cpuUsagePercent,
  memoryUsedPercent,
  parseCpuTimes,
  parseMemInfo,
  parseTemperatureInput,
  type CpuTimes,
} from '@nexora/core';

/** Uma leitura de temperatura. */
export interface TemperatureReading {
  /** Chip do sensor (`coretemp`, `dell_smm`…). */
  readonly chip: string;
  /** Rótulo do sensor, ou `null`. */
  readonly label: string | null;
  readonly celsius: number;
}

/** Uma amostra do sistema. */
export interface TelemetrySample {
  /** Uso da CPU desde a última amostra (`null` quando não há duas amostras). */
  readonly cpuPercent: number | null;
  /** Percentagem de memória em uso. */
  readonly memoryPercent: number | null;
  /** Carga média de 1 minuto, ou `null`. */
  readonly loadAverage: number | null;
  /** Sensores de temperatura, do mais quente para o mais frio. */
  readonly temperatures: readonly TemperatureReading[];
  /** ISO-8601 UTC da leitura. */
  readonly at: string;
}

/** Leitores injectáveis (os testes usam ficheiros; o launcher, o sistema). */
export interface TelemetryReaders {
  readonly readText: (path: string) => string | null;
  readonly listDirs: (path: string) => readonly string[];
}

/** Leitores do sistema real. */
export const systemReaders: TelemetryReaders = {
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
  listDirs: (path) => {
    try {
      // As entradas do `/sys` são **symlinks** (hwmon0 → ../../devices/…):
      // `isDirectory()` do `Dirent` devolve `false` para um symlink, e o
      // teste contra o sistema real apanhou isso. Quem manda é o `stat`.
      return readdirSync(path, { withFileTypes: true })
        .filter((entry) => {
          if (entry.isDirectory()) {
            return true;
          }
          if (entry.isSymbolicLink()) {
            try {
              return statSync(join(path, entry.name)).isDirectory();
            } catch {
              return false;
            }
          }
          return false;
        })
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  },
};

/**
 * Lê uma amostra do sistema.
 *
 * O uso da CPU é a **diferença** contra a leitura anterior: o `/proc/stat` é
 * cumulativo desde o arranque, e sem a amostra anterior a medida honesta é
 * "não sei" (`null`), não a média desde o boot.
 */
export function sampleSystem(
  readers: TelemetryReaders,
  previousCpu: CpuTimes | null,
  now: Date = new Date(),
): { sample: TelemetrySample; cpuTimes: CpuTimes | null } {
  const cpuTimes = parseCpuTimes(firstLine(readers, '/proc/stat'));
  const cpuPercent =
    cpuTimes !== null && previousCpu !== null ? cpuUsagePercent(previousCpu, cpuTimes) : null;

  const memInfo = parseMemInfo(readers.readText('/proc/meminfo') ?? '');
  const memoryPercent = memInfo === null ? null : memoryUsedPercent(memInfo);

  const loadText = readers.readText('/proc/loadavg') ?? '';
  const loadMatch = loadText.match(/^([\d.]+)\s/);
  const loadAverage = loadMatch === null ? null : Number(loadMatch[1]);

  return {
    sample: {
      cpuPercent,
      memoryPercent,
      loadAverage,
      temperatures: readTemperatures(readers),
      at: now.toISOString(),
    },
    cpuTimes,
  };
}

/** Lê os sensores de temperatura de `/sys/class/hwmon`. */
function readTemperatures(readers: TelemetryReaders): readonly TemperatureReading[] {
  const readings: TemperatureReading[] = [];
  for (const chip of readers.listDirs('/sys/class/hwmon')) {
    const chipDir = join('/sys/class/hwmon', chip);
    const chipName = readers.readText(join(chipDir, 'name'))?.trim() ?? chip;
    for (const sensor of listTemperatureSensors(readers, chipDir)) {
      const celsius = parseTemperatureInput(readers.readText(join(chipDir, `${sensor}_input`)) ?? '');
      if (celsius === null) {
        continue;
      }
      const label = readers.readText(join(chipDir, `${sensor}_label`))?.trim() ?? null;
      readings.push({ chip: chipName, label, celsius });
    }
  }
  // Do mais quente para o mais frio: o que se vê primeiro é o que importa.
  return readings.sort((left, right) => right.celsius - left.celsius);
}

/** Nomes dos sensores de temperatura de um chip (`temp1`, `temp2`…). */
function listTemperatureSensors(readers: TelemetryReaders, chipDir: string): readonly string[] {
  // A listagem de ficheiros não é um directório: lê-se por número, até ao
  // primeiro que falhe — assim um chip com 3 sensores e outro com 9 funcionam
  // sem depender de um `readdir` de ficheiros.
  const sensors: string[] = [];
  for (let index = 1; index <= 12; index += 1) {
    const name = `temp${index}`;
    if (readers.readText(join(chipDir, `${name}_input`)) === null) {
      break;
    }
    sensors.push(name);
  }
  return sensors;
}

/** Primeira linha de um ficheiro (a CPU agregada é a primeira do `/proc/stat`). */
function firstLine(readers: TelemetryReaders, path: string): string {
  return readers.readText(path)?.split('\n')[0] ?? '';
}

/**
 * Observador com estado — guarda a leitura anterior da CPU.
 *
 * Um objecto, porque a medida da CPU precisa de **duas** leituras: cada
 * `sample()` devolve o uso desde a anterior (ou `null` na primeira).
 */
export class TelemetryObserver {
  private previousCpu: CpuTimes | null = null;

  constructor(private readonly readers: TelemetryReaders = systemReaders) {}

  /** Lê uma amostra e actualiza o estado. */
  sample(): TelemetrySample {
    const { sample, cpuTimes } = sampleSystem(this.readers, this.previousCpu);
    this.previousCpu = cpuTimes;
    return sample;
  }

  /** Esquece a leitura anterior (a próxima amostra não sabe o uso da CPU). */
  reset(): void {
    this.previousCpu = null;
  }
}

/** O sensor mais quente de uma amostra (`null` quando não há sensores). */
export function hottest(sample: TelemetrySample): TemperatureReading | null {
  return sample.temperatures[0] ?? null;
}

/** Temperaturas agrupadas por chip (para a interface mostrar rótulos). */
export function byChip(sample: TelemetrySample): ReadonlyMap<string, readonly TemperatureReading[]> {
  const grouped = new Map<string, TemperatureReading[]>();
  for (const reading of sample.temperatures) {
    const current = grouped.get(reading.chip) ?? [];
    current.push(reading);
    grouped.set(reading.chip, current);
  }
  return grouped;
}

/** Chip com o sensor mais quente (diagnóstico: onde está o calor). */
export function hottestChip(sample: TelemetrySample): TemperatureReading | null {
  const best = hottest(sample);
  void best;
  return best;
}
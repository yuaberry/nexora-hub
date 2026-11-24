/**
 * Diagnóstico — as regras que leem o sistema sem fingir.
 *
 * Cada verificação é uma **função pura** de uma leitura real: espaço livre,
 * carga, memória, temperatura. O que não se sabe ler devolve `unknown` — e a
 * interface diz "sem leitura", nunca um número inventado.
 *
 * Os limiares são declarados aqui e testados sem tocar no sistema: o
 * diagnóstico é uma opinião com fundamento, não um aviso genérico.
 */

/** O estado de uma verificação. */
export type DiagnosticStatus = 'ok' | 'warning' | 'critical' | 'unknown';

/** Uma verificação do relatório. */
export interface DiagnosticCheck {
  /** Identificador estável (`disk`, `load`, `memory`, `temperature`). */
  readonly id: 'disk' | 'load' | 'memory' | 'temperature';
  readonly status: DiagnosticStatus;
  /** Os valores lidos (`null` quando a leitura não existe). */
  readonly freeBytes: number | null;
  readonly totalBytes: number | null;
  /** Carga por núcleo (0–1+), ou `null`. */
  readonly loadPerCore: number | null;
  /** Percentagem de memória em uso (0–100), ou `null`. */
  readonly memoryPercent: number | null;
  /** A temperatura mais alta lida (ºC), ou `null`. */
  readonly hottestCelsius: number | null;
}

/** Limiares do disco: abaixo disto, o instalador vai falhar. */
export const DISK_WARNING_FREE_BYTES = 20 * 1024 ** 3;
export const DISK_CRITICAL_FREE_BYTES = 10 * 1024 ** 3;

/** Limiares da carga (por núcleo): acima disto, o jogo vai engasgar. */
export const LOAD_WARNING_PER_CORE = 0.8;
export const LOAD_CRITICAL_PER_CORE = 1.5;

/** Limiares da temperatura (ºC): acima disto, há *throttling*. */
export const TEMPERATURE_WARNING_CELSIUS = 75;
export const TEMPERATURE_CRITICAL_CELSIUS = 90;

/** Limiares da memória em uso (%). */
export const MEMORY_WARNING_PERCENT = 85;
export const MEMORY_CRITICAL_PERCENT = 95;

/**
 * O estado do disco.
 *
 * A percentagem livre importa (um disco 90% cheio fragmenta) e o valor
 * absoluto também (um jogo moderno ocupa dezenas de gigabytes).
 */
export function diskStatus(freeBytes: number | null, totalBytes: number | null): DiagnosticStatus {
  if (freeBytes === null || totalBytes === null || totalBytes <= 0) {
    return 'unknown';
  }
  const freeRatio = freeBytes / totalBytes;
  if (freeBytes < DISK_CRITICAL_FREE_BYTES || freeRatio < 0.05) {
    return 'critical';
  }
  if (freeBytes < DISK_WARNING_FREE_BYTES || freeRatio < 0.15) {
    return 'warning';
  }
  return 'ok';
}

/** O estado da carga (a carga média dividida pelos núcleos). */
export function loadStatus(loadAverage: number | null, cores: number | null): DiagnosticStatus {
  if (loadAverage === null || cores === null || cores <= 0) {
    return 'unknown';
  }
  const perCore = loadAverage / cores;
  if (perCore >= LOAD_CRITICAL_PER_CORE) {
    return 'critical';
  }
  if (perCore >= LOAD_WARNING_PER_CORE) {
    return 'warning';
  }
  return 'ok';
}

/** O estado da memória. */
export function memoryStatus(usedPercent: number | null): DiagnosticStatus {
  if (usedPercent === null) {
    return 'unknown';
  }
  if (usedPercent >= MEMORY_CRITICAL_PERCENT) {
    return 'critical';
  }
  if (usedPercent >= MEMORY_WARNING_PERCENT) {
    return 'warning';
  }
  return 'ok';
}

/** O estado da temperatura. */
export function temperatureStatus(celsius: number | null): DiagnosticStatus {
  if (celsius === null) {
    return 'unknown';
  }
  if (celsius >= TEMPERATURE_CRITICAL_CELSIUS) {
    return 'critical';
  }
  if (celsius >= TEMPERATURE_WARNING_CELSIUS) {
    return 'warning';
  }
  return 'ok';
}

/** O relatório inteiro, com o peior estado de todos. */
export interface DiagnosticReport {
  readonly checks: readonly DiagnosticCheck[];
  /** O pior estado das verificações (é o que a interface destaca). */
  readonly overall: DiagnosticStatus;
  /** ISO-8601 UTC da leitura. */
  readonly at: string;
}

/**
 * Monta o relatório a partir das leituras.
 *
 * Uma leitura que não existe nãosome: fica `unknown` e a interface diz-o. O
 * estado geral é o **pior** dos estados — um diagnóstico que esconde um
 * crítico atrás de dois "ok" não é diagnóstico.
 */
export function buildReport(input: {
  readonly at: string;
  readonly freeBytes: number | null;
  readonly totalBytes: number | null;
  readonly loadAverage: number | null;
  readonly cores: number | null;
  readonly memoryPercent: number | null;
  readonly temperatures: readonly number[];
}): DiagnosticReport {
  const hottestCelsius = input.temperatures.length === 0 ? null : Math.max(...input.temperatures);
  const loadPerCore =
    input.loadAverage === null || input.cores === null || input.cores <= 0 ? null : input.loadAverage / input.cores;

  const checks: readonly DiagnosticCheck[] = [
    {
      id: 'disk',
      status: diskStatus(input.freeBytes, input.totalBytes),
      freeBytes: input.freeBytes,
      totalBytes: input.totalBytes,
      loadPerCore: null,
      memoryPercent: null,
      hottestCelsius: null,
    },
    {
      id: 'load',
      status: loadStatus(input.loadAverage, input.cores),
      freeBytes: null,
      totalBytes: null,
      loadPerCore,
      memoryPercent: null,
      hottestCelsius: null,
    },
    {
      id: 'memory',
      status: memoryStatus(input.memoryPercent),
      freeBytes: null,
      totalBytes: null,
      loadPerCore: null,
      memoryPercent: input.memoryPercent,
      hottestCelsius: null,
    },
    {
      id: 'temperature',
      status: temperatureStatus(hottestCelsius),
      freeBytes: null,
      totalBytes: null,
      loadPerCore: null,
      memoryPercent: null,
      hottestCelsius,
    },
  ];

  const order: Record<DiagnosticStatus, number> = { ok: 0, warning: 1, critical: 2, unknown: 3 };
  const overall = checks.reduce<DiagnosticStatus>(
    (worst, check) => (order[check.status] > order[worst] ? check.status : worst),
    'ok',
  );

  return { checks, overall, at: input.at };
}
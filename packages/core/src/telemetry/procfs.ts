/**
 * Leituras do sistema — funções puras sobre o que o Linux expõe.
 *
 * Nada aqui sabe de onde vem o texto: `/proc/stat`, `/proc/meminfo` e as
 * entradas `temp*_input` de `/sys/class/hwmon` entram como texto e saem
 * números. É assim que os testes usam **leituras reais** desta máquina como
 * fixtures — e é assim que a medida é honesta: o número vem do sistema, não
 * de uma estimativa.
 */

/** Um instante do relógio da CPU (a primeira linha do `/proc/stat`). */
export interface CpuTimes {
  readonly user: number;
  readonly nice: number;
  readonly system: number;
  readonly idle: number;
  readonly iowait: number;
  readonly irq: number;
  readonly softirq: number;
  readonly steal: number;
  /** Soma de todos os campos (o "tempo total" desde o arranque). */
  readonly total: number;
  /** Tempo em que a CPU estava ocupada (total menos o tempo parado). */
  readonly busy: number;
}

/**
 * Lê a linha `cpu ...` do `/proc/stat`.
 *
 * Devolve `null` quando a linha não é a da CPU agregada (há linhas `cpu0`,
 * `cpu1`… que são por núcleo) — quem lê decide se quer o agregado.
 */
export function parseCpuTimes(line: string): CpuTimes | null {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== 'cpu') {
    return null;
  }
  // Os campos depois de `steal` (guest, guest_nice) já estão contados em
  // user/nice nos kernels modernos; somá-los duplicaria tempo.
  const numbers = fields.slice(1, 9).map((field) => Number(field));
  if (numbers.length < 8 || numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [user, nice, system, idle, iowait, irq, softirq, steal] = numbers as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  return { user, nice, system, idle, iowait, irq, softirq, steal, total, busy: total - idle };
}

/**
 * Uso da CPU entre duas leituras, em percentagem.
 *
 * A medida é a **diferença** entre dois instantes: o `/proc/stat` é
 * cumulativo desde o arranque, e dividir o absoluto daria a média desde o
 * boot — não o uso agora. Devolve `null` quando as leituras não servem
 * (contador a recuar, total sem avançar), em vez de um número inventado.
 */
export function cpuUsagePercent(previous: CpuTimes, current: CpuTimes): number | null {
  const totalDelta = current.total - previous.total;
  const busyDelta = current.busy - previous.busy;
  if (totalDelta <= 0 || busyDelta < 0) {
    return null;
  }
  return Math.round((busyDelta / totalDelta) * 1000) / 10;
}

/** O que interessa do `/proc/meminfo`. */
export interface MemInfo {
  /** Memória total, em kB. */
  readonly totalKb: number;
  /** Memória disponível para novos processos, em kB (inclui cache recuperável). */
  readonly availableKb: number;
}

/**
 * Lê o `/proc/meminfo` e devolve o total e o disponível.
 *
 * O **disponível** é a medida honesta: `MemFree` sozinho ignoraria a cache
 * que o kernel pode devolver, e mostraria um sistema mais cheio do que está.
 * Devolve `null` quando uma das linhas falta.
 */
export function parseMemInfo(text: string): MemInfo | null {
  const lines = text.split('\n');
  const total = lines.find((line) => line.startsWith('MemTotal:'));
  const available = lines.find((line) => line.startsWith('MemAvailable:'));
  if (total === undefined || available === undefined) {
    return null;
  }
  const totalKb = firstNumber(total);
  const availableKb = firstNumber(available);
  if (totalKb === null || availableKb === null || totalKb <= 0) {
    return null;
  }
  return { totalKb, availableKb };
}

/** Percentagem de memória em uso (0–100, uma casa decimal). */
export function memoryUsedPercent(info: MemInfo): number {
  const used = info.totalKb - info.availableKb;
  return Math.round((used / info.totalKb) * 1000) / 10;
}

/** Um sensor de temperatura. */
export interface TemperatureSensor {
  /** Rótulo do sensor (`Package id 0`, `GPU`…), ou `null` quando não tem. */
  readonly label: string | null;
  /** Temperatura em graus Celsius. */
  readonly celsius: number;
}

/** Um chip com os seus sensores. */
export interface HwmonChip {
  /** Nome do chip (`coretemp`, `dell_smm`…). */
  readonly chip: string;
  readonly sensors: readonly TemperatureSensor[];
}

/** Lê uma entrada `temp*_input` (o valor vem em miligraus). */
export function parseTemperatureInput(millidegrees: string): number | null {
  const value = Number(millidegrees.trim());
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value) / 1000;
}

/**
 * O sensor mais quente de um chip.
 *
 * `null` quando o chip não tem sensor legível — e um chip sem sensor não
 * vale zero à força: zero graus é uma mentira com cara de número.
 */
export function hottestSensor(chip: HwmonChip): TemperatureSensor | null {
  const sorted = [...chip.sensors].sort((left, right) => right.celsius - left.celsius);
  return sorted[0] ?? null;
}

/** Primeiro número de uma linha do `/proc/meminfo`. */
function firstNumber(line: string): number | null {
  const match = line.match(/\d+/);
  return match === null ? null : Number(match[0]);
}
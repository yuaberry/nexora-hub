/**
 * Benchmark — o que se mede e como se pontua.
 *
 * Um benchmark honesto mede o que a máquina faz de verdade: uma carga de
 * trabalho declarada, corrida num processo filho, com o tempo **medido**.
 * A pontuação é uma fórmula declarada contra uma referência declarada — e
 * enquanto a máquina não correu o teste, a interface diz "estimado", nunca
 * "medido".
 */

/** Uma carga de trabalho do benchmark. */
export interface BenchmarkWorkload {
  /** Identificador da carga. */
  readonly id: string;
  /** Chave de tradução do nome. */
  readonly labelKey: string;
  /** O que a carga faz (para a interface explicar). */
  readonly hintKey: string;
  /** Número de iterações (declarado: a mesma carga, sempre igual). */
  readonly iterations: number;
  /** Semente do gerador de dados (o resultado é comparável entre corridas). */
  readonly seed: number;
  /**
   * Referência desta carga, em milissegundos.
   *
   * Cada carga tem a sua: semear a referência por carga, a média das
   * pontuações seria dominada pela carga mais lenta — e a pontuação global
   * deixaria de dizer seja o que for sobre a máquina.
   */
  readonly referenceMs: number;
}

/** O catálogo de cargas — a fonte da verdade. */
export const BENCHMARK_WORKLOADS: readonly BenchmarkWorkload[] = [
  {
    id: 'cpu-sort',
    labelKey: 'benchmark.cpuSort',
    hintKey: 'benchmark.hint.cpuSort',
    iterations: 40,
    seed: 20261121,
    referenceMs: 1_500,
  },
  {
    id: 'cpu-hash',
    labelKey: 'benchmark.cpuHash',
    hintKey: 'benchmark.hint.cpuHash',
    iterations: 60,
    seed: 42,
    referenceMs: 90,
  },
];

/** Uma carga pelo identificador (`undefined` quando não existe). */
export function workloadById(id: string): BenchmarkWorkload | undefined {
  return BENCHMARK_WORKLOADS.find((workload) => workload.id === id);
}

/**
 * Versão da referência das cargas.
 *
 * Declarada e versionada de propósito: se as referências mudam, a pontuação
 * muda, e o histórico antigo deixa de ser comparável — a interface diz a
 * versão ao lado do número.
 */
export const BENCHMARK_REFERENCE_VERSION = '1';

/**
 * Pontuação de uma carga: a referência **da carga** a dividir pelo tempo
 * medido, vezes mil.
 *
 * Uma casa decimal: **1000 pontos** quando a máquina leva exactamente a
 * referência daquela carga, mais quando é mais rápida, menos quando é mais
 * lenta. Um tempo não positivo devolve 0 — não há pontuação para um teste
 * que não correu.
 */
export function benchmarkScore(elapsedMs: number, referenceMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(referenceMs) || referenceMs <= 0) {
    return 0;
  }
  return Math.round((referenceMs / elapsedMs) * 1000 * 10) / 10;
}

/** A referência de uma carga (0 quando a carga não existe). */
export function referenceOf(workloadId: string): number {
  return workloadById(workloadId)?.referenceMs ?? 0;
}

/**
 * `true` quando há resultados suficientes para afiançar um número.
 *
 * A interface usa-o para rotular **"medido"** (houve corrida) ou
 * **"estimado"** (ainda não houve) — a distinção é do produto, não um
 * enfeite.
 */
export function isMeasured(results: readonly BenchmarkRunResult[]): boolean {
  return results.some((result) => result.measured && result.score > 0);
}

/** O resultado de uma corrida. */
export interface BenchmarkRunResult {
  readonly workloadId: string;
  /** Tempo medido, em milissegundos. */
  readonly elapsedMs: number;
  /** Pontuação pela fórmula declarada. */
  readonly score: number;
  /** A máquina correu o teste de facto (`true`) ou falhou (`false`). */
  readonly measured: boolean;
}

/**
 * Resume os resultados numa pontuação global.
 *
 * A média das pontuações das cargas medidas — as que falharam não contam
 * (uma carga que não correu não pode puxar a média para baixo).
 */
export function overallScore(results: readonly BenchmarkRunResult[]): number | null {
  const measured = results.filter((result) => result.measured && result.score > 0);
  if (measured.length === 0) {
    return null;
  }
  const total = measured.reduce((sum, result) => sum + result.score, 0);
  return Math.round((total / measured.length) * 10) / 10;
}

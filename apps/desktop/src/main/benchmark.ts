/**
 * Benchmark — correr as cargas e medir o tempo de verdade.
 *
 * Cada carga corre num **processo filho** (o processo principal nunca
 * bloqueia) e o tempo é medido dentro desse processo com o relógio
 * monótono (`process.hrtime.bigint`), imune a mudanças de hora do sistema.
 * Uma carga que falha devolve `measured: false` — nunca um número inventado.
 */

import { execFileSync } from 'node:child_process';
import { findExecutable } from './optimizer.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BENCHMARK_WORKLOADS,
  benchmarkScore,
  overallScore,
  type BenchmarkRunResult,
} from '@nexora/core';
import { workloadScript } from '@nexora/core';

/** Nome do ficheiro de histórico (na pasta de dados da app). */
const HISTORY_NAME = 'benchmark-history.json';

/** Tempo limite por carga (uma carga pendurada não pendura a app). */
const RUN_TIMEOUT_MS = 120_000;

/** Uma corrida guardada no histórico. */
export interface BenchmarkRunRecord {
  /** ISO-8601 UTC da corrida. */
  readonly at: string;
  readonly results: readonly BenchmarkRunResult[];
  /** Pontuação global (a média das medidas), ou `null` se nada correu. */
  readonly overall: number | null;
}

/** Como uma carga é corrida (injectável: os testes não abrem processos). */
export type WorkloadRunner = (script: string) => number | null;

/**
 * O binário do Node do sistema, ou `null`.
 *
 * **Dentro do Electron `process.execPath` é o binário do Electron**, que não
 * aceita `-e` — a prova ao vivo apanhou isto: as cargas corriam todas e
 * falhavam todas, e a página mostrava "não medido" sem explicação. O Node do
 * sistema é encontrado no `PATH`, como o Wine e o GameMode.
 */
export function findNodeBinary(): string | null {
  return findExecutable('node');
}

/** O executor real: um processo filho do **Node** com o script da carga. */
export const nodeRunner: WorkloadRunner = (script) => {
  const node = findNodeBinary();
  if (node === null) {
    return null;
  }
  try {
    const output = execFileSync(node, ['-e', script], {
      encoding: 'utf8',
      timeout: RUN_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const elapsed = Number(output.trim());
    return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : null;
  } catch {
    // Carga que estourou o tempo ou morreu: não há medida, e não se finge.
    return null;
  }
};

/**
 * Corre o catálogo inteiro e devolve os resultados.
 *
 * A ordem é a do catálogo, e uma carga que falha fica com `measured: false`
 * — a pontuação global ignora-a.
 */
export function runBenchmark(runner: WorkloadRunner = nodeRunner): readonly BenchmarkRunResult[] {
  return BENCHMARK_WORKLOADS.map((workload) => {
    const elapsed = runner(workloadScript(workload));
    return {
      workloadId: workload.id,
      elapsedMs: elapsed ?? 0,
      score: elapsed === null ? 0 : benchmarkScore(elapsed, workload.referenceMs),
      measured: elapsed !== null,
    } satisfies BenchmarkRunResult;
  });
}

/** Lê o histórico (vazio quando não há). */
export function readBenchmarkHistory(dataDir: string): readonly BenchmarkRunRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dataDir, HISTORY_NAME), 'utf8'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as BenchmarkRunRecord[];
  } catch {
    return [];
  }
}

/** Escreve o histórico (a pasta de dados é criada se faltar). */
export function writeBenchmarkHistory(dataDir: string, runs: readonly BenchmarkRunRecord[]): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(join(dataDir, HISTORY_NAME), JSON.stringify(runs, null, 2), 'utf8');
}

/** Corre o benchmark e guarda a corrida no histórico. */
export function runAndStore(dataDir: string, runner: WorkloadRunner = nodeRunner): BenchmarkRunRecord {
  const results = runBenchmark(runner);
  const record: BenchmarkRunRecord = {
    at: new Date().toISOString(),
    results,
    overall: overallScore(results),
  };
  const history = [...readBenchmarkHistory(dataDir), record];
  // O histórico fica curto de propósito: o que interessa é comparar com a
  // última corrida, não guardar um arquivo infinito.
  writeBenchmarkHistory(dataDir, history.slice(-20));
  return record;
}
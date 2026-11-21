import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_REFERENCE_VERSION,
  referenceOf,
  BENCHMARK_WORKLOADS,
  benchmarkScore,
  isMeasured,
  overallScore,
  workloadById,
  type BenchmarkRunResult,
} from '../src/benchmark/spec.js';
import { workloadScript as scriptOf } from '../src/benchmark/workloads.js';


describe('catálogo de cargas', () => {
  it('declara as cargas com iterações e semente', () => {
    expect(BENCHMARK_WORKLOADS.map((w) => w.id)).toEqual(['cpu-sort', 'cpu-hash']);
    // A mesma carga corre sempre o mesmo trabalho: iterações e semente
    // declaradas, não sorteadas.
    expect(BENCHMARK_WORKLOADS.every((w) => w.iterations > 0 && Number.isInteger(w.seed))).toBe(true);
  });

  it('encontra uma carga pelo identificador', () => {
    expect(workloadById('cpu-hash')?.labelKey).toBe('benchmark.cpuHash');
    expect(workloadById('nao-existe')).toBeUndefined();
  });
});

describe('pontuação', () => {
  it('a referência da carga dá exactamente 1000 pontos', () => {
    expect(benchmarkScore(1500, 1500)).toBe(1000);
  });

  it('mais rápido pontua mais, mais lento pontua menos', () => {
    expect(benchmarkScore(750, 1500)).toBe(2000);
    expect(benchmarkScore(3000, 1500)).toBe(500);
  });

  it('um tempo impossível dá zero (não hápontuação sem corrida)', () => {
    expect(benchmarkScore(0, 1500)).toBe(0);
    expect(benchmarkScore(-5, 1500)).toBe(0);
    expect(benchmarkScore(Number.NaN, 1500)).toBe(0);
  });

  it('cada carga tem a sua referência (a média não é dominada por uma)', () => {
    expect(referenceOf('cpu-sort')).toBe(1500);
    expect(referenceOf('cpu-hash')).toBe(90);
    expect(referenceOf('nao-existe')).toBe(0);
  });

  it('a média só conta as cargas medidas', () => {
    const media = overallScore([
      { workloadId: 'cpu-sort', elapsedMs: 500, score: 2000, measured: true },
      { workloadId: 'cpu-hash', elapsedMs: 1000, score: 1000, measured: true },
      { workloadId: 'falhou', elapsedMs: 0, score: 0, measured: false },
    ]);
    expect(media).toBe(1500);
  });

  it('sem nenhuma medida não há número (null, não zero)', () => {
    expect(overallScore([])).toBeNull();
    expect(overallScore([{ workloadId: 'x', elapsedMs: 0, score: 0, measured: false }])).toBeNull();
  });

  it('a versão da referência fica registada', () => {
    expect(BENCHMARK_REFERENCE_VERSION).toBe('1');
  });

  it('"medido" exige uma corrida de facto', () => {
    const corridas: readonly BenchmarkRunResult[] = [
      { workloadId: 'cpu-sort', elapsedMs: 500, score: 2000, measured: true },
    ];
    expect(isMeasured(corridas)).toBe(true);
    // Sem corrida não há número medido — a interface mostra "estimado".
    expect(isMeasured([{ workloadId: 'cpu-sort', elapsedMs: 0, score: 0, measured: false }])).toBe(false);
  });
});

describe('scripts das cargas', () => {
  it('cada carga tem um script que mede o tempo e escreve o resultado', () => {
    for (const workload of BENCHMARK_WORKLOADS) {
      const script = scriptOf(workload);
      expect(script).toContain('process.hrtime.bigint');
      expect(script).toContain('process.stdout.write');
      expect(script).toContain(String(workload.iterations));
    }
  });

  it('o script é deterministic (a mesma semente, os mesmos dados)', () => {
    expect(scriptOf(BENCHMARK_WORKLOADS[0]!)).toContain(String(BENCHMARK_WORKLOADS[0]!.seed));
  });
});

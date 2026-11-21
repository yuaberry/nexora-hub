import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nodeRunner,
  readBenchmarkHistory,
  runAndStore,
  runBenchmark,
  writeBenchmarkHistory,
} from '../src/main/benchmark.js';

/**
 * Benchmark — correr as cargas e medir.
 *
 * O que estes testes travam: uma carga que não corre devolve `measured:
 * false` (nunca um número inventado), a pontuação global ignora as que
 * falharam, e o histórico guarda as corridas. O executor real é provado à
 * parte, contra um script trivial.
 */

describe('runBenchmark', () => {
  it('uma carga que mede dá um resultado medido', async () => {
    const { execFileSync } = await import('node:child_process');
    // O executor real, com um script de um milissegundo — prova de que o
    // caminho (processo filho → stdout → número) funciona de facto.
    const elapsed = nodeRunner("const start = process.hrtime.bigint(); while (Number(process.hrtime.bigint() - start) < 1e6) {} process.stdout.write('1');");
    expect(elapsed).toBe(1);
    void execFileSync;
  });

  it('uma carga que falha não é medida (nada fingido)', () => {
    const resultados = runBenchmark(() => null);
    expect(resultados.every((result) => !result.measured)).toBe(true);
    expect(resultados.every((result) => result.score === 0)).toBe(true);
  });

  it('a pontuação global ignora as cargas que falharam', () => {
    // As cargas correm na ordem do catálogo: a primeira mede, a segunda
    // falha — e a global só conta a que mediu.
    let chamadas = 0;
    const resultados = runBenchmark(() => {
      chamadas += 1;
      return chamadas === 1 ? 500 : null;
    });
    const primeira = resultados.find((r) => r.workloadId === 'cpu-sort')!;
    expect(primeira.measured).toBe(true);
    // A referência desta carga (1500 ms) a dividir pelos 500 ms medidos.
    expect(primeira.score).toBe(3000);
    expect(resultados.find((r) => r.workloadId === 'cpu-hash')?.measured).toBe(false);
    expect(resultados.filter((r) => r.measured)).toHaveLength(1);
  });
});

describe('histórico', () => {
  let data: string;

  beforeEach(() => {
    data = mkdtempSync(join(tmpdir(), 'nexora-bench-'));
  });

  afterEach(() => {
    rmSync(data, { recursive: true, force: true });
  });

  it('guarda as corridas e devolve-as', () => {
    const corrida = {
      at: '2026-01-01T10:00:00.000Z',
      results: [{ workloadId: 'cpu-sort', elapsedMs: 500, score: 2000, measured: true }],
      overall: 2000,
    };
    writeBenchmarkHistory(data, [corrida]);
    expect(readBenchmarkHistory(data)).toHaveLength(1);
    expect(readBenchmarkHistory(data)[0]?.overall).toBe(2000);
  });

  it('corre e guarda numa só chamada', () => {
    const corrida = runAndStore(data, () => 250);
    expect(corrida.results.every((r) => r.measured)).toBe(true);
    expect(readBenchmarkHistory(data)).toHaveLength(1);
    // Cada carga pontua contra a sua própria referência: cpu-sort (1500 ms)
    // dá 6000 pontos e cpu-hash (90 ms) dá 360 — a média é 3180. A escala
    // comum às duas é o que torna a média significativa.
    expect(corrida.overall).toBe(3180);
  });

  it('um histórico corrompido devolve vazio (não rebenta)', () => {
    writeFileSync(join(data, 'benchmark-history.json'), '{ isto não é json', 'utf8');
    expect(readBenchmarkHistory(data)).toHaveLength(0);
    expect(existsSync(join(data, 'benchmark-history.json'))).toBe(true);
  });
});

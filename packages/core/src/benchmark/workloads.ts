/**
 * As cargas de trabalho do benchmark, como script.
 *
 * O script é **declarado e deterministic**: a mesma máquina corre sempre o
 * mesmo trabalho com os mesmos dados, e é por isso que duas corridas são
 * comparáveis. Nada de esperas, nada de I/O — só trabalho de verdade, para
 * que o tempo medido seja o tempo da máquina.
 */

import type { BenchmarkWorkload } from './spec.js';

/**
 * O script de uma carga, para correr num processo filho.
 *
 * Devolve o tempo de execução em milissegundos, medido com `process.hrtime`
 * (relógio monótonico, imune a mudanças de hora do sistema).
 */
export function workloadScript(workload: BenchmarkWorkload): string {
  const seed = workload.seed;
  const iterations = workload.iterations;
  switch (workload.id) {
    case 'cpu-hash':
      return `
        const iterations = ${iterations};
        const seed = ${seed};
        // Gerador determinista (mulberry32): os mesmos dados em cada corrida.
        function next(state) {
          state = (state + 0x6d2b79f5) | 0;
          let t = Math.imul(state ^ (state >>> 15), 1 | state);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state };
        }
        const start = process.hrtime.bigint();
        let acc = 0;
        let state = seed;
        for (let i = 0; i < iterations; i += 1) {
          let buffer = '';
          for (let j = 0; j < 20000; j += 1) {
            const drawn = next(state);
            state = drawn.state;
            buffer += String.fromCharCode(32 + Math.floor(drawn.value * 90));
          }
          // Uma soma ponderada do conteúdo: o trabalho é real.
          for (let k = 0; k < buffer.length; k += 1) {
            acc = (acc + buffer.charCodeAt(k) * (k + 1)) % 2147483647;
          }
        }
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        if (acc < 0) { throw new Error('accumulator'); }
        process.stdout.write(String(Math.round(elapsed * 100) / 100));
      `;
    case 'cpu-sort':
    default:
      return `
        const iterations = ${iterations};
        const seed = ${seed};
        function next(state) {
          state = (state + 0x6d2b79f5) | 0;
          let t = Math.imul(state ^ (state >>> 15), 1 | state);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state };
        }
        const start = process.hrtime.bigint();
        let checksum = 0;
        let state = seed;
        for (let i = 0; i < iterations; i += 1) {
          const data = [];
          for (let j = 0; j < 60000; j += 1) {
            const drawn = next(state);
            state = drawn.state;
            data.push(drawn.value);
          }
          data.sort((a, b) => a - b);
          checksum = (checksum + data[1000] + data[30000]) % 1000000007;
        }
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        if (checksum < 0) { throw new Error('checksum'); }
        process.stdout.write(String(Math.round(elapsed * 100) / 100));
      `;
  }
}
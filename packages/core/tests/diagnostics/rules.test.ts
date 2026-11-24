import { describe, expect, it } from 'vitest';
import {
  buildReport,
  diskStatus,
  DISK_CRITICAL_FREE_BYTES,
  DISK_WARNING_FREE_BYTES,
  loadStatus,
  memoryStatus,
  temperatureStatus,
} from '../../src/diagnostics/rules.js';

/**
 * Diagnóstico — os limiares, sem tocar no sistema.
 *
 * O que estes testes travam: os limiares são os declarados; uma leitura em
 * falta devolve `unknown` (não um número inventado); e o estado geral é o
 * **pior** dos estados — um crítico nunca se esconde atrás de "ok".
 */

const GB = 1024 ** 3;

describe('limiares do disco', () => {
  it('declarados', () => {
    expect(DISK_WARNING_FREE_BYTES).toBe(20 * 1024 ** 3);
    expect(DISK_CRITICAL_FREE_BYTES).toBe(10 * 1024 ** 3);
  });
});

describe('diskStatus', () => {
  it('os limiares são os declarados', () => {
    expect(diskStatus(500 * GB, 1000 * GB)).toBe('ok');
    expect(diskStatus(19 * GB, 100 * GB)).toBe('warning'); // abaixo de 20 GB (mas 19% livre)
    expect(diskStatus(9 * GB, 1000 * GB)).toBe('critical'); // abaixo de 10 GB
    // um disco quase cheio avisa pela percentagem, não só pelos bytes
    expect(diskStatus(60 * GB, 1000 * GB)).toBe('warning'); // 6% livre (< 15%)
    expect(diskStatus(40 * GB, 1000 * GB)).toBe('critical'); // 4% livre (< 5%)
  });

  it('sem leitura não há opinião', () => {
    expect(diskStatus(null, 1000 * GB)).toBe('unknown');
    expect(diskStatus(500 * GB, null)).toBe('unknown');
    expect(diskStatus(500 * GB, 0)).toBe('unknown');
  });
});

describe('loadStatus', () => {
  it('a carga é por núcleo', () => {
    expect(loadStatus(1.6, 8)).toBe('ok'); // 0.2 por núcleo
    expect(loadStatus(6.4, 8)).toBe('warning'); // 0.8 por núcleo
    expect(loadStatus(12, 8)).toBe('critical'); // 1.5 por núcleo
    expect(loadStatus(null, 8)).toBe('unknown');
    expect(loadStatus(1, null)).toBe('unknown');
    expect(loadStatus(1, 0)).toBe('unknown');
  });
});

describe('memoryStatus', () => {
  it('os limiares são os declarados', () => {
    expect(memoryStatus(50)).toBe('ok');
    expect(memoryStatus(90)).toBe('warning');
    expect(memoryStatus(97)).toBe('critical');
    expect(memoryStatus(null)).toBe('unknown');
  });
});

describe('temperatureStatus', () => {
  it('os limiares são os declarados', () => {
    expect(temperatureStatus(60)).toBe('ok');
    expect(temperatureStatus(80)).toBe('warning');
    expect(temperatureStatus(95)).toBe('critical');
    expect(temperatureStatus(null)).toBe('unknown');
  });
});

describe('buildReport', () => {
  it('o estado geral é o pior dos estados', () => {
    const relatorio = buildReport({
      at: '2026-11-24T10:00:00.000Z',
      freeBytes: 500 * GB,
      totalBytes: 1000 * GB,
      loadAverage: 1,
      cores: 8,
      memoryPercent: 50,
      temperatures: [95], // quente
    });
    expect(relatorio.overall).toBe('critical');
    expect(relatorio.checks.map((c) => c.id)).toEqual(['disk', 'load', 'memory', 'temperature']);
  });

  it('leituras em falta ficam unknown, sem inventar', () => {
    const relatorio = buildReport({
      at: '2026-11-24T10:00:00.000Z',
      freeBytes: null,
      totalBytes: null,
      loadAverage: null,
      cores: null,
      memoryPercent: null,
      temperatures: [],
    });
    expect(relatorio.checks.every((check) => check.status === 'unknown')).toBe(true);
    // Sem leituras, o estado geral não é "ok" — é desconhecido.
    expect(relatorio.overall).toBe('unknown');
  });
});

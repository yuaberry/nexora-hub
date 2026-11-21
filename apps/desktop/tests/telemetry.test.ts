import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  byChip,
  hottest,
  sampleSystem,
  systemReaders,
  TelemetryObserver,
  type TelemetryReaders,
} from '../src/main/telemetry.js';

/**
 * Telemetria do sistema — leituras reais em ficheiros de teste.
 *
 * As fixtures são cópias das leituras **verdadeiras** desta máquina
 * (`/proc/stat`, `/proc/meminfo`, `/sys/class/hwmon`): os parsares e o
 * observador são escritos contra o formato que existe. O que estes testes
 * travam: a CPU é medida por diferença (a primeira amostra não sabe o uso),
 * a memória usa o disponível, e um sensor que não existe não vale zero.
 */

/** Leituras reais desta máquina. */
const STAT_UM = 'cpu  6096846 102149 1883673 37955309 1252807 0 16123 0 0 0\ncpu0 1557625 27089 478263 9417968 322130 0 3049 0 0 0\n';
const STAT_DOIS = 'cpu  6098846 102349 1884873 37977309 1253807 0 16223 0 0 0\ncpu0 1558625 27189 478663 9419968 322430 0 3099 0 0 0\n';
const MEMINFO = 'MemTotal:        8030256 kB\nMemFree:          944436 kB\nMemAvailable:    4066248 kB\n';

/** Um sistema de teste com a mesma árvore do Linux real. */
function fakeSystem(): { root: string; readers: TelemetryReaders } {
  const root = mkdtempSync(join(tmpdir(), 'nexora-telemetria-'));
  const proc = join(root, 'proc');
  const hwmon = join(root, 'sys', 'class', 'hwmon');
  mkdirSync(proc, { recursive: true });
  mkdirSync(join(hwmon, 'hwmon0'), { recursive: true });
  mkdirSync(join(hwmon, 'hwmon1'), { recursive: true });
  writeFileSync(join(proc, 'stat'), STAT_UM, 'utf8');
  writeFileSync(join(proc, 'meminfo'), MEMINFO, 'utf8');
  writeFileSync(join(proc, 'loadavg'), '0.85 1.15 0.80 1/1069 360713\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon0', 'name'), 'coretemp\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon0', 'temp1_input'), '52000\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon0', 'temp1_label'), 'Package id 0\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon0', 'temp2_input'), '51000\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon0', 'temp2_label'), 'Core 0\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon1', 'name'), 'dell_smm\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon1', 'temp1_input'), '61000\n', 'utf8');
  writeFileSync(join(hwmon, 'hwmon1', 'temp1_label'), 'GPU\n', 'utf8');

  // O tempo passa: a primeira leitura do contador da CPU é a primeira, as
  // seguintes são a segunda — é isso que faz a medida por diferença ter
  // algo a comparar.
  let leiturasStat = 0;

  // Os leitores servem a pasta de teste no lugar do sistema: o caminho
  // `/proc/stat` lê `<root>/proc/stat`, como no Linux.
  const readers: TelemetryReaders = {
    readText: (path) => {
      if (path === '/proc/stat') {
        leiturasStat += 1;
        return leiturasStat <= 1 ? STAT_UM : STAT_DOIS;
      }
      try {
        return readFileSync(join(root, path), 'utf8');
      } catch {
        return null;
      }
    },
    listDirs: (path) => {
      if (path !== '/sys/class/hwmon') {
        return [];
      }
      return ['hwmon0', 'hwmon1'];
    },
  };
  return { root, readers };
}

describe('sampleSystem', () => {
  it('a primeira amostra não sabe o uso da CPU (não finge)', () => {
    const { root, readers } = fakeSystem();
    try {
      const { sample } = sampleSystem(readers, null);
      expect(sample.cpuPercent).toBeNull();
      expect(sample.memoryPercent).toBeCloseTo(49.4, 1);
      expect(sample.loadAverage).toBe(0.85);
      expect(sample.temperatures).toHaveLength(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a segunda amostra mede o uso pela diferença', () => {
    const { root, readers } = fakeSystem();
    try {
      const primeira = sampleSystem(readers, null);
      const { sample } = sampleSystem(readers, primeira.cpuTimes);
      expect(sample.cpuPercent).not.toBeNull();
      expect(sample.cpuPercent!).toBeGreaterThan(0);
      expect(sample.cpuPercent!).toBeLessThan(20);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('as temperaturas vêm do mais quente para o mais frio, com o chip', () => {
    const { root, readers } = fakeSystem();
    try {
      const { sample } = sampleSystem(readers, null);
      expect(sample.temperatures[0]?.celsius).toBe(61);
      expect(sample.temperatures[0]?.chip).toBe('dell_smm');
      expect(sample.temperatures[0]?.label).toBe('GPU');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('um sistema sem sensores devolve lista vazia (nunca zero)', () => {
    const vazio: TelemetryReaders = {
      readText: () => null,
      listDirs: () => [],
    };
    const { sample } = sampleSystem(vazio, null);
    expect(sample.temperatures).toHaveLength(0);
    expect(sample.memoryPercent).toBeNull();
    expect(hottest(sample)).toBeNull();
  });

  it('as temperaturas agrupam-se por chip', () => {
    const { root, readers } = fakeSystem();
    try {
      const { sample } = sampleSystem(readers, null);
      const chips = byChip(sample);
      expect(chips.get('coretemp')).toHaveLength(2);
      expect(chips.get('dell_smm')).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('TelemetryObserver', () => {
  it('guarda a leitura anterior e mede a diferença', () => {
    const { root, readers } = fakeSystem();
    try {
      const observer = new TelemetryObserver(readers);
      expect(observer.sample().cpuPercent).toBeNull();
      expect(observer.sample().cpuPercent).not.toBeNull();
      // Um reset faz a próxima amostra voltar a não saber — honesto.
      observer.reset();
      expect(observer.sample().cpuPercent).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('leitores do sistema', () => {
  it('lêem o sistema real sem rebentar', () => {
    const amostra = sampleSystem(systemReaders, null);
    expect(amostra.sample.memoryPercent).not.toBeNull();
    expect(amostra.sample.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('encontram sensores reais nesta máquina (a prova de que funciona)', () => {
    const amostra = sampleSystem(systemReaders, null);
    expect(amostra.sample.temperatures.length).toBeGreaterThan(0);
  });
});
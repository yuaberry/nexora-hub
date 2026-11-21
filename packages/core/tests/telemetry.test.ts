import { describe, expect, it } from 'vitest';
import {
  cpuUsagePercent,
  hottestSensor,
  memoryUsedPercent,
  parseCpuTimes,
  parseMemInfo,
  parseTemperatureInput,
  type CpuTimes,
} from '../src/telemetry/procfs.js';

/**
 * Telemetria — leituras reais do sistema.
 *
 * As fixtures são cópias de leituras **verdadeiras** desta máquina
 * (`/proc/stat`, `/proc/meminfo`, `/sys/class/hwmon`): os parsers são
 * escritos contra o formato que existe. O que estes testes travam: a CPU é
 * medida por **diferença** (o absoluto daria a média desde o arranque), a
 * memória usa o disponível (não o livre), e um sensor ausente não vale zero.
 */

/** `/proc/stat` real (a linha agregada da CPU). */
const CPU_LINE = 'cpu  6096846 102149 1883673 37955309 1252807 0 16123 0 0 0';
const CPU_LINE_DEPOIS = 'cpu  6098846 102349 1884873 37977309 1253807 0 16223 0 0 0';

/** `/proc/meminfo` real. */
const MEMINFO = `MemTotal:        8030256 kB
MemFree:          944436 kB
MemAvailable:    4066248 kB
Buffers:          162464 kB
Cached:          2734780 kB
`;

describe('parseCpuTimes', () => {
  it('lê a linha agregada da CPU', () => {
    const times = parseCpuTimes(CPU_LINE);
    expect(times).not.toBeNull();
    expect(times?.user).toBe(6_096_846);
    expect(times?.idle).toBe(37_955_309);
    expect(times?.total).toBe(6_096_846 + 102_149 + 1_883_673 + 37_955_309 + 1_252_807 + 0 + 16_123 + 0);
    // Ocupado é o total menos o tempo parado.
    expect(times?.busy).toBe((times?.total ?? 0) - 37_955_309);
  });

  it('recusa a linha de um núcleo (a agregada é a que interessa)', () => {
    expect(parseCpuTimes('cpu0 1557625 27089 478263 9417968 322130 0 3049 0 0 0')).toBeNull();
  });

  it('recusa uma linha que não é da CPU', () => {
    expect(parseCpuTimes('intr 12345 0 0')).toBeNull();
  });
});

describe('cpuUsagePercent', () => {
  it('mede o uso pela diferença entre duas leituras', () => {
    const antes = parseCpuTimes(CPU_LINE) as CpuTimes;
    const depois = parseCpuTimes(CPU_LINE_DEPOIS) as CpuTimes;
    const uso = cpuUsagePercent(antes, depois);
    expect(uso).not.toBeNull();
    // A diferença é conhecida: 2000 de ocupado em 22000 de total ≈ 9,1 %.
    expect(uso).toBeGreaterThan(0);
    expect(uso).toBeLessThan(20);
  });

  it('duas leituras iguais não sabem o uso — devolvem null, não zero', () => {
    // Zero tempo passado não é 0 % de uso: é 0 dividido por 0. A medida
    // honesta é "não sei", e o chamador mostra o último valor conhecido.
    const agora = parseCpuTimes(CPU_LINE) as CpuTimes;
    expect(cpuUsagePercent(agora, agora)).toBeNull();
  });

  it('um contador a recuar dá null, não um número negativo', () => {
    const antes = parseCpuTimes(CPU_LINE) as CpuTimes;
    const antesDeVerdade = parseCpuTimes('cpu  6095846 102149 1883673 37955309 1252807 0 16123 0 0 0') as CpuTimes;
    expect(cpuUsagePercent(antes, antesDeVerdade)).toBeNull();
  });
});

describe('parseMemInfo', () => {
  it('lê o total e o disponível das linhas reais', () => {
    const info = parseMemInfo(MEMINFO);
    expect(info?.totalKb).toBe(8_030_256);
    expect(info?.availableKb).toBe(4_066_248);
  });

  it('o uso é sobre o disponível, não sobre o livre', () => {
    const info = parseMemInfo(MEMINFO)!;
    // (8030256 - 4066248) / 8030256 ≈ 49,4 %
    expect(memoryUsedPercent(info)).toBeCloseTo(49.4, 1);
  });

  it('sem MemAvailable devolve null (nada de número inventado)', () => {
    expect(parseMemInfo('MemTotal:        8030256 kB\nMemFree:          944436 kB\n')).toBeNull();
  });
});

describe('parseTemperatureInput', () => {
  it('converte miligraus em graus', () => {
    expect(parseTemperatureInput('52000')).toBe(52);
    expect(parseTemperatureInput('27800\n')).toBe(27.8);
  });

  it('zero ou lixo devolve null', () => {
    expect(parseTemperatureInput('0')).toBeNull();
    expect(parseTemperatureInput('')).toBeNull();
  });
});

describe('hottestSensor', () => {
  it('devolve o sensor mais quente do chip', () => {
    const mais = hottestSensor({
      chip: 'coretemp',
      sensors: [
        { label: 'Core 0', celsius: 51 },
        { label: 'Package id 0', celsius: 52 },
      ],
    });
    expect(mais?.celsius).toBe(52);
  });

  it('um chip sem sensor devolve null (nunca zero)', () => {
    expect(hottestSensor({ chip: 'vazio', sensors: [] })).toBeNull();
  });
});
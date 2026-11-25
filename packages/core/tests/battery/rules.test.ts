import { describe, expect, it } from 'vitest';
import { batteryLabelKey, batteryState } from '../../src/battery/rules.js';

/**
 * Bateria — as bandas e a honestidade das leituras.
 */
describe('batteryState', () => {
  it('uma leitura normal dá o nível certo', () => {
    expect(batteryState(98, 'Charging')).toEqual({
      percent: 98,
      status: 'Charging',
      charging: true,
      level: 'ok',
    });
  });

  it('as bandas são as declaradas', () => {
    expect(batteryState(15, 'Discharging')?.level).toBe('low');
    expect(batteryState(10, 'Discharging')?.level).toBe('critical');
    expect(batteryState(21, 'Discharging')?.level).toBe('ok');
  });

  it('uma leitura impossível não existe', () => {
    expect(batteryState(101, 'Charging')).toBeNull();
    expect(batteryState(-3, 'Charging')).toBeNull();
    expect(batteryState('muito', 'Charging')).toBeNull();
  });

  it('uma palavra desconhecida fica Unknown sem mentir', () => {
    const estado = batteryState(50, null);
    expect(estado?.status).toBe('Unknown');
    expect(batteryLabelKey(estado!)).toBe('battery.unknown');
  });
});

describe('batteryLabelKey', () => {
  it('carregar, descarregar e cheio', () => {
    expect(batteryLabelKey(batteryState(50, 'Charging')!)).toBe('battery.charging');
    expect(batteryLabelKey(batteryState(50, 'Discharging')!)).toBe('battery.discharging');
    expect(batteryLabelKey(batteryState(100, 'Full')!)).toBe('battery.full');
  });
});

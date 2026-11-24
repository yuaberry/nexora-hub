import { describe, expect, it } from 'vitest';
import { formatClock } from '../../src/format/clock.js';

/**
 * Relógio de sessão — o formato do mostrador.
 */
describe('formatClock', () => {
  it('menos de uma hora fica em M:SS', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(599)).toBe('9:59');
  });

  it('a partir de uma hora entra o H:', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(45_060)).toBe('12:31:00');
  });

  it('segundos negativos não existem', () => {
    expect(formatClock(-5)).toBe('0:00');
  });

  it('fracções de segundo não aparecem', () => {
    expect(formatClock(9.9)).toBe('0:09');
  });
});

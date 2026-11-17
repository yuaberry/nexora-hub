import { describe, expect, it } from 'vitest';
import { storageBar } from '../src/storage/bar.js';

const GB = 1024 ** 3;

describe('storageBar', () => {
  it('separa jogos, resto do disco e espaço livre', () => {
    const bar = storageBar(2 * GB, 3 * GB, 10 * GB);
    expect(bar.usedBytes).toBe(2 * GB);
    expect(bar.otherBytes).toBe(3 * GB);
    expect(bar.freeBytes).toBe(5 * GB);
    expect(bar.overCapacity).toBe(false);
  });

  it('atribui os tons de tema por papel', () => {
    const [games, other, free] = storageBar(1 * GB, 1 * GB, 4 * GB).segments;
    expect(games?.tone).toBe('accent');
    expect(games?.labelKey).toBe('games');
    expect(other?.tone).toBe('neutral');
    expect(free?.tone).toBe('warning');
  });

  it('as proporções somam no máximo um', () => {
    const bar = storageBar(2 * GB, 3 * GB, 10 * GB);
    const total = bar.segments.reduce((sum, segment) => sum + segment.ratio, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('limita os jogos à capacidade e declara o excesso', () => {
    const bar = storageBar(12 * GB, 8 * GB, 10 * GB);
    expect(bar.usedBytes).toBe(10 * GB);
    expect(bar.otherBytes).toBe(0);
    expect(bar.freeBytes).toBe(0);
    expect(bar.overCapacity).toBe(true);
  });

  it('limita o resto do disco ao que sobra', () => {
    const bar = storageBar(8 * GB, 8 * GB, 10 * GB);
    expect(bar.otherBytes).toBe(2 * GB);
    expect(bar.overCapacity).toBe(true);
  });

  it('capacidade desconhecida dá barra vazia', () => {
    const bar = storageBar(5 * GB, 5 * GB, 0);
    expect(bar.usedBytes).toBe(0);
    expect(bar.otherBytes).toBe(0);
    expect(bar.segments.every((segment) => segment.ratio === 0)).toBe(true);
  });

  it('recusa valores negativos', () => {
    const bar = storageBar(-1, -2, 10 * GB);
    expect(bar.usedBytes).toBe(0);
    expect(bar.otherBytes).toBe(0);
    expect(bar.freeBytes).toBe(10 * GB);
    expect(bar.overCapacity).toBe(false);
  });
});
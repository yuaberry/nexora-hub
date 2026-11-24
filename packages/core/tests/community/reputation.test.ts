import { describe, expect, it } from 'vitest';
import { levelFor, REPUTATION_LEVELS, reputationProgress } from '../../src/community/reputation.js';

/**
 * Reputação — os limiares e o progresso.
 */
describe('levelFor', () => {
  it('o limiar é inclusivo', () => {
    expect(levelFor(0).key).toBe('reputation.level.bronze');
    expect(levelFor(99).key).toBe('reputation.level.bronze');
    expect(levelFor(100).key).toBe('reputation.level.silver');
    expect(levelFor(500).key).toBe('reputation.level.gold');
    expect(levelFor(9_999).key).toBe('reputation.level.platinum');
    expect(levelFor(10_000).key).toBe('reputation.level.diamond');
  });

  it('pontos negativos não existem (começa-se em zero)', () => {
    expect(levelFor(-50).key).toBe('reputation.level.bronze');
  });
});

describe('reputationProgress', () => {
  it('a fracção é aritmética honesta', () => {
    const progresso = reputationProgress(300);
    expect(progresso.current.key).toBe('reputation.level.silver');
    expect(progresso.next?.key).toBe('reputation.level.gold');
    // 300 - 100 = 200 de 400 até Ouro.
    expect(progresso.fraction).toBeCloseTo(0.5);
    expect(progresso.remaining).toBe(200);
  });

  it('no último nível não há objectivo fingido', () => {
    const progresso = reputationProgress(25_000);
    expect(progresso.next).toBeNull();
    expect(progresso.fraction).toBe(0);
    expect(progresso.remaining).toBe(0);
  });

  it('os limiares sobem sempre', () => {
    for (let i = 1; i < REPUTATION_LEVELS.length; i++) {
      expect(REPUTATION_LEVELS[i]?.from).toBeGreaterThan(REPUTATION_LEVELS[i - 1]?.from ?? 0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  cosmeticById,
  cosmeticCost,
  equipOutcome,
  evaluatePurchase,
  missingPoints,
} from '../src/cosmetics/cosmetics.js';

/**
 * Cosméticos — regras puras sobre a compra e o uso.
 *
 * O que estes testes travam: um cosmético desconhecido não se compra; comprar
 * duas vezes o mesmo é recusado (os pontos não saem duas vezes); sem saldo
 * não há compra; e equipar o que não é teu é impossível — o selo mostrado é
 * sempre um selo que alguém pagou.
 */
describe('catálogo', () => {
  it('tem identificadores únicos', () => {
    const ids = COSMETICS.map((cosmetic) => cosmetic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo o custo é positivo e alcançável', () => {
    // O catálogo de conquistas dá 440 pontos no total; nenhum cosmético custa
    // mais do que isso — senão seria decorção que ninguém consegue comprar.
    for (const cosmetic of COSMETICS) {
      expect(cosmetic.cost).toBeGreaterThan(0);
      expect(cosmetic.cost).toBeLessThanOrEqual(440);
    }
  });

  it('um identificador desconhecido custa 0 (não um número inventado)', () => {
    expect(cosmeticCost('badge-inexistente')).toBe(0);
    expect(cosmeticById('badge-inexistente')).toBeUndefined();
  });
});

describe('compra', () => {
  it('aceita quando há saldo e ainda não é teu', () => {
    const resultado = evaluatePurchase({ owned: [], balance: 100, cosmeticId: 'badge-owl' });
    expect(resultado.ok).toBe(true);
  });

  it('recusa um cosmético desconhecido', () => {
    expect(evaluatePurchase({ owned: [], balance: 100, cosmeticId: 'nao-existe' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('recusa comprar duas vezes', () => {
    expect(evaluatePurchase({ owned: ['badge-owl'], balance: 100, cosmeticId: 'badge-owl' })).toEqual({
      ok: false,
      reason: 'already-owned',
    });
  });

  it('recusa sem saldo — e não por ser desconhecido', () => {
    expect(evaluatePurchase({ owned: [], balance: 5, cosmeticId: 'badge-owl' })).toEqual({
      ok: false,
      reason: 'insufficient-funds',
    });
  });

  it('o saldo exacto chega (a fronteira é inclusiva)', () => {
    const resultado = evaluatePurchase({ owned: [], balance: 15, cosmeticId: 'badge-owl' });
    expect(resultado.ok).toBe(true);
  });
});

describe('equipar', () => {
  it('aceita o que é teu', () => {
    expect(equipOutcome({ owned: ['badge-owl'], cosmeticId: 'badge-owl' }).ok).toBe(true);
  });

  it('recusa o que não é teu', () => {
    expect(equipOutcome({ owned: [], cosmeticId: 'badge-owl' })).toEqual({
      ok: false,
      reason: 'already-owned',
    });
  });

  it('recusa um cosmético desconhecido', () => {
    expect(equipOutcome({ owned: [], cosmeticId: 'nao-existe' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('quanto falta', () => {
  it('é 0 quando o saldo chega', () => {
    expect(missingPoints(40, 'badge-owl')).toBe(0);
  });

  it('é a diferença quando não chega', () => {
    expect(missingPoints(10, 'badge-marathon')).toBe(30);
  });
});
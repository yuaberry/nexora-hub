import { describe, expect, it } from 'vitest';
import { isSubsequence, normalizeText, subsequenceCoverage } from '../../src/catalog/normalize.js';

describe('normalizeText', () => {
  it('remove acentos e coloca em minúsculas', () => {
    expect(normalizeText('Cybérpunk').full).toBe('cyberpunk');
    expect(normalizeText('TERRARIA').full).toBe('terraria');
  });

  it('colapsa separadores numa única sílaba por palavra', () => {
    const result = normalizeText('  Red   Dead:Redemption ');
    expect(result.full).toBe('red dead redemption');
    expect(result.syllables).toEqual(['red', 'dead', 'redemption']);
  });

  it('extrai o esqueleto de consoantes preservando dígitos', () => {
    expect(normalizeText('Minecraft').consonants).toBe('mncrft');
    expect(normalizeText('Cyberpunk 2077').consonants).toBe('cybrpnk2077');
  });

  it('marca texto vazio como vazio', () => {
    expect(normalizeText('   ').empty).toBe(true);
    expect(normalizeText('  - ').empty).toBe(true);
    expect(normalizeText('a').empty).toBe(false);
  });
});

describe('isSubsequence', () => {
  it('aceita subsequência com letras ausentes', () => {
    expect(isSubsequence('mncft', 'mncrft')).toBe(true);
    expect(isSubsequence('mncft', 'minecraft')).toBe(true);
  });

  it('recusa quando a ordem muda', () => {
    expect(isSubsequence('tfn', 'minecraft')).toBe(false);
  });

  it('recusa caracteres que não existem', () => {
    expect(isSubsequence('xyz', 'minecraft')).toBe(false);
  });

  it('agulha vazia é sempre subsequência', () => {
    expect(isSubsequence('', 'qualquer')).toBe(true);
  });
});

describe('subsequenceCoverage', () => {
  it('devolve o comprimento coberto', () => {
    expect(subsequenceCoverage('mncft', 'minecraft')).toBe(5);
  });

  it('devolve zero quando não há correspondência', () => {
    expect(subsequenceCoverage('xyz', 'minecraft')).toBe(0);
  });
});
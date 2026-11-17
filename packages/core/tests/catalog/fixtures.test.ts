import { describe, expect, it } from 'vitest';
import { CURATED_GAMES } from '../../src/catalog/fixtures.js';
import { aliasIndex, gameIdsByAlias, lookupExactAlias } from '../../src/catalog/alias-index.js';

describe('catálogo curado', () => {
  it('tem exactamente os dez jogos iniciais', () => {
    expect(CURATED_GAMES.map((game) => game.id)).toEqual([
      'league-of-legends',
      'minecraft',
      'terraria',
      'valorant',
      'counter-strike',
      'grand-theft-auto',
      'red-dead-redemption',
      'cyberpunk-2077',
      'fortnite',
      'roblox',
    ]);
  });

  it('não inventa capas', () => {
    expect(CURATED_GAMES.every((game) => game.cover === null)).toBe(true);
  });

  it('identificadores são únicos', () => {
    const ids = CURATED_GAMES.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('aliasIndex', () => {
  const index = aliasIndex(CURATED_GAMES);

  it('indexa o título e todos os aliases', () => {
    expect(index.filter((entry) => entry.gameId === 'counter-strike')).toHaveLength(6);
  });

  it('encontra um alias exacto', () => {
    expect(lookupExactAlias(index, 'CSGO')?.gameId).toBe('counter-strike');
    expect(lookupExactAlias(index, 'rdr2')?.gameId).toBe('red-dead-redemption');
  });

  it('devolve undefined quando não há correspondência exacta', () => {
    expect(lookupExactAlias(index, 'mncft')).toBeUndefined();
    expect(lookupExactAlias(index, '')).toBeUndefined();
  });

  it('resolve identificadores por alias', () => {
    expect(gameIdsByAlias('gta v', CURATED_GAMES)).toEqual(['grand-theft-auto']);
    expect(gameIdsByAlias('inexistente', CURATED_GAMES)).toEqual([]);
  });
});
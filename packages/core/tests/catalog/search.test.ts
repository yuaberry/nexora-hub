import { describe, expect, it } from 'vitest';
import { CURATED_GAMES } from '../../src/catalog/fixtures.js';
import { ownershipBonus, scoreCandidate, searchGames } from '../../src/catalog/search.js';
import type { OwnershipContext } from '../../src/types.js';

describe('searchGames — casos exigidos', () => {
  it('"l" coloca League of Legends em primeiro', () => {
    const hits = searchGames('l', CURATED_GAMES);
    expect(hits[0]?.game.id).toBe('league-of-legends');
    expect(hits[0]?.match).toBe('prefix');
  });

  it('"mncft" encontra Minecraft', () => {
    const hits = searchGames('mncft', CURATED_GAMES);
    expect(hits.map((hit) => hit.game.id)).toContain('minecraft');
    expect(hits[0]?.game.id).toBe('minecraft');
  });

  it('pesquisa exata por alias é mais forte que prefixo', () => {
    const hits = searchGames('gta', CURATED_GAMES);
    expect(hits[0]?.game.id).toBe('grand-theft-auto');
    expect(hits[0]?.match).toBe('alias-exact');
  });

  it('"2077" encontra Cyberpunk 2077 por sílaba', () => {
    const hits = searchGames('2077', CURATED_GAMES);
    expect(hits[0]?.game.id).toBe('cyberpunk-2077');
    expect(hits[0]?.match).toBe('syllable');
  });

  it('"dead" encontra Red Dead Redemption por sílaba', () => {
    const hits = searchGames('dead', CURATED_GAMES);
    expect(hits[0]?.game.id).toBe('red-dead-redemption');
    expect(hits[0]?.match).toBe('syllable');
  });

  it('"v" coloca VALORANT antes de qualquer outra coisa', () => {
    expect(searchGames('v', CURATED_GAMES)[0]?.game.id).toBe('valorant');
  });

  it('pesquisa vazia não devolve nada', () => {
    expect(searchGames('   ', CURATED_GAMES)).toHaveLength(0);
  });

  it('limite respeita o pedido', () => {
    const hits = searchGames('a', CURATED_GAMES, { limit: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('exclui conteúdo adulto quando pedido', () => {
    const ids = searchGames('gta', CURATED_GAMES, { includeAdult: false }).map((hit) => hit.game.id);
    expect(ids).not.toContain('grand-theft-auto');
    expect(ids).not.toContain('red-dead-redemption');
  });
});

describe('searchGames — desempate por posse/recência', () => {
  it('posse só empata; não promove acima do que foi pesquisado', () => {
    const withoutOwnership = searchGames('l', CURATED_GAMES);
    const owned: OwnershipContext = { ownedIds: new Set(['terraria']) };
    const withOwnership = searchGames('l', CURATED_GAMES, { ownership: owned });
    expect(withOwnership[0]?.game.id).toBe('league-of-legends');
    expect(withoutOwnership[0]?.game.id).toBe('league-of-legends');
  });

  it('recência recente aumenta o bónus', () => {
    const now: OwnershipContext = { ownedIds: new Set(), recencyById: new Map([['terraria', 3 * 86_400]]) };
    const old: OwnershipContext = { ownedIds: new Set(), recencyById: new Map([['terraria', 200 * 86_400]]) };
    expect(ownershipBonus('terraria', now)).toBeGreaterThan(ownershipBonus('terraria', old));
    expect(ownershipBonus('terraria', { ownedIds: new Set() })).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('distingue alias exacto de título exacto', () => {
    expect(scoreCandidate('csgo', 'csgo')?.kind).toBe('alias-exact');
    expect(scoreCandidate('counter-strike', 'Counter-Strike', true)?.kind).toBe('title-exact');
  });

  it('normaliza os dois lados antes de comparar', () => {
    expect(scoreCandidate('cyberpunk', 'Cyberpunk 2077', true)?.kind).toBe('prefix');
    expect(scoreCandidate('cyberpunk', '  CYBERPUNK  ', true)?.kind).toBe('title-exact');
    expect(scoreCandidate('minecraft', 'Minecraft', true)?.kind).toBe('title-exact');
  });

  it('devolve undefined quando não há correspondência', () => {
    expect(scoreCandidate('zzzz', 'Minecraft', true)).toBeUndefined();
    expect(scoreCandidate('', 'Minecraft', true)).toBeUndefined();
  });
});
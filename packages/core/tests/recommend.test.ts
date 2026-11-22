import { describe, expect, it } from 'vitest';
import {
  recommendFromTags,
  sharedTags,
  similarGames,
  tagSimilarity,
} from '../src/recommend/similar.js';
import { STORE_CATALOG } from '../src/store/catalog.js';
import type { StoreGame } from '../src/store/types.js';

/** Um jogo do catálogo pelo identificador. */
function jogo(id: string): StoreGame {
  const found = STORE_CATALOG.find((game) => game.id === id);
  if (found === undefined) {
    throw new Error(`jogo ${id} não está no catálogo`);
  }
  return found;
}

describe('tagSimilarity', () => {
  it('a sobreposição de etiquetas é a semelhança', () => {
    expect(tagSimilarity(['plataforma', 'indie'], ['plataforma', 'indie'])).toBe(1);
    expect(tagSimilarity(['plataforma'], ['plataforma', 'indie'])).toBeCloseTo(0.5, 2);
    expect(tagSimilarity(['plataforma'], ['rpg'])).toBe(0);
  });

  it('um conjunto vazio não recomenda nem é recomendado', () => {
    expect(tagSimilarity([], ['plataforma'])).toBe(0);
    expect(tagSimilarity(['plataforma'], [])).toBe(0);
  });

  it('as etiquetas partilhadas são a razão mostrada na interface', () => {
    expect(sharedTags(['plataforma', 'coop'], ['plataforma', 'rpg'])).toEqual(['plataforma']);
    expect(sharedTags(['plataforma'], ['rpg'])).toEqual([]);
  });
});

describe('similarGames', () => {
  it('Terraria recomenda o que partilha etiquetas', () => {
    const parecidos = similarGames(STORE_CATALOG, jogo('terraria'));
    // Hollow Knight partilha 'plataforma' com Terraria.
    expect(parecidos.map((entry) => entry.game.id)).toContain('hollow-knight');
    expect(parecidos[0]?.sharedTags.length).toBeGreaterThan(0);
  });

  it('o próprio jogo nunca aparece na lista', () => {
    const parecidos = similarGames(STORE_CATALOG, jogo('terraria'), { limit: 20 });
    expect(parecidos.some((entry) => entry.game.id === 'terraria')).toBe(false);
  });

  it('o limite é respeitado', () => {
    expect(similarGames(STORE_CATALOG, jogo('terraria'), { limit: 1 })).toHaveLength(1);
  });

  it('um jogo sem etiquetas não recomenda nada', () => {
    const semEtiquetas: StoreGame = { ...jogo('terraria'), id: 'vazio', tags: [] };
    expect(similarGames(STORE_CATALOG, semEtiquetas)).toHaveLength(0);
  });

  it('um mínimo declarado filtra os fracos', () => {
    const todos = similarGames(STORE_CATALOG, jogo('terraria'), { limit: 20 });
    const fortes = similarGames(STORE_CATALOG, jogo('terraria'), { limit: 20, minScore: 0.2 });
    expect(fortes.length).toBeLessThanOrEqual(todos.length);
    expect(fortes.every((entry) => entry.score >= 0.2)).toBe(true);
  });
});

describe('recommendFromTags', () => {
  it('quem joga plataforma e indie vê esses géneros à frente', () => {
    const recomendados = recommendFromTags(STORE_CATALOG, [
      { tag: 'plataforma', weight: 3 },
      { tag: 'indie', weight: 2 },
    ]);
    // Hollow Knight é plataforma E indie: fica à frente.
    expect(recomendados[0]?.game.id).toBe('hollow-knight');
    expect(recomendados[0]?.sharedTags).toContain('plataforma');
    expect(recomendados[0]?.sharedTags).toContain('indie');
  });

  it('o que já tenho não me é recomendado', () => {
    const recomendados = recommendFromTags(
      STORE_CATALOG,
      [{ tag: 'plataforma', weight: 3 }],
      { excludeIds: ['hollow-knight'] },
    );
    expect(recomendados.some((entry) => entry.game.id === 'hollow-knight')).toBe(false);
  });

  it('sem preferências não há recomendação (nada inventado)', () => {
    expect(recommendFromTags(STORE_CATALOG, [])).toHaveLength(0);
    expect(recommendFromTags(STORE_CATALOG, [{ tag: 'rpg', weight: 0 }])).toHaveLength(0);
  });

  it('a pontuação pondera as etiquetas pelo tempo jogado', () => {
    const primeiro = recommendFromTags(STORE_CATALOG, [{ tag: 'rpg', weight: 10 }]);
    const depois = recommendFromTags(STORE_CATALOG, [{ tag: 'rpg', weight: 1 }]);
    // A ordem mantém-se (é a mesma etiqueta), mas a pontuação muda com o peso.
    expect(primeiro[0]?.game.id).toBe(depois[0]?.game.id);
    expect(primeiro[0]?.score).toBeGreaterThan(depois[0]?.score ?? 0);
  });
});
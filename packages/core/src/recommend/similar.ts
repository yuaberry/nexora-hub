/**
 * Recomendações — um algoritmo **declarado**, não uma IA fingida.
 *
 * A semelhança entre dois jogos é a sobreposição das suas etiquetas
 * (Jaccard: partilhadas a dividir pela união). Não há modelo, não há rede
 * neural, não há "a NEXORA IA acha" — há uma fórmula que qualquer pessoa lê
 * e cujo resultado é reproduzível. A interface diz exactamente isto.
 *
 * Um jogo sem etiquetas não recomenda nem é recomendado: sem etiquetas não há
 * nada a comparar, e uma pontuação inventada seria uma mentira com cara de
 * número.
 */

import type { StoreGame } from '../store/types.js';

/** Uma recomendação. */
export interface SimilarGame {
  readonly game: StoreGame;
  /** Sobreposição das etiquetas (0 a 1). */
  readonly score: number;
  /** Etiquetas que os dois jogos partilham. */
  readonly sharedTags: readonly string[];
}

/**
 * A semelhança entre dois conjuntos de etiquetas (Jaccard).
 *
 * `0` quando um dos dois está vazio: a união nunca é vazia, e a divisão por
 * zero daria infinito — que não é uma pontuação.
 */
export function tagSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const a = new Set(left.map((tag) => tag.trim().toLowerCase()));
  const b = new Set(right.map((tag) => tag.trim().toLowerCase()));
  const shared = [...a].filter((tag) => b.has(tag));
  const union = new Set([...a, ...b]);
  return Math.round((shared.length / union.size) * 1000) / 1000;
}

/**
 * Jogos parecidos com um outro, do mais parecido para o menos.
 *
 * O próprio jogo nunca aparece na lista — recomendar o que a pessoa já viu
 * não é recomendação. `minScore` é o mínimo para entrar (a omissão é 0: a
 * lista mostra o que há, mesmo fracos, e a pontuação de cada um está à vista).
 */
export function similarGames(
  catalog: readonly StoreGame[],
  seed: StoreGame,
  options: { limit?: number; minScore?: number } = {},
): readonly SimilarGame[] {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0;
  return catalog
    .filter((game) => game.id !== seed.id)
    .map((game) => ({
      game,
      score: tagSimilarity(seed.tags, game.tags),
      sharedTags: sharedTags(seed.tags, game.tags),
    }))
    .filter((entry) => entry.score > 0 && entry.score >= minScore)
    .sort((left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title))
    .slice(0, limit);
}

/**
 * Recomendações a partir das etiquetas de quem joga.
 *
 * A pontuação é a soma das semelhanças contra cada etiqueta preferida — quem
 * joga muito *plataforma* e *indie* vê jogos de *plataforma* e *indie* à
 * frente. Os jogos que a pessoa já tem (`excludeIds`) ficam fora: recomendar
 * o que está instalado não é recomendação.
 */
export function recommendFromTags(
  catalog: readonly StoreGame[],
  preferredTags: readonly { readonly tag: string; readonly weight: number }[],
  options: { limit?: number; excludeIds?: readonly string[] } = {},
): readonly SimilarGame[] {
  const limit = options.limit ?? 5;
  const excluded = new Set(options.excludeIds ?? []);
  const tags = preferredTags.filter((entry) => entry.weight > 0 && entry.tag.trim() !== '');
  if (tags.length === 0) {
    return [];
  }
  return catalog
    .filter((game) => !excluded.has(game.id))
    .map((game) => {
      const shared: string[] = [];
      let score = 0;
      for (const preference of tags) {
        const similarity = tagSimilarity([preference.tag], game.tags);
        if (similarity > 0) {
          shared.push(preference.tag);
          score += preference.weight * similarity;
        }
      }
      return { game, score: Math.round(score * 1000) / 1000, sharedTags: shared };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title))
    .slice(0, limit);
}

/** As etiquetas que dois jogos partilham (a razão da recomendação). */
export function sharedTags(left: readonly string[], right: readonly string[]): readonly string[] {
  const a = new Set(left.map((tag) => tag.trim().toLowerCase()));
  return right
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => a.has(tag))
    .filter((tag, index, all) => all.indexOf(tag) === index);
}
import type { FastifyInstance } from 'fastify';
import {
  recommendFromTags,
  similarGames,
  STORE_CATALOG,
  type StoreGame,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Recomendações — um algoritmo **declarado**, não uma IA fingida.
 *
 * A semelhança entre jogos é a sobreposição das etiquetas (Jaccard) e a
 * recomendação pessoal pondera essas semelhanças pelo **tempo realmente
 * jogado** em cada etiqueta. Não há modelo nem rede: há uma fórmula, e a
 * interface diz o que é. Um jogo sem etiquetas não recomenda nem é
 * recomendado.
 */

/** Quantas recomendações devolver. */
const MAX_RECOMMENDATIONS = 6;

/**
 * Nome normalizado para comparar o catálogo com a biblioteca.
 *
 * A biblioteca guarda o título que o utilizador viu e a chave externa da
 * pasta; o catálogo guarda o título e o slug. Comparar os dois por
 * **minúsculas sem separadores** é a forma honesta de saber o que a pessoa já
 * tem — não é garantido (o título pode diferir), e por isso a interface diz
 * que a recomendação é pelas etiquetas, não uma promessa de variedade.
 */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Os jogos do catálogo que a pessoa já tem na biblioteca. */
function ownedCatalogIds(
  catalog: readonly StoreGame[],
  library: readonly { readonly title: string; readonly externalKey: string }[],
): readonly string[] {
  const owned = new Set(library.flatMap((entry) => [normalizeName(entry.title), normalizeName(entry.externalKey)]));
  return catalog
    .filter((game) => owned.has(normalizeName(game.title)) || owned.has(normalizeName(game.id)))
    .map((game) => game.id);
}

/** A vista de uma recomendação. */
function toView(entry: { game: StoreGame; score: number; sharedTags: readonly string[] }): Record<string, unknown> {
  return {
    gameId: entry.game.id,
    title: entry.game.title,
    tagline: entry.game.tagline,
    platforms: entry.game.platforms,
    adult: entry.game.adult,
    score: entry.score,
    sharedTags: entry.sharedTags,
  };
}

/** Regista as rotas de recomendação. */
export function registerRecommendRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Parecidos com um jogo do directório (público, como a loja).
  app.get('/api/v1/recommendations/similar/:gameId', async (request) => {
    const gameId = (request.params as { gameId: string }).gameId;
    const seed = STORE_CATALOG.find((game) => game.id === gameId);
    if (seed === undefined) {
      throw errors.notFound('Jogo não encontrado no directório.');
    }
    const items = similarGames(STORE_CATALOG, seed, { limit: MAX_RECOMMENDATIONS });
    return { items: items.map(toView) };
  });

  /**
   * Recomendações pela forma como a pessoa joga.
   *
   * As etiquetas preferidas saem da **biblioteca da conta**, ponderadas pelo
   * tempo realmente jogado — quem tem 40 h de *plataforma* vê *plataforma* à
   * frente. A rota exige sessão porque lê a biblioteca da conta.
   */
  app.get('/api/v1/recommendations/for-you', async (request) => {
    const actor = requireAuth(request);
    const library = await repositories.library.listByUser(actor.id);
    if (library.length === 0) {
      // Sem biblioteca não há preferências: a resposta é vazia, e a interface
      // explica o que falta em vez de mostrar algo genérico.
      return { items: [], reason: 'no-library' };
    }

    const weights = new Map<string, number>();
    for (const entry of library) {
      for (const tag of entry.tags) {
        // O peso é o tempo jogado nas entradas que têm a etiqueta — a soma
        // não é normalizada: o que conta é jogar muito, e o valor exacto
        // aparece na razão da recomendação.
        weights.set(tag, (weights.get(tag) ?? 0) + Math.max(1, entry.totalSeconds / 3600));
      }
    }
    const preferredTags = [...weights.entries()]
      .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 10) / 10 }))
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 8);

    const items = recommendFromTags(STORE_CATALOG, preferredTags, {
      limit: MAX_RECOMMENDATIONS,
      // O que a pessoa já tem não lhe é recomendado: a recomendação é para
      // descobrir, não para mostrar o que está instalado.
      excludeIds: ownedCatalogIds(STORE_CATALOG, library),
    });
    return {
      items: items.map(toView),
      reason: 'library-tags',
      preferredTags,
    };
  });
}
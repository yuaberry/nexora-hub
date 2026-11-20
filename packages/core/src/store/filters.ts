/**
 * Filtros do directório da loja.
 *
 * Funções puras: o mesmo pedido dá sempre o mesmo resultado. O filtro adulto
 * é **declarado e aplicado** — quem pede para esconder, esconde — e o filtro
 * de plataforma usa as plataformas em que o jogo corre.
 */

import { normalizeText } from '../catalog/normalize.js';
import type { StoreGame, StorePlatform } from './types.js';

/** Opções de filtro do directório. */
export interface StoreFilters {
  /** Termo de pesquisa (título, alias, tag ou etiqueta). */
  readonly query?: string;
  /** Esconder conteúdo adulto (por omissão, sim — o filtro adulto é seguro). */
  readonly hideAdult?: boolean;
  /** Mostrar só jogos que correm nesta plataforma. */
  readonly platform?: StorePlatform | null;
  /** Número máximo de resultados. */
  readonly limit?: number;
}

/** Filtra o directório. */
export function filterStore(
  catalog: readonly StoreGame[],
  filters: StoreFilters = {},
): readonly StoreGame[] {
  const normalized = normalizeText(filters.query ?? '');
  const hideAdult = filters.hideAdult ?? true;

  const filtered = catalog.filter((game) => {
    if (hideAdult && game.adult) {
      return false;
    }
    if (filters.platform !== undefined && filters.platform !== null) {
      // Uma entrada sem plataformas declaradas não passa em nenhum filtro de
      // plataforma: prometer que corre onde não se sabe seria mentira.
      if (!Array.isArray(game.platforms) || !game.platforms.includes(filters.platform)) {
        return false;
      }
    }
    if (normalized.empty) {
      return true;
    }
    const haystacks = [game.title, ...game.aliases, game.tagline, ...game.tags];
    return haystacks.some((value) => normalizeText(value).full.includes(normalized.full));
  });

  const limit = filters.limit ?? filtered.length;
  return filtered.slice(0, limit);
}

/** `true` quando um jogo tem ligação para uma loja específica. */
export function hasStoreLink(game: StoreGame, store: string): boolean {
  return game.links.some((link) => link.store === store);
}

/** A primeira ligação de compra disponível (a interface usa-a para o botão). */
export function primaryLink(game: StoreGame): StoreGame['links'][number] | null {
  return game.links[0] ?? null;
}
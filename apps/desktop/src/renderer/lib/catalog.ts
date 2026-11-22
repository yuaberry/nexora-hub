/**
 * Catálogo do renderer.
 *
 * As entradas são as do utilizador (biblioteca local) — a pesquisa nunca
 * devolve jogos que não estão instalados. O catálogo curado só serve para
 * **enriquecer aliases**: uma pasta chamada "league-of-legends" ganha os
 * aliases "lol"/"league" para a pesquisa, sem criar entradas fantasmas.
 */

import { CURATED_GAMES, searchGames, type Game, type SearchHit } from '@nexora/core';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Último segmento de um caminho.
 *
 * JS puro, de propósito: o renderer é um contexto de browser isolado — não
 * pode importar `node:path` nem nenhum módulo do Node.
 */
function lastSegment(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter((part) => part !== '');
  return parts[parts.length - 1] ?? '';
}

/**
 * Converte uma entrada local em entrada de catálogo.
 *
 * O nome da pasta entra como alias: quem escreve parte do caminho encontra o
 * jogo pelo nome que lhe deu.
 */
export function toCatalogEntry(view: DesktopGameView): Game {
  const curated = CURATED_GAMES.find(
    (game) => game.title.toLowerCase() === view.title.toLowerCase(),
  );
  const aliases = new Set<string>(curated?.aliases ?? []);
  // Entrada de catálogo não tem pasta: o alias é a chave externa.
  aliases.add(view.installPath === null ? view.externalKey : lastSegment(view.installPath));
  return {
    id: view.externalKey,
    title: view.title,
    cover: view.cover,
    provider: 'local',
    tags: view.tags,
    // Apenas entradas do utilizador: a marcação adulta é da loja (fase
    // futura) e nenhum jogo local é rotulado aqui sem origem honesta.
    adult: false,
    aliases: [...aliases],
  };
}

/** Opções de posse/recência (a posse é sempre do utilizador). */
export function ownershipFor(views: readonly DesktopGameView[]): {
  ownedIds: ReadonlySet<string>;
  recencyById: ReadonlyMap<string, number>;
} {
  const now = Date.now();
  const recencyById = new Map<string, number>();
  for (const view of views) {
    if (view.lastPlayedAt !== null) {
      const played = Date.parse(view.lastPlayedAt);
      if (!Number.isNaN(played)) {
        recencyById.set(view.externalKey, Math.max(0, (now - played) / 1000));
      }
    }
  }
  return { ownedIds: new Set(views.map((view) => view.externalKey)), recencyById };
}

/**
 * Pesquisa na biblioteca local.
 *
 * Usa o mesmo motor da web (`searchGames`): "l" encontra League of Legends,
 * "mncft" encontra Minecraft — mas apenas entre os jogos do utilizador.
 */
export function searchLocalLibrary(
  query: string,
  views: readonly DesktopGameView[],
  limit = 8,
): readonly SearchHit[] {
  if (query.trim() === '') {
    return [];
  }
  const catalog = views.map(toCatalogEntry);
  return searchGames(query, catalog, { ownership: ownershipFor(views), limit });
}
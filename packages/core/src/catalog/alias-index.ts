import type { Game } from '../types.js';
import { normalizeText, type NormalizedText } from './normalize.js';

/**
 * Índice de aliases de um catálogo.
 *
 * O launcher reconhece jogos pela **forma como as pessoas lhes chamam**:
 * "CS", "LoL", "RDR2". O índice junta o título e todos os aliases de cada
 * jogo numa única tabela normalizada — é o que a pesquisa percorre, e é
 * também o que o detector de pastas locais consulta ao importar.
 */
export interface AliasEntry {
  readonly gameId: string;
  /** Texto do alias como está no catálogo (para exibir). */
  readonly alias: string;
  /** Forma normalizada usada na comparação. */
  readonly normalized: NormalizedText;
  /** `true` quando a entrada é o próprio título do jogo. */
  readonly isTitle: boolean;
}

/** Constrói o índice de aliases (título + aliases) de um catálogo. */
export function aliasIndex(catalog: readonly Game[]): readonly AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const game of catalog) {
    const names: Array<{ text: string; isTitle: boolean }> = [
      { text: game.title, isTitle: true },
      ...game.aliases.map((alias) => ({ text: alias, isTitle: false })),
    ];
    for (const name of names) {
      entries.push({
        gameId: game.id,
        alias: name.text,
        normalized: normalizeText(name.text),
        isTitle: name.isTitle,
      });
    }
  }
  return entries;
}

/**
 * Procura uma entrada **exacta** no índice.
 *
 * Devolve `undefined` quando nada corresponde exactamente — a aproximação é
 * responsabilidade da pesquisa (`searchGames`), não do índice.
 */
export function lookupExactAlias(
  index: readonly AliasEntry[],
  query: string,
): AliasEntry | undefined {
  const normalized = normalizeText(query);
  if (normalized.empty) {
    return undefined;
  }
  return index.find((entry) => entry.normalized.full === normalized.full);
}

/**
 * Identificadores cobertos por um alias.
 *
 * Um alias pode apontar para mais do que um jogo (nomes ambíguos); a
 * pesquisa resolve a ambiguidade pela pontuação, não por exclusão.
 */
export function gameIdsByAlias(query: string, catalog: readonly Game[]): readonly string[] {
  const normalized = normalizeText(query);
  if (normalized.empty) {
    return [];
  }
  return catalog
    .filter((game) => game.title === query || game.aliases.includes(query))
    .map((game) => game.id);
}
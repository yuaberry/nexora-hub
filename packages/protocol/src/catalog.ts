/**
 * Contrato de catálogo e biblioteca.
 *
 * A biblioteca é o que o utilizador **tem**: entradas vindas de pastas
 * locais ou de importação explícita. A NEXORA não hospeda nem redistribui
 * conteúdo de jogos, por isso não existe aqui nenhum campo de "download",
 * "compra" ou "licença" — a loja é outra fase (e outro contrato).
 */

import type { Page } from './pagination.js';

/** Origem de uma entrada da biblioteca. */
export type GameProvider = 'local' | 'user-import' | 'official-import';

/** Uma entrada da biblioteca (visão HTTP). */
export interface LibraryGame {
  readonly id: string;
  readonly title: string;
  /** Caminho local da capa, ou `null` (a interface desenha o placeholder). */
  readonly cover: string | null;
  readonly provider: GameProvider;
  readonly tags: readonly string[];
  readonly adult: boolean;
  /** Caminho da pasta instalada, quando conhecido. */
  readonly installPath: string | null;
  /** Caminho do executável principal detectado, quando conhecido. */
  readonly executablePath: string | null;
  readonly favorite: boolean;
  /** Colecções do utilizador a que a entrada pertence. */
  readonly collections: readonly string[];
  /** ISO-8601 UTC da última sessão, ou `null`. */
  readonly lastPlayedAt: string | null;
  /** Tempo jogado total, em segundos. */
  readonly totalSeconds: number;
}

/** Resultado da pesquisa (o ranking vem de `@nexora/core`). */
export interface GameSearchHit {
  readonly game: LibraryGame;
  readonly score: number;
  /** Como a correspondência foi encontrada (explicável ao utilizador). */
  readonly match:
    | 'alias-exact'
    | 'title-exact'
    | 'prefix'
    | 'syllable'
    | 'consonant-prefix'
    | 'fuzzy';
}

export interface GameCollection {
  readonly id: string;
  readonly name: string;
  readonly gameIds: readonly string[];
}

/** PUT `/library/:id/favorite` — corpo aceite. */
export interface FavoriteRequest {
  readonly favorite: boolean;
}

/** POST `/library/collections` — corpo aceite. */
export interface CollectionCreateRequest {
  readonly name: string;
}

/** Resposta de listagem da biblioteca. */
export type LibraryPage = Page<LibraryGame>;
export type GameSearchPage = Page<GameSearchHit>;
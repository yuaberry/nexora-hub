/**
 * Tipos de domínio do NEXORA HUB.
 *
 * O launcher é um **cliente**: a NEXORA não hospeda nem redistribui conteúdo
 * de jogos. Um jogo entra na biblioteca por ficheiros locais do utilizador ou
 * por importação oficial (futura). Nenhum campo deste tipo promete download,
 * loja ou saves na nuvem — essas peças são só interface neste momento.
 */

/**
 * Origem da entrada de catálogo.
 *
 * - `local`: pasta local detectada/importada pelo utilizador;
 * - `user-import`: ficheiro ou pasta escolhida explicitamente;
 * - `official-import`: importação a partir de uma loja oficial (**planeada**).
 */
export type GameProvider = 'local' | 'user-import' | 'official-import';

/** Uma entrada do catálogo de jogos. */
export interface Game {
  /** Identificador estável (slug). */
  readonly id: string;
  /** Título de exibição. */
  readonly title: string;
  /** Nomes alternativos (siglas, nomes noutros idiomas, títulos antigos). */
  readonly aliases: readonly string[];
  /**
   * Capa: caminho local, `nexora-hub://` ou `null`.
   *
   * `null` significa **sem capa** — a interface desenha o placeholder do tema.
   * Nunca se inventa uma capa: uma imagem errada é pior que nenhuma.
   */
  readonly cover: string | null;
  /** Origem da entrada. */
  readonly provider: GameProvider;
  /** Etiquetas livres (género, modo, motor…). */
  readonly tags: readonly string[];
  /** Marcador de conteúdo adulto (filtro de exibição). */
  readonly adult: boolean;
}

/** Nível de correspondência entre a pesquisa e uma entrada de catálogo. */
export type MatchKind =
  /** O texto pesquisado é exactamente um alias. */
  | 'alias-exact'
  /** O texto pesquisado é exactamente o título. */
  | 'title-exact'
  /** O título (ou um alias) começa pelo texto pesquisado. */
  | 'prefix'
  /** O texto pesquisado é o início de uma das palavras do título/alias. */
  | 'syllable'
  /** O esqueleto de consoantes do título começa pelo pesquisado. */
  | 'consonant-prefix'
  /** Correspondência aproximada (subsequência). */
  | 'fuzzy';

/** Um resultado da pesquisa, já ordenado. */
export interface SearchHit {
  readonly game: Game;
  /** Pontuação (maior = mais relevante). */
  readonly score: number;
  /** Como a correspondência foi encontrada (para explicar na interface). */
  readonly match: MatchKind;
  /**
   * Bónus de posse/recência aplicado ao resultado.
   *
   * É o último critério de ordenação — nunca o primeiro: possuir um jogo não o
   * torna o que o utilizador procurou.
   */
  readonly ownedBonus: number;
}

/** Estado de posse de uma entrada (alimenta o bónus de recência). */
export interface OwnershipContext {
  /** Identificadores possuídos pelo utilizador. */
  readonly ownedIds: ReadonlySet<string>;
  /** Segundos desde a última sessão, por jogo (menor = mais recente). */
  readonly recencyById?: ReadonlyMap<string, number>;
}
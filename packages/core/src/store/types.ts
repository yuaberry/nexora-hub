/**
 * Domínio da loja — directório de compras, não uma loja.
 *
 * A NEXORA não vende nem hospedeia jogos: a loja é um **directório** de jogos
 * com ligações para as lojas oficiais (Steam, Epic, GOG…). O preço, quando
 * mostrado, é uma referência declarada — não uma cobrança da NEXORA.
 *
 * Nada aqui promete download: quem compra, compra na loja oficial.
 */

/** Plataformas suportadas pelo directório. */
export const STORE_PLATFORMS = ['windows', 'linux', 'macos'] as const;
export type StorePlatform = (typeof STORE_PLATFORMS)[number];

/** Lojas oficiais suportadas. */
export const STORES = ['steam', 'epic', 'gog', 'official'] as const;
export type StoreId = (typeof STORES)[number];

/** Uma ligação de compra para uma loja oficial. */
export interface StoreLink {
  readonly store: StoreId;
  /** URL absoluta da página de compra. */
  readonly url: string;
  /** Preço de referência (moeda declarada), ou `null` quando desconhecido. */
  readonly price: number | null;
  /** Moeda do preço (ISO 4217), ou `null`. */
  readonly currency: string | null;
}

/** Um jogo no directório da loja. */
export interface StoreGame {
  /** Identificador estável (slug). */
  readonly id: string;
  readonly title: string;
  /** Nomes alternativos (para a pesquisa). */
  readonly aliases: readonly string[];
  /** Descrição curta (uma linha). */
  readonly tagline: string;
  /** Caminho local da capa, ou `null` (a interface desenha o placeholder). */
  readonly cover: string | null;
  /** Plataformas em que o jogo corre. */
  readonly platforms: readonly StorePlatform[];
  /** Marcador de conteúdo adulto (filtro de exibição). */
  readonly adult: boolean;
  /** Ligações de compra (uma ou mais lojas oficiais). */
  readonly links: readonly StoreLink[];
  /** Etiquetas (género, modo…). */
  readonly tags: readonly string[];
}

/** Um item da lista de desejos. */
export interface WishlistItem {
  /** Identificador do jogo no directório. */
  readonly gameId: string;
  /** ISO-8601 UTC de quando foi adicionado. */
  readonly addedAt: string;
}
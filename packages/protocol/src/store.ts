/**
 * Contrato da loja — directório de compras e lista de desejos.
 *
 * A loja é um directório: jogos com ligações para lojas oficiais. A NEXORA
 * não vende nem hospedeia nada — quem compra, compra na loja.
 */

/** Uma ligação de compra (vista HTTP). */
export interface StoreLinkView {
  readonly store: string;
  readonly url: string;
  readonly price: number | null;
  readonly currency: string | null;
}

/** Um jogo no directório (vista HTTP). */
export interface StoreGameView {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tagline: string;
  readonly cover: string | null;
  readonly platforms: readonly string[];
  readonly adult: boolean;
  readonly tags: readonly string[];
  readonly links: readonly StoreLinkView[];
}

/** Resposta do directório. */
export interface StorePageView {
  readonly items: readonly StoreGameView[];
  readonly total: number;
}

/** Um item da lista de desejos (vista HTTP). */
export interface WishlistItemView {
  readonly gameId: string;
  readonly addedAt: string;
}

/** Resposta da lista de desejos. */
export interface WishlistPageView {
  readonly items: readonly WishlistItemView[];
}

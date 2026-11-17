/**
 * Paginação do contrato.
 *
 * `limit` e `offset` vêm na query string: são **do cliente**, e um valor
 * malformado é um pedido inválido (`400 invalid_request` com o envelope do
 * contrato) — nunca um `500`. Os limites são os mesmos do Nexora Cloud, para
 * que os clientes não tenham de aprender dois contratos.
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export interface PageQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface PageMeta {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
}

/** Envelope de listagem: os itens e o bloco `page`. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: PageMeta;
}

/** Monta o bloco `page` de uma listagem. */
export function pageMeta(total: number, query: PageQuery): PageMeta {
  return { limit: query.limit, offset: query.offset, total };
}
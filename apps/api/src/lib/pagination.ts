import { errors } from '../plugins/errorHandler.js';

/**
 * Paginação — erro **do cliente**, nunca `500`.
 *
 * `limit` e `offset` vêm na query string: um valor malformado (`limit=101`,
 * `limit=abc`, `offset=-1`) é um pedido inválido e devolve
 * `400 invalid_request` com o envelope do contrato e a mesma forma de
 * `details` que a validação Zod — para que o cliente tenha o caminho do campo
 * sem parsear texto livre.
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export interface PageQuery {
  limit: number;
  offset: number;
}

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

function invalidPagination(path: string, message: string) {
  return errors.invalidRequest('Payload inválido.', [{ path, message, code: 'invalid_value' }]);
}

/** Normaliza `limit`/`offset` recebidos em query string. */
export function parsePagination(query: Record<string, unknown>): PageQuery {
  const rawLimit = query['limit'];
  const rawOffset = query['offset'];

  const limit = typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : DEFAULT_LIMIT;
  const offset = typeof rawOffset === 'string' && rawOffset.trim() !== '' ? Number(rawOffset) : 0;

  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalidPagination('limit', `Esperado um inteiro entre 1 e ${MAX_LIMIT}.`);
  }
  if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
    throw invalidPagination('offset', 'Esperado um inteiro não negativo.');
  }

  return { limit, offset };
}

/** Monta o bloco `page` do envelope de listagem. */
export function pageMeta(total: number, query: PageQuery): PageMeta {
  return { limit: query.limit, offset: query.offset, total };
}
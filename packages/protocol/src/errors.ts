/**
 * Envelope de erro do contrato HTTP.
 *
 * Um único formato para todos os erros — inclusive os do cliente (JSON
 * malformado, paginação inválida), que **nunca** saem como `500`. O
 * `requestId` é o que permite ao utilizador relatar um problema sem expor
 * detalhes internos: o log do servidor fica com o detalhe, a resposta fica
 * com a mensagem pública.
 *
 * Este formato é espelhado de `@nexora/api` (Nexora Cloud): o mesmo envelope
 * para o launcher e para a plataforma de nuvem, para que o cliente dedicado
 * ao Cloud não precise de traduzir erros.
 */

/** Códigos de erro do contrato. */
export type ErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'mfa_required'
  | 'not_found'
  | 'conflict'
  | 'capacity_unavailable'
  | 'account_locked'
  | 'rate_limited'
  | 'service_unavailable'
  | 'internal_error';

export interface ErrorDetail {
  /** Caminho do campo com problema (`"limit"`, `"body.email"`). */
  readonly path: string;
  /** Mensagem legível. */
  readonly message: string;
  /** Código da falha. */
  readonly code: string;
}

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: readonly ErrorDetail[] | unknown;
    readonly requestId: string;
  };
}

/** Constrói o envelope de erro (a mesma forma em toda a API). */
export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId,
    },
  };
}
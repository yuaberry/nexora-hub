import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { AuthUser, UserRole } from './auth.js';

/**
 * Envelope de erro do contrato.
 *
 * Um único formato para todos os erros, com `requestId`. A stack é registada
 * apenas no log do servidor — nunca na resposta. Um erro **do cliente** (JSON
 * malformado, média type recusado, paginação inválida) sai como `4xx` com
 * este envelope, nunca como `500` (ver `fastifyClientError`).
 */

/** Erro de aplicação com mapeamento directo para o envelope. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  invalidRequest: (message: string, details?: unknown) =>
    new AppError(400, 'invalid_request', message, details),
  unauthenticated: (message = 'Token ausente, expirado ou inválido.') =>
    new AppError(401, 'unauthenticated', message),
  forbidden: (message = 'Permissão insuficiente para esta operação.') =>
    new AppError(403, 'forbidden', message),
  notFound: (message = 'Recurso não encontrado.') => new AppError(404, 'not_found', message),
  conflict: (message: string, details?: unknown) => new AppError(409, 'conflict', message, details),
  rateLimited: (message = 'Limite de requisições excedido.') =>
    new AppError(429, 'rate_limited', message),
  serviceUnavailable: (message = 'Serviço temporariamente indisponível.') =>
    new AppError(503, 'service_unavailable', message),
  internal: (message = 'Erro interno.') => new AppError(500, 'internal_error', message),
};

/** Envelope único de erro — a mesma forma em toda a API. */
export function errorEnvelope(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): {
  error: { code: string; message: string; details?: unknown; requestId: string };
} {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId,
    },
  };
}

/** Registra o handler de erro do contrato. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      reply
        .code(error.statusCode)
        .send(errorEnvelope(error.code, error.message, requestId, error.details));
      return;
    }

    if (error instanceof ZodError) {
      reply.code(400).send(
        errorEnvelope(
          'invalid_request',
          'Payload inválido.',
          requestId,
          error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        ),
      );
      return;
    }

    // Erros do próprio Fastify (corpo malformado, média type, tamanho): são
    // do **pedido**, não falhas internas. Só os `FST_ERR_*` entram aqui — um
    // erro interno que traga um `statusCode` continua a ser interno.
    const clientError = fastifyClientError(error);
    if (clientError !== undefined) {
      reply
        .code(clientError.statusCode)
        .send(errorEnvelope(clientError.code, clientError.message, requestId));
      return;
    }

    request.log.error({ err: error, requestId }, 'erro não tratado');
    reply.code(500).send(errorEnvelope('internal_error', 'Erro interno.', requestId));
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .code(404)
      .send(errorEnvelope('not_found', 'Recurso não encontrado.', request.id));
  });
}

/**
 * Erro **do cliente** produzido pelo Fastify.
 *
 * Exportada para ser testada directamente: o cliente de teste HTTP não
 * consegue produzir todos os média types que o Fastify recusa.
 */
export function fastifyClientError(error: unknown):
  | { statusCode: number; code: string; message: string }
  | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const candidate = error as { statusCode?: unknown; code?: unknown };
  if (typeof candidate.code !== 'string' || !candidate.code.startsWith('FST_ERR_')) {
    return undefined;
  }
  const statusCode = candidate.statusCode;
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 500) {
    return undefined;
  }
  if (statusCode === 404) {
    return { statusCode, code: 'not_found', message: 'Recurso não encontrado.' };
  }
  if (statusCode === 413) {
    return { statusCode, code: 'invalid_request', message: 'Payload demasiado grande.' };
  }
  if (statusCode === 415) {
    return { statusCode, code: 'invalid_request', message: 'Tipo de conteúdo não suportado.' };
  }
  return { statusCode: 400, code: 'invalid_request', message: 'Payload inválido.' };
}

/**
 * Exige um utilizador autenticado e devolve-o.
 *
 * Devolver o utilizador (em vez de apenas validar) permite ao TypeScript
 * estreitar `request.user` de `AuthUser | null` para `AuthUser`.
 */
export function requireAuth(request: FastifyRequest): AuthUser {
  if (request.user === null) {
    throw errors.unauthenticated();
  }
  return request.user;
}

/** Exige um papel específico (usado pelas rotas de administração). */
export function requireRole(role: UserRole) {
  return (request: FastifyRequest): AuthUser => {
    const user = requireAuth(request);
    if (user.role !== role) {
      throw errors.forbidden(`Acesso restrito ao papel '${role}'.`);
    }
    return user;
  };
}
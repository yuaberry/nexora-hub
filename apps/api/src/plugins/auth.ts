import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { errors } from './errorHandler.js';
import type { UserRole } from '../db/types.js';

export type { UserRole };

/**
 * Autenticação por JWT HS256 — espelho do Nexora Cloud.
 *
 * O token de acesso é **stateless** (1 h) e identifica o pedido; o token de
 * renovação é opaco, rotativo e revogável (ver `modules/auth/refresh-token.ts`).
 * Tokens inválidos ou expirados derrubam o pedido com `401` — a resposta é
 * uniforme e não diz *porque* falhou.
 */

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/** Assina um token JWT HS256 com o segredo da plataforma. */
export function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
  now: Date = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const body: TokenPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(HEADER));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = sign(`${encodedHeader}.${encodedBody}`, secret);
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

/** Verifica assinatura e expiração de um token JWT HS256. */
export function verifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): TokenPayload | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }

  const [encodedHeader, encodedBody, signature] = parts as [string, string, string];
  const expected = sign(`${encodedHeader}.${encodedBody}`, secret);

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as { alg?: string };
  if (header.alg !== 'HS256') {
    return undefined;
  }

  const payload = JSON.parse(base64UrlDecode(encodedBody).toString('utf8')) as TokenPayload;
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    return undefined;
  }
  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    return undefined;
  }
  return payload;
}

export interface AuthPluginOptions {
  secret: string;
  ttlSeconds: number;
  /** Relógio injectável — os testes controlam o tempo. */
  now?: () => Date;
}

/** Registra a autenticação na instância do Fastify. */
export function registerAuth(app: FastifyInstance, options: AuthPluginOptions): void {
  app.decorateRequest('user', null);
  const now = options.now ?? (() => new Date());

  app.addHook('preHandler', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (header === undefined) {
      return;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
      throw errors.unauthenticated('Header Authorization inválido.');
    }

    // O relógio é injectável: um token emitido pelo serviço com o relógio de
    // teste tem de ser verificado com o **mesmo** relógio.
    const payload = verifyToken(token, options.secret, now());
    if (payload === undefined) {
      throw errors.unauthenticated();
    }
    request.user = { id: payload.sub, email: payload.email, role: payload.role };
  });
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}
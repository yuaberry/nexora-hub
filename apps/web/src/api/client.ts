import type { ErrorCode, ErrorEnvelope } from '@nexora/protocol';

/**
 * Cliente HTTP da web.
 *
 * Um único sítio onde a interface fala com a API. O token vive no
 * **`sessionStorage`** — nunca no `localStorage`: uma sessão de navegador
 * fechada não pode deixar credencial para trás.
 *
 * A renovação é *single-flight*: dois `401` em paralelo dão **um** pedido —
 * o servidor trataria a repetição como reutilização do token de renovação e
 * mataria a família.
 */

const ACCESS_TOKEN_KEY = 'nexora.hub.accessToken';
const REFRESH_TOKEN_KEY = 'nexora.hub.refreshToken';

/** Base da API: o proxy `/api` em desenvolvimento, o esquema interno no desktop. */
function apiBase(): string {
  return '';
}

/** Lê uma entrada do `sessionStorage` sem nunca levantar excepção. */
function readSession(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Escreve uma entrada no `sessionStorage`. */
function writeSession(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Armazenamento indisponível: a sessão fica só em memória.
  }
}

/** Apaga as credenciais da sessão. */
export function clearSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(ACCESS_TOKEN_KEY);
    globalThis.sessionStorage?.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // nada a limpar
  }
}

/** Guarda o par de tokens. */
export function storeTokens(accessToken: string, refreshToken: string): void {
  writeSession(ACCESS_TOKEN_KEY, accessToken);
  writeSession(REFRESH_TOKEN_KEY, refreshToken);
}

/** Token de acesso da sessão (`null` quando não há sessão). */
export function accessToken(): string | null {
  return readSession(ACCESS_TOKEN_KEY);
}

/** Token de renovação da sessão (`null` quando não há sessão). */
export function refreshToken(): string | null {
  return readSession(REFRESH_TOKEN_KEY);
}

/** Erro de contrato — carrega o código e a mensagem do envelope. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly requestId: string | undefined;

  constructor(statusCode: number, envelope: ErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = envelope.error.code as ErrorCode;
    this.requestId = envelope.error.requestId;
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly auth?: boolean;
  /** Não repetir o pedido depois de renovar (a rota de renovação nunca repete). */
  readonly skipRetry?: boolean;
}

/** Promessa de renovação em voo — o *single-flight*. */
let refreshInFlight: Promise<boolean> | null = null;

/** Pede um token novo; um único pedido para vários `401` em paralelo. */
function renewSession(): Promise<boolean> {
  const token = refreshToken();
  if (token === null) {
    return Promise.resolve(false);
  }
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }

  refreshInFlight = fetch(`${apiBase()}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  })
    .then(async (response) => {
      if (!response.ok) {
        clearSession();
        return false;
      }
      const body = (await response.json()) as { tokens: { accessToken: string; refreshToken: string } };
      storeTokens(body.tokens.accessToken, body.tokens.refreshToken);
      return true;
    })
    .catch(() => {
      clearSession();
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** Faz um pedido à API, renovando a sessão uma única vez quando expira. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status !== 401 || options.skipRetry === true || options.auth === false) {
    return parse<T>(response);
  }

  const renewed = await renewSession();
  if (!renewed) {
    clearSession();
    return parse<T>(response);
  }
  return parse<T>(await send(path, options, true));
}

async function send(path: string, options: RequestOptions, retry = false): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.auth !== false) {
    const token = accessToken();
    if (token !== null) {
      headers['authorization'] = `Bearer ${token}`;
    }
  }

  return fetch(`${apiBase()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    ...(retry ? { cache: 'no-store' as const } : {}),
  });
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = (text === '' ? {} : JSON.parse(text)) as T | ErrorEnvelope;
  if (!response.ok) {
    const envelope = payload as ErrorEnvelope;
    if (envelope.error !== undefined) {
      throw new ApiError(response.status, envelope);
    }
    throw new ApiError(response.status, {
      error: { code: 'internal_error', message: 'Erro inesperado.', requestId: '-' },
    });
  }
  return payload as T;
}

/** URL completa de um caminho da API (usado pelos testes). */
export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, accessToken, apiRequest, apiUrl, clearSession, storeTokens } from '../src/api/client.js';

/**
 * Cliente HTTP da web.
 *
 * O token vive no `sessionStorage` (nunca no `localStorage`) e a renovação é
 * *single-flight*: dois `401` em paralelo dão **um** pedido — o servidor
 * trataria a repetição como reutilização e mataria a família.
 */

/** Armazenamento de sessão mínimo para os testes (sem jsdom). */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  /** Número de entradas — o que o cliente tem de verificar ao escrever. */
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('credenciais da sessão', () => {
  it('guarda e lê o par de tokens', () => {
    storeTokens('acesso', 'renovacao');
    expect(accessToken()).toBe('acesso');
    clearSession();
    expect(accessToken()).toBeNull();
  });

  it('o token de renovação nunca é escrito no localStorage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    storeTokens('acesso', 'renovacao');
    expect(globalThis.localStorage.length).toBe(0);
  });
});

describe('pedidos', () => {
  it('um erro do contrato vem como ApiError com o código', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 'not_found', message: 'Recurso não encontrado.', requestId: 'r-1' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(apiRequest('/api/v1/library')).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
  });

  it('uma resposta sem envelope conhecido dá erro interno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"outro":true}', { status: 500 })));
    await expect(apiRequest('/api/v1/library')).rejects.toBeInstanceOf(ApiError);
  });

  it('um 401 renova a sessão uma única vez e repete o pedido', async () => {
    storeTokens('expirado', 'renovacao');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tokens: { accessToken: 'novo', refreshToken: 'renovacao-nova' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<{ items: unknown[] }>('/api/v1/library');
    expect(result.items).toEqual([]);
    expect(accessToken()).toBe('novo');
    // Três pedidos: o original (401), a renovação e a repetição.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a rota de renovação nunca é repetida', async () => {
    storeTokens('expirado', 'renovacao');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"tokens":{}}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // `skipRetry`: um pedido que não repete depois de renovar — repetir a
    // rota de renovação seria exactamente o que o servidor trata como
    // reutilização do token.
    await expect(apiRequest('/api/v1/auth/refresh', { skipRetry: true, auth: false })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('o caminho da API é relativo (o proxy e o esquema interno resolvem)', () => {
    expect(apiUrl('/api/v1/me')).toBe('/api/v1/me');
  });
});
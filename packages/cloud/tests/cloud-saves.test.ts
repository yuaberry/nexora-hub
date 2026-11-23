import { describe, expect, it } from 'vitest';
import {
  deleteSave,
  downloadSave,
  entriesFromList,
  listSaves,
  uploadSave,
  type SaveFetch,
  type SaveResponse,
} from '../src/cloud-saves.js';

/**
 * Cliente dos saves na nuvem — com rede falsa.
 *
 * O fetch é injectável: os testes fixam as respostas (o formato real da API)
 * e travam as quatro operações — enviar, listar, descarregar e apagar — mais
 * a tradução da listagem. Uma resposta que não tem a forma esperada devolve
 * lista vazia: quem chama mostra o erro, não um save inventado.
 */

/** Resposta de listagem no formato real da API. */
const LIST_PAYLOAD = {
  items: [
    { id: 'abc', gameKey: '/games/x', label: 'antes do boss', checksum: 'sum1', sizeBytes: 1024, revision: 2, createdAt: '2026-11-22T10:00:00.000Z' },
    { id: 'def', gameKey: '/games/y', label: 'auto', checksum: 'sum2', sizeBytes: 512, revision: 1, createdAt: '2026-11-22T09:00:00.000Z' },
  ],
};

/** Fetch que devolve sempre a mesma resposta. */
function fetchReturning(response: SaveResponse): SaveFetch {
  return async () => response;
}

/** Resposta JSON. */
function jsonResponse(status: number, payload: unknown): SaveResponse {
  return {
    status,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => payload,
  };
}

/** Resposta de bytes com cabeçalhos. */
function bytesResponse(status: number, bytes: Uint8Array, headers: Record<string, string>): SaveResponse {
  return {
    status,
    headers: { get: (name) => headers[name] ?? null },
    arrayBuffer: async () => new Uint8Array(bytes).slice().buffer as ArrayBuffer,
    json: async () => ({}),
  };
}

describe('entriesFromList', () => {
  it('traduz os itens da listagem', () => {
    const entries = entriesFromList(LIST_PAYLOAD);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.revision).toBe(2);
    expect(entries[0]?.label).toBe('antes do boss');
  });

  it('respostas sem itens devolvem lista vazia', () => {
    expect(entriesFromList({})).toEqual([]);
    expect(entriesFromList(null)).toEqual([]);
    expect(entriesFromList({ items: [{ semId: true }] })).toEqual([]);
  });
});

describe('uploadSave', () => {
  it('envia com os cabeçalhos do contrato', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    const fetch: SaveFetch = async (url, init) => {
      seenUrl = url;
      seenHeaders = (init.headers ?? {}) as Record<string, string>;
      return jsonResponse(201, { save: { id: 'novo', gameKey: '/games/x', label: 'x', checksum: 's', sizeBytes: 10, revision: 3, createdAt: '2026-11-22T12:00:00.000Z' } });
    };
    const result = await uploadSave('http://127.0.0.1:3100', 'token', { gameKey: '/games/x', label: 'x', checksum: 's', revision: 3, bytes: new Uint8Array([1, 2]) }, fetch);
    expect(result.ok).toBe(true);
    expect(seenUrl).toBe('http://127.0.0.1:3100/api/v1/saves');
    expect(seenHeaders['x-game-key']).toBe('/games/x');
    expect(seenHeaders['x-save-checksum']).toBe('s');
    expect(seenHeaders['x-save-revision']).toBe('3');
    expect(seenHeaders['authorization']).toBe('Bearer token');
    if (result.ok) {
      expect(result.value.revision).toBe(3);
    }
  });

  it('uma recusa da API devolve o estado (não inventa save)', async () => {
    const result = await uploadSave('http://x', 'token', { gameKey: '/games/x', label: 'x', checksum: 's', revision: 1, bytes: new Uint8Array([1]) }, fetchReturning(jsonResponse(401, {})));
    expect(result).toEqual({ ok: false, status: 401 });
  });
});

describe('listSaves', () => {
  it('pede a lista com o filtro do jogo', async () => {
    let seenUrl = '';
    const fetch: SaveFetch = async (url) => {
      seenUrl = url;
      return jsonResponse(200, LIST_PAYLOAD);
    };
    const result = await listSaves('http://x', 'token', '/games/x', fetch);
    expect(seenUrl).toBe('http://x/api/v1/saves?game=%2Fgames%2Fx');
    expect(result.ok && result.value).toHaveLength(2);
  });
});

describe('downloadSave', () => {
  it('devolve os bytes e os metadados dos cabeçalhos', async () => {
    const bytes = new Uint8Array([7, 7, 7]);
    const result = await downloadSave('http://x', 'token', 'abc', fetchReturning(bytesResponse(200, bytes, { 'x-save-revision': '4', 'x-save-checksum': 'sum9' })));
    if (!result.ok) {
      throw new Error('devia ter descarregado');
    }
    expect(Array.from(result.value.bytes)).toEqual([7, 7, 7]);
    expect(result.value.revision).toBe(4);
    expect(result.value.checksum).toBe('sum9');
  });

  it('um id que não existe devolve o estado', async () => {
    const result = await downloadSave('http://x', 'token', 'abc', fetchReturning(bytesResponse(404, new Uint8Array(), {})));
    expect(result).toEqual({ ok: false, status: 404 });
  });
});

describe('deleteSave', () => {
  it('apaga e devolve ok', async () => {
    const result = await deleteSave('http://x', 'token', 'abc', fetchReturning(jsonResponse(200, { ok: true })));
    expect(result).toEqual({ ok: true, value: true });
  });
});

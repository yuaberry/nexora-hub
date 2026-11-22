import { describe, expect, it, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheRemoteCover, coverCacheDir, type BytesFetch } from '../src/main/cover-cache.js';

/**
 * Cache das capas da loja — buscar, guardar e falhar com honestidade.
 *
 * O fetch é injectável: os testes fixam as respostas (imagem, conteúdo que
 * não é imagem, e falha de rede) e provam as três regras — uma imagem válida
 * fica no disco com a extensão certa, um conteúdo estranho não é guardado, e
 * uma falha devolve `null` em vez de um caminho inventado.
 */

/** Bytes de uma imagem JPEG mínima (assinatura `ÿØ`). */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Fetch que devolve sempre a mesma resposta. */
function fetchReturning(bytes: Uint8Array, contentType: string): BytesFetch {
  return async () => ({ bytes, contentType });
}

/** Fetch que falha (a loja inacessível). */
const failingFetch: BytesFetch = async () => null;

describe('cacheRemoteCover', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-covers-'));
  });

  it('guarda uma imagem JPEG e devolve o caminho', async () => {
    const path = await cacheRemoteCover('https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', dir, fetchReturning(JPEG_BYTES, 'image/jpeg'));
    expect(path).not.toBeNull();
    expect(existsSync(path ?? '')).toBe(true);
    expect(readFileSync(path ?? '').equals(Buffer.from(JPEG_BYTES))).toBe(true);
    expect(path?.endsWith('.jpg')).toBe(true);
  });

  it('o mesmo URL dá sempre o mesmo ficheiro', async () => {
    const url = 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg';
    const first = await cacheRemoteCover(url, dir, fetchReturning(JPEG_BYTES, 'image/jpeg'));
    const second = await cacheRemoteCover(url, dir, fetchReturning(JPEG_BYTES, 'image/jpeg'));
    expect(second).toBe(first);
  });

  it('um conteúdo que não é imagem não fica no disco', async () => {
    const path = await cacheRemoteCover('https://example.com/nao-imagem', dir, fetchReturning(new Uint8Array([1, 2, 3]), 'text/html'));
    expect(path).toBeNull();
    // A pasta pode ter sido criada, mas não contém ficheiros de capa.
    const files = existsSync(dir) ? require('node:fs').readdirSync(dir) : [];
    expect(files).toHaveLength(0);
  });

  it('uma falha de rede devolve null (quem chama fica com a URL)', async () => {
    expect(await cacheRemoteCover('https://example.com/imagem.jpg', dir, failingFetch)).toBeNull();
  });

  it('uma resposta vazia não é guardada', async () => {
    expect(await cacheRemoteCover('https://example.com/vazio.jpg', dir, fetchReturning(new Uint8Array(), 'image/png'))).toBeNull();
  });
});

describe('coverCacheDir', () => {
  it('fica ao lado da base de dados', () => {
    expect(coverCacheDir('/home/x/.config/nexora/nexora-hub.sqlite')).toBe('/home/x/.config/nexora/cover-cache');
  });
});
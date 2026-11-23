import { describe, expect, it, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hydrateCovers } from '../src/main/covers-hydrate.js';
import type { BytesFetch } from '../src/main/cover-cache.js';
import { LocalLibrary } from '../src/main/db.js';

/**
 * Hidratação das capas — a cápsula pública para todos, sem tocar no que é do
 * utilizador.
 *
 * O fetch é injectável: os testes fixam as respostas (imagem válida e falha)
 * e travam as quatro regras — uma entrada nova recebe a cápsula e guarda-a no
 * disco; uma capa **escolhida** nunca é substituída; uma entrada que já tem a
 * cápsula não é buscada de novo; e uma falha da loja devolve o relatório
 * honesto, sem capa inventada.
 */

/** Bytes de uma imagem JPEG mínima. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** Fetch que devolve sempre a mesma imagem. */
const fetchJpeg: BytesFetch = async () => ({ bytes: JPEG, contentType: 'image/jpeg' });

/** Fetch que falha sempre. */
const fetchFailing: BytesFetch = async () => null;

describe('hydrateCovers', () => {
  let library: LocalLibrary;
  let cacheDir: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-hydrate-'));
    library = new LocalLibrary(join(dir, 'nexora.sqlite'));
    cacheDir = join(dir, 'cover-cache');
  });

  it('guarda a cápsula pública e aponta a entrada para o disco', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: null,
      steamAppId: '367520',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    const report = await hydrateCovers(library, cacheDir, fetchJpeg);
    expect(report).toEqual({ updated: 1, failed: 0, skipped: 0 });

    const entry = library.byExternalKey('c:/games/x');
    // A capa passa a ser o ficheiro local — e não fica marcada como escolha.
    expect(entry?.cover).toContain('/cover-cache/');
    expect(entry?.coverChosen).toBe(false);
    // A imagem está realmente no disco.
    expect(existsSync(entry?.cover ?? '')).toBe(true);
  });

  it('uma capa escolhida pelo utilizador nunca é substituída', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: '/home/user/minha-capa.png',
      steamAppId: '367520',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    library.setCover(library.byExternalKey('c:/games/x')?.id ?? 0, '/home/user/minha-capa.png', true);

    const report = await hydrateCovers(library, cacheDir, fetchJpeg);
    expect(report).toEqual({ updated: 0, failed: 0, skipped: 1 });
    expect(library.byExternalKey('c:/games/x')?.cover).toBe('/home/user/minha-capa.png');
  });

  it('uma entrada que já tem a cápsula não é buscada outra vez', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: '/cache/library_600x900.jpg',
      steamAppId: '367520',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    const report = await hydrateCovers(library, cacheDir, fetchJpeg);
    expect(report).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it('uma entrada sem appid fica como está (não há cápsula pública)', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: null,
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    const report = await hydrateCovers(library, cacheDir, fetchJpeg);
    expect(report).toEqual({ updated: 0, failed: 0, skipped: 1 });
  });

  it('uma falha da loja devolve o relatório honesto', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: null,
      steamAppId: '367520',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    const report = await hydrateCovers(library, cacheDir, fetchFailing);
    expect(report).toEqual({ updated: 0, failed: 1, skipped: 0 });
    expect(library.byExternalKey('c:/games/x')?.cover).toBeNull();
  });

  it('uma biblioteca sem appids não cria pasta de cache', async () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      cover: null,
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    await hydrateCovers(library, cacheDir, fetchJpeg);
    // Nada foi buscado: a pasta ou não existe, ou ficou vazia.
    if (existsSync(cacheDir)) {
      expect(readdirSync(cacheDir)).toHaveLength(0);
    }
  });
});
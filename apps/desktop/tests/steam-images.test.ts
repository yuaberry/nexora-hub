import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSteamImages, steamCoverAlternatives, steamCoverFor, steamImageDir } from '../src/main/steam-images.js';

/**
 * Imagens da Steam — a capa lida da pasta do utilizador.
 *
 * O que estes testes travam: a pasta do jogo é encontrada, as imagens são
 * lidas **recursivamente** (a Steam moderna guarda o herói em subpastas com
 * nomes de hash), o logo é escolhido como capa, e um jogo sem imagens não
 * devolve caminho inventado.
 */

/** Escreve uma imagem com um tamanho dado. */
function imagem(path: string, bytes: number): void {
  const full = path;
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, Buffer.alloc(bytes, 1));
}

describe('readSteamImages', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'nexora-imgs-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('encontra as imagens de um jogo, com o papel de cada uma', () => {
    imagem(join(home, 'appcache', 'librarycache', '367520', 'logo.png'), 84_000);
    imagem(join(home, 'appcache', 'librarycache', '367520', 'hash1', 'library_hero.jpg'), 300_000);
    const imagens = readSteamImages(home, '367520');
    expect(imagens).toHaveLength(2);
    expect(imagens.find((i) => i.path.endsWith('logo.png'))?.role).toBe('logo');
    expect(imagens.find((i) => i.path.endsWith('library_hero.jpg'))?.role).toBe('hero');
    expect(imagens.every((i) => i.bytes > 0)).toBe(true);
  });

  it('o logo é escolhido como capa', () => {
    imagem(join(home, 'appcache', 'librarycache', '570', 'logo.png'), 1_000);
    imagem(join(home, 'appcache', 'librarycache', '570', 'library_hero.jpg'), 300_000);
    const capa = steamCoverFor(home, '570');
    expect(capa?.endsWith('logo.png')).toBe(true);
  });

  it('as alternativas são o resto, pela ordem de preferência', () => {
    imagem(join(home, 'appcache', 'librarycache', '570', 'logo.png'), 1_000);
    imagem(join(home, 'appcache', 'librarycache', '570', 'hash2', 'library_capsule.jpg'), 200_000);
    const alternativas = steamCoverAlternatives(home, '570');
    expect(alternativas).toHaveLength(1);
    expect(alternativas[0]?.endsWith('library_capsule.jpg')).toBe(true);
  });

  it('um jogo sem imagens não devolve caminho inventado', () => {
    expect(steamCoverFor(home, '999999')).toBeNull();
    expect(steamCoverAlternatives(home, '999999')).toHaveLength(0);
    expect(readSteamImages(home, '999999')).toHaveLength(0);
  });

  it('a pasta do jogo é a que a Steam usa', () => {
    expect(steamImageDir('/home/u/.local/share/Steam', '570')).toBe(
      '/home/u/.local/share/Steam/appcache/librarycache/570',
    );
    // Uma barra final não estraga o caminho.
    expect(steamImageDir('/home/u/.local/share/Steam/', '570')).toBe(
      '/home/u/.local/share/Steam/appcache/librarycache/570',
    );
  });
});

/**
 * Imagens da Steam — a capa real, lida do disco do utilizador.
 *
 * A Steam guarda as imagens de cada jogo em
 * `appcache/librarycache/<appid>/`. O launcher lê essa pasta e escolhe a
 * capa pela ordem declarada no domínio — o **logo** primeiro, porque é arte
 * com fundo transparente e por isso desenha-se bem em qualquer tema.
 *
 * Nada é descarregado: a imagem já está no computador, e é por isso que a
 * biblioteca continua completa **offline** — que é o ponto.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { coverAlternatives, pickCover, steamImageRole, type SteamImage } from '@nexora/core';

/** Extensões que a Steam usa para as imagens. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const;

/** A pasta de imagens de um jogo dentro de uma instalação da Steam. */
export function steamImageDir(libraryPath: string, appId: string): string {
  return join(libraryPath.replace(/[/\\]+$/, ''), 'appcache', 'librarycache', appId);
}

/**
 * As imagens que a Steam guardou para um jogo.
 *
 * A pasta é percorrida **recursivamente** porque a Steam moderna guarda o
 * herói e a cápsula em subpastas com nomes de hash. Um ficheiro ilegível é
 * ignorado — a varredura não falha por uma imagem que mudou de nome.
 */
export function readSteamImages(libraryPath: string, appId: string): readonly SteamImage[] {
  const dir = steamImageDir(libraryPath, appId);
  const images: SteamImage[] = [];

  const walk = (current: string, depth: number): void => {
    if (depth > 3) {
      return;
    }
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const lower = entry.name.toLowerCase();
        if (!IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
          continue;
        }
        images.push({
          path: full,
          role: steamImageRole(entry.name),
          bytes: statSync(full).size,
        });
      } catch {
        // ficheiro que desapareceu a meio da leitura: ignorado
      }
    }
  };

  walk(dir, 0);
  return images;
}

/** A capa escolhida para um jogo (`null` quando a Steam não guardou imagens). */
export function steamCoverFor(libraryPath: string, appId: string): string | null {
  return pickCover(readSteamImages(libraryPath, appId))?.path ?? null;
}

/** As alternativas para a personalização (tudo menos a escolhida). */
export function steamCoverAlternatives(libraryPath: string, appId: string): readonly string[] {
  const images = readSteamImages(libraryPath, appId);
  const chosen = pickCover(images);
  return coverAlternatives(images, chosen).map((image) => image.path);
}



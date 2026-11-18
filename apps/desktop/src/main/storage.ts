/**
 * Uso de disco do launcher.
 *
 * Duas medidas reais: o espaço do volume (`statfs`) e o tamanho das pastas de
 * jogo da biblioteca (contagem de bytes com limite declarado — uma pasta
 * corrompida com links recursivos não pode pendurar o launcher).
 */

import { lstatSync, readdirSync, statfsSync, type Dirent } from 'node:fs';

/** Limite de ficheiros por pasta (declarado, não descoberto ao falhar). */
export const MAX_FILES_PER_FOLDER = 50_000;

/** Limite de profundidade de pastas. */
export const MAX_DEPTH = 6;

/** Tamanho de um directório em bytes (limitado). */
export function directorySize(root: string, maxFiles = MAX_FILES_PER_FOLDER, maxDepth = MAX_DEPTH): number {
  let total = 0;
  let visited = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || visited >= maxFiles) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= maxFiles) {
        return;
      }
      const full = `${dir}/${entry.name}`;
      try {
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        const stats = lstatSync(full);
        if (stats.isFile()) {
          total += stats.size;
          visited += 1;
        }
      } catch {
        // Ficheiro ilegível não interrompe a contagem — o valor é uma
        // estimativa declarada, não um inventário forense.
      }
    }
  };

  walk(root, 0);
  return total;
}

/** Espaço do volume onde está um caminho. */
export function volumeSpace(path: string): { totalBytes: number; freeBytes: number } {
  try {
    const stats = statfsSync(path);
    return {
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
      freeBytes: Number(stats.bavail) * Number(stats.bsize),
    };
  } catch {
    return { totalBytes: 0, freeBytes: 0 };
  }
}
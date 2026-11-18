/**
 * Espaço do volume onde um caminho vive.
 *
 * Reexporta a medição do `node:fs` (`statfsSync`) num só sítio: o motor de
 * downloads pede espaço **antes** de começar, para não descobrir no fim de
 * 40 GB que o disco estava cheio.
 */

import { statfsSync } from 'node:fs';

/** Espaço do volume de um caminho. */
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
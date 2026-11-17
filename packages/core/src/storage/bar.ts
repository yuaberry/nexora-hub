/**
 * Barra de armazenamento do disco.
 *
 * Três segmentos e uma regra: o utilizador tem de perceber, num relance,
 * quanto do disco é dos jogos, quanto é do resto do sistema e quanto ainda
 * está livre. Os tons são **do tema** (azul/cinza/amarelo) — nenhuma cor é
 * escolhida aqui, apenas o papel de cada segmento.
 *
 * A barra nunca mente: quando os jogos e o resto do sistema excedem a
 * capacidade, o excesso é reportado em vez de silenciosamente aparado.
 */

/** Tom (papel de cor) de um segmento. */
export type StorageSegmentTone = 'accent' | 'neutral' | 'warning';

export interface StorageBarSegment {
  /** Bytes do segmento. */
  readonly bytes: number;
  /** Proporção do total, em [0; 1]. */
  readonly ratio: number;
  /** Papel de cor no tema. */
  readonly tone: StorageSegmentTone;
  /** Chave de tradução do rótulo (`storage.<chave>`). */
  readonly labelKey: 'games' | 'other' | 'free';
}

export interface StorageBarResult {
  readonly segments: readonly StorageBarSegment[];
  /** Bytes atribuídos aos jogos. */
  readonly usedBytes: number;
  /** Bytes atribuídos a outro conteúdo do disco. */
  readonly otherBytes: number;
  /** Bytes livres (nunca negativo). */
  readonly freeBytes: number;
  /** `true` quando `used + other` excede a capacidade declarada. */
  readonly overCapacity: boolean;
}

/** Valida um tamanho em bytes (número finito e não negativo). */
function sanitizeBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/** Proporção segura: denominador zero ou negativo devolve 0. */
function ratioOf(bytes: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, bytes / total));
}

/**
 * Calcula os segmentos da barra de armazenamento.
 *
 * `total <= 0` significa "capacidade desconhecida": a barra fica vazia e o
 * excesso é declarado em vez de adivinhado.
 */
export function storageBar(used: number, other: number, total: number): StorageBarResult {
  const safeTotal = sanitizeBytes(total);
  const safeUsed = sanitizeBytes(used);
  const safeOther = sanitizeBytes(other);

  const usedBytes = Math.min(safeUsed, safeTotal);
  const otherBytes = Math.min(safeOther, Math.max(0, safeTotal - usedBytes));
  const freeBytes = Math.max(0, safeTotal - usedBytes - otherBytes);
  const overCapacity = safeUsed + safeOther > safeTotal;

  return {
    segments: [
      { bytes: usedBytes, ratio: ratioOf(usedBytes, safeTotal), tone: 'accent', labelKey: 'games' },
      { bytes: otherBytes, ratio: ratioOf(otherBytes, safeTotal), tone: 'neutral', labelKey: 'other' },
      { bytes: freeBytes, ratio: ratioOf(freeBytes, safeTotal), tone: 'warning', labelKey: 'free' },
    ],
    usedBytes,
    otherBytes,
    freeBytes,
    overCapacity,
  };
}
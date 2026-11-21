/**
 * Relatório da limpeza — funções puras sobre o que foi encontrado.
 *
 * O utilizador quer saber três coisas: quanto espaço, em quantos ficheiros,
 * e o que **não** foi limpo (com o motivo). Nada de percentagem inventada:
 * os números são a soma do que a varredura mediu.
 */

/** Um ficheiro encontrado por um alvo. */
export interface Finding {
  /** Identificador do alvo que o encontrou. */
  readonly targetId: string;
  /** Caminho absoluto do ficheiro. */
  readonly path: string;
  /** Tamanho em bytes. */
  readonly bytes: number;
}

/** Um ficheiro que não pôde ser limpo. */
export interface CleanFailure {
  readonly path: string;
  /** Motivo da falha (em texto, do manifesto da execução). */
  readonly reason: string;
}

/** O que uma execução da limpeza apurou. */
export interface CleanRunReport {
  /** Bytes que a execução libertou. */
  readonly freedBytes: number;
  /** Ficheiros apagados. */
  readonly removed: readonly string[];
  /** Ficheiros que ficaram, com o motivo. */
  readonly failures: readonly CleanFailure[];
}

/** O resumo de uma varredura (antes de limpar). */
export interface ScanSummary {
  /** Bytes encontrados, somados. */
  readonly totalBytes: number;
  /** Número de ficheiros encontrados. */
  readonly fileCount: number;
  /** Soma por alvo, para a interface mostrar de onde vem o espaço. */
  readonly byTarget: ReadonlyMap<string, number>;
}

/** Resume uma varredura. */
export function summarizeScan(findings: readonly Finding[]): ScanSummary {
  const byTarget = new Map<string, number>();
  let totalBytes = 0;
  for (const finding of findings) {
    totalBytes += finding.bytes;
    byTarget.set(finding.targetId, (byTarget.get(finding.targetId) ?? 0) + finding.bytes);
  }
  return { totalBytes, fileCount: findings.length, byTarget };
}

/** Resume uma execução da limpeza. */
export function summarizeRun(
  removed: readonly Finding[],
  failures: readonly CleanFailure[],
): CleanRunReport {
  return {
    freedBytes: removed.reduce((total, finding) => total + finding.bytes, 0),
    removed: removed.map((finding) => finding.path),
    failures,
  };
}

/** `true` quando uma varredura não encontrou nada. */
export function scanIsEmpty(summary: ScanSummary): boolean {
  return summary.fileCount === 0;
}

/**
 * Espaço libertado em megabytes, com uma casa decimal.
 *
 * `Math.round` no final, para que 1 048 576 bytes dêem exactamente 1 — e
 * para que a interface nunca mostre 0,9 MB quando o disco viu 1.
 */
export function toMegabytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
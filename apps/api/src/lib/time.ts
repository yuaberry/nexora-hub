/**
 * Utilitários de tempo.
 *
 * A duração jogada é contada em **segundos inteiros**: o valor fraccionário
 * existe até ao fecho da sessão, e o arredondamento acontece num único ponto
 * — assim a duração registada e o tempo mostrado nunca discordam.
 */

/** Segundos inteiros entre dois instantes (nunca negativo). */
export function secondsBetween(from: Date, to: Date): number {
  const seconds = Math.round((to.getTime() - from.getTime()) / 1000);
  return Math.max(0, seconds);
}

/** Duração em segundos já arredondada, limitada por um tecto quando existe. */
export function boundedSeconds(from: Date, to: Date, maxSeconds?: number | null): number {
  const seconds = secondsBetween(from, to);
  if (maxSeconds === undefined || maxSeconds === null) {
    return seconds;
  }
  return Math.min(seconds, Math.max(0, Math.floor(maxSeconds)));
}
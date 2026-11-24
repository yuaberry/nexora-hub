/**
 * Relógio de sessão — o tempo em formato demostrador.
 *
 * Um widget que flutua sobre o jogo precisa de um relógio legível a dez
 * passos: horas só quando existem, minutos e segundos sempre com dois
 * dígitos. A função é pura — o mesmo formato no launcher, no overlay e no
 * widget.
 */

/**
 * Os segundos em `H:MM:SS` (ou `M:SS` com menos de uma hora).
 *
 * Segundos negativos não existem: o máximo com zero é o início da sessão.
 */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number): string => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
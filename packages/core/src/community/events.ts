/**
 * Eventos — encontros marcados, com regras puras.
 *
 * Um evento tem dono, hora de início e lotação. As regras que governam a
 * participação vivem aqui, testadas sem rede nem base de dados:
 *
 * - entram os que têm lugar — a lotação é **aplicada**, não é texto;
 * - um evento que já começou não aceita entradas (entrou, jogou);
 * - sair liberta o lugar — a desistência devolve a vaga a quem vem a seguir;
 * - cancelar é do **dono** do evento (e cancelar fecha as portas: já não
 *   entram nem saem, porque já não há nada a que juntar-se).
 */

/** A maior lotação de um evento. */
export const MAX_EVENT_CAPACITY = 100;

/** Os estados de participação. */
export type EventAttendance = 'going' | 'interested' | 'maybe';

/** Um evento. */
export interface CommunityEvent {
  readonly id: string;
  /** O clã que organiza (`null` para um evento da comunidade inteira). */
  readonly clanId: string | null;
  readonly title: string;
  readonly description: string;
  /** ISO-8601 UTC do início. */
  readonly startsAt: string;
  readonly capacity: number;
  readonly hostId: string;
  /** Quantos confirmados (`going`) já estão. */
  readonly goingCount: number;
  /** Cancelado pelo dono: as portas fecham. */
  readonly cancelled: boolean;
  readonly createdAt: string;
}

/**
 * Quem pode entrar.
 *
 * Um evento cancelado ou já começado não aceita entradas — e um evento cheio
 * também não (a lotação conta só os confirmados: quem está "interessado"
 * ocupa lugar de coração, não de cadeira).
 */
export function canJoin(event: CommunityEvent, now: string): boolean {
  if (event.cancelled || event.startsAt <= now) {
    return false;
  }
  return event.goingCount < event.capacity;
}

/** Quem pode cancelar o evento: só quem o criou. */
export function canCancel(event: CommunityEvent, userId: string): boolean {
  return event.hostId === userId && !event.cancelled;
}

/** O evento já começou? (comparação declarada, sem relógio escondido). */
export function hasStarted(event: CommunityEvent, now: string): boolean {
  return event.startsAt <= now;
}

/** A lotação é válida? (declarada e aplicada nas rotas). */
export function isCapacityValid(capacity: number): boolean {
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= MAX_EVENT_CAPACITY;
}
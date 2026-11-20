/**
 * Timeline gamer — o feed de actividade.
 *
 * A timeline é uma lista de **eventos** ordenada pelo mais recente. Cada
 * evento tem um tipo declarado e um timestamp — nada é inventado, e um
 * evento sem jogo (uma review nova, por exemplo) não finge ter um.
 */

/** Tipos de evento da timeline. */
export const TIMELINE_EVENT_TYPES = [
  'session-ended',
  'comment-created',
  'review-created',
  'wishlist-added',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/** Um evento da timeline. */
export interface TimelineEvent {
  readonly id: string;
  readonly type: TimelineEventType;
  /** ISO-8601 UTC do evento. */
  readonly at: string;
  /** Jogo relacionado, quando há. */
  readonly gameId: string | null;
  /** Resumo de uma linha (para a interface). */
  readonly summary: string;
}

/**
 * Ordena eventos do mais recente para o mais antigo.
 *
 * Empates são desfeitos pelo id — a ordem é estável, e a interface não muda
 * entre renderizações por causa de um empate.
 */
export function sortTimeline(events: readonly TimelineEvent[]): readonly TimelineEvent[] {
  return [...events].sort((left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id));
}

/** Limita a timeline aos N eventos mais recentes. */
export function limitTimeline(
  events: readonly TimelineEvent[],
  limit: number,
): readonly TimelineEvent[] {
  return sortTimeline(events).slice(0, limit);
}

/** Chave de tradução de um tipo de evento (`timeline.<tipo>`). */
export function timelineLabelKey(type: TimelineEventType): string {
  return `timeline.${type}`;
}
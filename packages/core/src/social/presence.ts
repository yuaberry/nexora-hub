/**
 * Presença — heartbeat com validade (TTL).
 *
 * "Online" não é um interruptor: é um **coração que bate**. Um utilizador
 * está online se o último heartbeat foi há menos tempo que a validade
 * (`PRESENCE_TTL_SECONDS`); passado esse tempo, aparece como offline —
 * mesmo que o processo tenha morrido sem avisar. Nada de estado zumbi a
 * mostrar "a jogar" quem fechou o launcher há uma hora.
 */

/** Validade de um heartbeat, em segundos. */
export const PRESENCE_TTL_SECONDS = 45;

/** Estado de presença de um utilizador. */
export type PresenceStatus = 'online' | 'offline';

/** O que um heartbeat pode dizer sobre o que a pessoa está a fazer. */
export interface PresenceActivity {
  /** Jogo em curso (o id do jogo), ou `null` quando não está a jogar. */
  readonly gameId: string | null;
}

/** Um registo de presença. */
export interface PresenceRecord {
  readonly userId: string;
  readonly status: PresenceStatus;
  readonly gameId: string | null;
  /** ISO-8601 UTC do último heartbeat. */
  readonly at: string;
  /** ISO-8601 UTC em que o registo deixa de valer. */
  readonly expiresAt: string;
}

/** O estado que as transições manipulam (um registo por utilizador). */
export type PresenceState = readonly PresenceRecord[];

/** Soma segundos a uma data ISO-8601. */
export function addSeconds(iso: string, seconds: number): string {
  const date = new Date(iso);
  date.setUTCSeconds(date.getUTCSeconds() + seconds);
  return date.toISOString();
}

/**
 * Aplica um heartbeat ao estado.
 *
 * Substitui o registo do utilizador (um coração só bate uma vez por
 * utilizador) e devolve a lista — o estado é dado, nunca mutado.
 */
export function applyHeartbeat(
  state: PresenceState,
  input: { userId: string; now: string; activity?: PresenceActivity },
): PresenceState {
  const record: PresenceRecord = {
    userId: input.userId,
    status: 'online',
    gameId: input.activity?.gameId ?? null,
    at: input.now,
    expiresAt: addSeconds(input.now, PRESENCE_TTL_SECONDS),
  };
  return [...state.filter((entry) => entry.userId !== input.userId), record];
}

/**
 * Estado efectivo de um registo num instante.
 *
 * Um registo expirado é **offline**, com o jogo esquecido: a validade é o
 * que separa "está a jogar" de "esteve a jogar".
 */
export function presenceStatus(record: PresenceRecord, now: string): PresenceStatus {
  return new Date(record.expiresAt).getTime() >= new Date(now).getTime() ? 'online' : 'offline';
}

/** Jogo em curso de um registo (`null` quando não está a jogar). */
export function presenceGameId(record: PresenceRecord, now: string): string | null {
  return presenceStatus(record, now) === 'online' ? record.gameId : null;
}

/**
 * Presença visível de um conjunto de amigos.
 *
 * Só os amigos aparecem — a presença de um desconhecido não é mostrada, e
 * quem não é amigo não existe na resposta. A própria pessoa está fora da
 * lista (a presença dos outros, não a minha).
 */
export function visiblePresence(
  state: PresenceState,
  options: { friendIds: readonly string[]; now: string; excludeUserId?: string },
): readonly PresenceRecord[] {
  const friends = new Set(options.friendIds);
  return state
    .filter((record) => friends.has(record.userId) && record.userId !== options.excludeUserId)
    .map((record) => ({
      ...record,
      status: presenceStatus(record, options.now),
      gameId: presenceGameId(record, options.now),
    }))
    .filter((record) => record.status === 'online')
    .sort((left, right) => right.at.localeCompare(left.at));
}

/**
 * Limpa os registos expirados (chamado a escrever, para a lista não crescer
 * sem limite). Um estado sem expirados é devolvido como está.
 */
export function pruneExpired(state: PresenceState, now: string): PresenceState {
  const reference = new Date(now).getTime();
  const kept = state.filter((record) => new Date(record.expiresAt).getTime() >= reference);
  return kept.length === state.length ? state : kept;
}
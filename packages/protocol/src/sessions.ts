/**
 * Contrato de sessões de jogo — o tempo jogado.
 *
 * Uma sessão nasce quando o utilizador carrega em **Jogar** e termina quando
 * o jogo sai (ou quando o utilizador a fecha). O código de saída de um
 * *crash* fica registado: um jogo que fechou sozinho é informação, não um
 * encerramento normal, e a interface mostra-o.
 */

/** Estado de uma sessão de jogo. */
export type GameSessionState = 'running' | 'ended';

/** Uma sessão de jogo (visão HTTP). */
export interface GameSession {
  readonly id: string;
  readonly gameId: string;
  readonly state: GameSessionState;
  /** ISO-8601 UTC do início. */
  readonly startedAt: string;
  /** ISO-8601 UTC do fim (`null` enquanto corre). */
  readonly endedAt: string | null;
  /** Duração em segundos (arredondada para minutos na persistência). */
  readonly durationSeconds: number;
  /** Código de saída do processo (`null` enquanto corre). */
  readonly exitCode: number | null;
  /** `true` quando o código de saída indica um *crash* (não-zero). */
  readonly crashed: boolean;
}

/** POST `/sessions` — corpo aceite. */
export interface SessionStartRequest {
  readonly gameId: string;
}

/** POST `/sessions/:id/end` — corpo aceite (tudo opcional). */
export interface SessionEndRequest {
  /** Código de saída do processo. */
  readonly exitCode?: number;
}

/** Resposta de `POST /sessions/:id/end`. */
export interface SessionEndResponse {
  readonly session: GameSession;
  /** ISO-8601 UTC; `null` quando não há registo daquele jogo. */
  readonly lastPlayedAt: string | null;
}

export type SessionPage = import('./pagination.js').Page<GameSession>;
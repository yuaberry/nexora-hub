import type { UserRecord } from '../../repositories/types.js';

/**
 * Bloqueio da conta por tentativas de login falhadas.
 *
 * A política é deliberadamente simples e **declarada**: um número máximo de
 * tentativas e uma duração de bloqueio. O que a torna segura não são os
 * números — é o facto de a resposta **não revelar se a conta existe**.
 *
 * A contagem vive no repositório (incremento atómico). Aqui fica a política:
 * o que é bloqueio, até quando, e o que uma conta bloqueada faz.
 */

/** Número de tentativas falhadas que bloqueiam a conta. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Duração do bloqueio, em segundos (15 minutos). */
export const LOGIN_LOCK_SECONDS = 900;

/** Estado do bloqueio de uma conta. */
export interface LockoutState {
  locked: boolean;
  /** Segundos que faltam para a conta ser desbloqueada. */
  remainingSeconds: number;
}

/**
 * Estado do bloqueio a partir da conta e do momento actual.
 *
 * Um bloqueio **expirado** não bloqueia: a conta volta a estar disponível e a
 * contagem recomeça. Uma conta bloqueada **não estende** o próprio bloqueio —
 * um atacante não pode mantê-la bloqueada para sempre.
 */
export function lockoutState(user: UserRecord, now: Date): LockoutState {
  if (user.lockedUntil === null) {
    return { locked: false, remainingSeconds: 0 };
  }
  const remaining = user.lockedUntil.getTime() - now.getTime();
  if (remaining <= 0) {
    return { locked: false, remainingSeconds: 0 };
  }
  return { locked: true, remainingSeconds: Math.ceil(remaining / 1000) };
}

/** Instante até ao qual a conta fica bloqueada, contados a partir de `now`. */
export function lockDeadline(now: Date): Date {
  return new Date(now.getTime() + LOGIN_LOCK_SECONDS * 1000);
}
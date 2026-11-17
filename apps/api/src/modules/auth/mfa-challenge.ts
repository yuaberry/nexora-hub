import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Desafio de segundo factor.
 *
 * O login com MFA activo devolve um **desafio**, não tokens. O desafio é
 * assinado com uma chave **derivada** (`HMAC(AUTH_SECRET, "mfa-challenge:")`),
 * nunca com a chave dos tokens de acesso: com a mesma chave, o desafio
 * serviria de token de acesso e contornaria o segundo factor. Um desafio
 * usado como autorização tem de falhar — e há teste a provar isso.
 *
 * TTL: 5 minutos.
 */

/** Contexto do HMAC do desafio (separado do contexto dos tokens de acesso). */
const CHALLENGE_CONTEXT = 'mfa-challenge:';

/** Validade do desafio, em segundos. */
export const MFA_CHALLENGE_TTL_SECONDS = 300;

/** Desafio emitido (token opaco + validade). */
export interface MfaChallengeToken {
  /** Token opaco — o cliente devolve-o tal e qual em `/auth/mfa/verify`. */
  readonly token: string;
  /** Utilizador a quem o desafio pertence. */
  readonly userId: string;
  /** Instante de expiração. */
  readonly expiresAt: Date;
}

/** Emite um desafio para um utilizador. */
export function issueMfaChallenge(
  userId: string,
  secret: string,
  now: Date = new Date(),
): MfaChallengeToken {
  const challengeId = randomUUID();
  const expiresAtSeconds = Math.floor(now.getTime() / 1000) + MFA_CHALLENGE_TTL_SECONDS;
  const signature = signChallenge(challengeId, userId, expiresAtSeconds, secret);
  const token = [challengeId, userId, String(expiresAtSeconds), signature].join('.');
  return { token, userId, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/**
 * Verifica um desafio e devolve o utilizador.
 *
 * Devolve `undefined` quando o desafio está malformado, adulterado ou
 * expirado. A resposta da rota é **uniforme**: código errado, desafio
 * inválido e desafio expirado dão `401` com a mesma mensagem.
 *
 * Um token de acesso (JWT) apresentado como desafio é recusado: o formato não
 * bate, e a assinatura usa outro contexto de chave.
 */
export function verifyMfaChallenge(
  token: string,
  secret: string,
  now: Date = new Date(),
): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  const [challengeId, userId, expiresAtRaw, signature] = parts as [string, string, string, string];

  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !isUuid(userId)) {
    return undefined;
  }
  if (!/^\d+$/.test(expiresAtRaw)) {
    return undefined;
  }

  const expiresAtSeconds = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtSeconds)) {
    return undefined;
  }
  if (expiresAtSeconds <= Math.floor(now.getTime() / 1000)) {
    return undefined;
  }

  const expected = signChallenge(challengeId, userId, expiresAtSeconds, secret);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) {
    return undefined;
  }
  if (!timingSafeEqual(provided, expectedBuffer)) {
    return undefined;
  }
  return userId;
}

/** Assina o conteúdo do desafio (contexto próprio, separado dos tokens). */
function signChallenge(challengeId: string, userId: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${CHALLENGE_CONTEXT}${challengeId}.${userId}.${expiresAt}`)
    .digest('base64url');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
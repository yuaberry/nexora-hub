import type { AuthTokens, MfaEnrollment, PublicUser } from '@nexora/protocol';
import { errors } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-crypto.js';
import { verifyMfaChallenge } from './mfa-challenge.js';
import { generateTotpSecret, totpUri, verifyTotpCode } from './totp.js';
import { createRecoveryCodes, hashRecoveryCode } from './recovery-codes.js';
import { toPublicUser } from './public-user.js';

/**
 * Segundo factor (TOTP, RFC 6238).
 *
 * Um passo **entre a senha e a sessão**: com MFA activo, a senha não abre
 * sessão — devolve um desafio, e só a verificação do código emite tokens. O
 * segredo é cifrado em repouso (AES-256-GCM, chave derivada por HKDF, contexto
 * próprio) e os códigos de resgate são de uso único, guardados apenas por
 * hash.
 */

/** Emissor exibido no aplicador de autenticação. */
const MFA_ISSUER = 'NEXORA HUB';

/** Dependências do serviço. */
export interface MfaServiceDeps {
  readonly repositories: Repositories;
  readonly secret: string;
  readonly now?: () => Date;
  /** Abre uma sessão e emite tokens (ponte com o serviço de autenticação). */
  readonly openSession: (userId: string, userAgent: string | null) => Promise<AuthTokens>;
}

export function createMfaService(deps: MfaServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** Devolve o segredo em claro de um registo (ou `undefined` se corrompido). */
  async function plaintextSecret(userId: string): Promise<string | undefined> {
    const record = await deps.repositories.mfa.findSecret(userId);
    if (record === null) {
      return undefined;
    }
    return decryptSecret(record.secretCiphertext, deps.secret);
  }

  /**
   * Inicia o enrollment — devolve o segredo e a URI **uma única vez**.
   *
   * Um enrollment novo **não** desliga um MFA activo (`409`): isso
   * transformaria uma rota autenticada numa forma de desligar o segundo
   * factor.
   */
  async function startEnrollment(userId: string): Promise<MfaEnrollment> {
    const enabled = await deps.repositories.mfa.findEnabled(userId);
    if (enabled !== null) {
      throw errors.conflict('A verificação em duas etapas já está activa.');
    }

    const secret = generateTotpSecret();
    await deps.repositories.mfa.upsertPendingSecret(userId, encryptSecret(secret, deps.secret));
    await audit(deps.repositories.audit, {
      actorId: userId,
      action: 'auth.mfa_enroll',
      entity: 'user',
      entityId: userId,
    });

    const user = await deps.repositories.users.findById(userId);
    return {
      secret,
      uri: totpUri({ secret, account: user?.email ?? '', issuer: MFA_ISSUER }),
    };
  }

  /**
   * Confirma o enrollment com um código válido — e só então o activa.
   *
   * A confirmação **não** consome o passo TOTP: é a excepção deliberada que
   * permite ao utilizador entrar logo a seguir com o mesmo código. Aceitá-la
   * de novo devolveria códigos de resgate novos sem consumir o passo — e o
   * mesmo código valeria duas vezes.
   */
  async function confirmEnrollment(userId: string, code: string): Promise<readonly string[]> {
    const pending = await deps.repositories.mfa.findSecret(userId);
    if (pending === null) {
      throw errors.invalidRequest('Enrollment não iniciado.');
    }

    const secret = await plaintextSecret(userId);
    if (secret === undefined) {
      throw errors.internal('Segredo do segundo factor corrompido.');
    }

    const verification = verifyTotpCode(secret, code, now());
    if (!verification.valid) {
      throw errors.unauthenticated('Código inválido.');
    }

    await deps.repositories.mfa.confirmSecret(userId, now());
    const { shown, hashes } = createRecoveryCodes();
    await deps.repositories.mfa.replaceRecoveryCodes(userId, hashes);
    await audit(deps.repositories.audit, {
      actorId: userId,
      action: 'auth.mfa_confirm',
      entity: 'user',
      entityId: userId,
    });
    return shown;
  }

  /** Desactivar exige **prova**: um código válido. */
  async function disable(userId: string, code: string): Promise<void> {
    const enabled = await deps.repositories.mfa.findEnabled(userId);
    if (enabled === null) {
      throw errors.notFound('A verificação em duas etapas não está activa.');
    }

    const proven = await proveCode(userId, enabled.lastUsedStep, code);
    if (!proven) {
      throw errors.unauthenticated('Código inválido.');
    }

    await deps.repositories.mfa.disable(userId);
    await audit(deps.repositories.audit, {
      actorId: userId,
      action: 'auth.mfa_disable',
      entity: 'user',
      entityId: userId,
    });
  }

  /** Gerar códigos de resgate novos consome o passo (diferente da confirmação). */
  async function regenerateRecoveryCodes(userId: string, code: string): Promise<readonly string[]> {
    const enabled = await deps.repositories.mfa.findEnabled(userId);
    if (enabled === null) {
      throw errors.notFound('A verificação em duas etapas não está activa.');
    }

    const proven = await proveCode(userId, enabled.lastUsedStep, code);
    if (!proven) {
      throw errors.unauthenticated('Código inválido.');
    }

    const { shown, hashes } = createRecoveryCodes();
    await deps.repositories.mfa.replaceRecoveryCodes(userId, hashes);
    return shown;
  }

  /**
   * Prova um código: TOTP (consumindo o passo) ou código de resgate.
   *
   * O consumo do passo é atómico: dois pedidos paralelos com o mesmo código
   * disputam a mesma linha e só um ganha.
   */
  async function proveCode(userId: string, lastUsedStep: number | null, code: string): Promise<boolean> {
    const secret = await plaintextSecret(userId);
    if (secret === undefined) {
      return false;
    }

    const normalized = code.trim().toLowerCase();
    if (/^\d{6}$/.test(normalized)) {
      const verification = verifyTotpCode(secret, normalized, now());
      if (!verification.valid || verification.step === undefined) {
        return false;
      }
      if (verification.step <= (lastUsedStep ?? Number.MIN_SAFE_INTEGER)) {
        return false;
      }
      return deps.repositories.mfa.consumeStep(userId, verification.step);
    }

    return deps.repositories.mfa.consumeRecoveryCode(userId, hashRecoveryCode(normalized));
  }

  /**
   * Verifica o desafio + código e abre a sessão.
   *
   * Os erros são **uniformes**: código errado, desafio inválido e desafio
   * expirado devolvem `401` com a mesma mensagem.
   */
  async function verifyChallenge(
    challengeToken: string,
    code: string,
    userAgent: string | null = null,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const userId = verifyMfaChallenge(challengeToken, deps.secret, now());
    if (userId === undefined) {
      throw errors.unauthenticated('Código inválido ou desafio expirado.');
    }

    const enabled = await deps.repositories.mfa.findEnabled(userId);
    if (enabled === null) {
      throw errors.unauthenticated('Código inválido ou desafio expirado.');
    }

    const proven = await proveCode(userId, enabled.lastUsedStep, code);
    if (!proven) {
      throw errors.unauthenticated('Código inválido ou desafio expirado.');
    }

    const tokens = await deps.openSession(userId, userAgent);
    const user = await deps.repositories.users.findById(userId);
    if (user === null) {
      throw errors.unauthenticated();
    }
    return { user: toPublicUser(user, true), tokens };
  }

  return { startEnrollment, confirmEnrollment, disable, regenerateRecoveryCodes, verifyChallenge };
}

export type MfaService = ReturnType<typeof createMfaService>;
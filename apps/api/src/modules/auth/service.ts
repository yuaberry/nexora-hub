import type { AuthTokens, MfaChallenge, PublicUser } from '@nexora/protocol';
import { errors } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../../config/env.js';
import type { Repositories } from '../../repositories/types.js';
import { signToken } from '../../plugins/auth.js';
import { hashPassword, verifyPassword } from './password.js';
import { lockDeadline, lockoutState, MAX_LOGIN_ATTEMPTS } from './lockout.js';
import { deriveRefreshToken, verifyRefreshToken } from './refresh-token.js';
import { issueMfaChallenge } from './mfa-challenge.js';
import { toPublicUser } from './public-user.js';
import type { LoginRequestInput, RegisterRequestInput } from './schemas.js';

/**
 * Serviço de autenticação — as regras do jogo.
 *
 * A API depende dos **repositórios** (interfaces), nunca do driver: as mesmas
 * regras correm contra PostgreSQL e contra a memória. Aqui vivem o bloqueio,
 * a rotação do token de renovação e a ponte com o segundo factor.
 */

/** Dependências do serviço. */
export interface AuthServiceDeps {
  readonly repositories: Repositories;
  readonly secret: string;
  /** Relógio injectável (os testes controlam o tempo). */
  readonly now?: () => Date;
}

/** Resultado de um login: sessão aberta ou desafio de segundo factor. */
export type LoginResult =
  | { kind: 'authenticated'; user: PublicUser; tokens: AuthTokens }
  | { kind: 'mfa_required'; challenge: MfaChallenge; user: PublicUser };

export function createAuthService(deps: AuthServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** Emite o par de tokens para uma sessão de autenticação. */
  async function issueTokens(
    userId: string,
    email: string,
    role: 'user' | 'admin',
    sessionId: string,
  ): Promise<AuthTokens> {
    const accessToken = signToken({ sub: userId, email, role }, deps.secret, ACCESS_TOKEN_TTL_SECONDS, now());
    return {
      accessToken,
      refreshToken: deriveRefreshToken(sessionId, deps.secret),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async function register(input: RegisterRequestInput, requestId?: string) {
    const existing = await deps.repositories.users.findByEmail(input.email);
    if (existing !== null) {
      throw errors.conflict('Este e-mail já está registado.');
    }

    const record = await hashPassword(input.password);
    const user = await deps.repositories.users.create({
      email: input.email,
      displayName: input.displayName,
      passwordHash: record.hash,
      passwordSalt: record.salt,
    });

    await audit(deps.repositories.audit, {
      actorId: user.id,
      action: 'auth.register',
      entity: 'user',
      entityId: user.id,
      requestId,
    });

    const session = await deps.repositories.authSessions.create({
      userId: user.id,
      expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    const tokens = await issueTokens(user.id, user.email, user.role, session.id);
    return { user: toPublicUser(user, false), tokens };
  }

  /**
   * Login — nunca um oráculo sobre que e-mails existem.
   *
   * Com a senha errada a resposta é **sempre** a mesma (`401`), mesmo numa
   * conta bloqueada: a mensagem genérica não pode depender do estado da conta.
   * O `423 account_locked` só sai quando a senha está **certa** — quem
   * pergunta já provou quem é.
   */
  async function login(
    input: LoginRequestInput,
    context: { userAgent?: string | null; requestId?: string } = {},
  ): Promise<LoginResult> {
    const user = await deps.repositories.users.findByEmail(input.email);
    const passwordOk = await verifyPassword(input.password, {
      hash: user?.passwordHash ?? '00',
      salt: user?.passwordSalt ?? '00',
    });

    if (!passwordOk) {
      if (user !== null) {
        await deps.repositories.users.incrementFailedAttempts(user.id);
        const updated = await deps.repositories.users.findById(user.id);
        if (updated !== null && !lockoutState(updated, now()).locked && updated.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          await deps.repositories.users.lockUntil(user.id, lockDeadline(now()));
          await audit(deps.repositories.audit, {
            actorId: user.id,
            action: 'auth.login_locked',
            entity: 'user',
            entityId: user.id,
            requestId: context.requestId,
          });
        }
      }
      throw errors.unauthenticated('E-mail ou senha inválidos.');
    }

    // A senha bateu: sem conta correspondente, a resposta é a mesma — o
    // login não confirma que o e-mail existe.
    if (user === null) {
      throw errors.unauthenticated('E-mail ou senha inválidos.');
    }

    // A senha está certa. Um bloqueio activo impede a sessão — mas **não**
    // estende o bloqueio (um atacante não o pode manter para sempre).
    const state = lockoutState(user, now());
    if (state.locked) {
      throw Object.assign(errors.unauthenticated('Conta temporariamente bloqueada.'), {
        statusCode: 423,
        code: 'account_locked',
        details: { remainingSeconds: state.remainingSeconds },
      });
    }

    await deps.repositories.users.resetFailedAttempts(user.id);
    // A trilha mostra a etapa da senha: com MFA activo, uma senha correcta
    // não pode ser invisível no registo.
    await audit(deps.repositories.audit, {
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      requestId: context.requestId,
    });

    const mfa = await deps.repositories.mfa.findEnabled(user.id);
    if (mfa !== null) {
      const challenge = issueMfaChallenge(user.id, deps.secret, now());
      return {
        kind: 'mfa_required',
        challenge: { mfaRequired: true, challengeToken: challenge.token, expiresIn: 300 },
        user: toPublicUser(user, true),
      };
    }

    return { kind: 'authenticated', user: toPublicUser(user, false), tokens: await openSession(user.id) };
  }

  /** Devolve o utilizador público (com o estado do MFA resolvido). */
  async function publicUserOf(userId: string): Promise<PublicUser | null> {
    const user = await deps.repositories.users.findById(userId);
    if (user === null) {
      return null;
    }
    const mfa = await deps.repositories.mfa.findEnabled(userId);
    return toPublicUser(user, mfa !== null);
  }

  /** Abre uma sessão de autenticação e emite o par de tokens. */
  async function openSession(userId: string, userAgent: string | null = null) {
    const user = await deps.repositories.users.findById(userId);
    if (user === null) {
      throw errors.unauthenticated();
    }
    const session = await deps.repositories.authSessions.create({
      userId,
      expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      userAgent,
    });
    return issueTokens(user.id, user.email, user.role, session.id);
  }

  /**
   * Renovação do token — a rotação é a regra.
   *
   * Cada renovação troca o token de renovação por um novo. Fora da janela de
   * tolerância, um token já rodado que reaparece é **reutilização** — o sinal
   * clássico de roubo — e revoga a família inteira. Dentro da janela, o mesmo
   * sucessor é devolvido: uma corrida entre dois pedidos não pode matar a
   * sessão de um utilizador inocente.
   */
  async function refresh(refreshToken: string, requestId?: string) {
    const sessionId = verifyRefreshToken(refreshToken, deps.secret);
    if (sessionId === undefined) {
      throw errors.unauthenticated();
    }
    const session = await deps.repositories.authSessions.findById(sessionId);
    if (session === null || session.expiresAt <= now()) {
      throw errors.unauthenticated();
    }

    const user = await deps.repositories.users.findById(session.userId);
    if (user === null) {
      throw errors.unauthenticated();
    }

    if (session.revokedAt !== null && session.revokeReason === 'rotated') {
      const successor = session.rotatedToId === null ? null : await deps.repositories.authSessions.findById(session.rotatedToId);
      const withinGrace =
        session.lastUsedAt !== null &&
        now().getTime() - session.lastUsedAt.getTime() <= REFRESH_REUSE_GRACE_SECONDS * 1000;

      if (withinGrace && successor !== null && successor.revokedAt === null && successor.expiresAt > now()) {
        const reused = await publicUserOf(user.id);
        return { user: reused ?? toPublicUser(user, false), tokens: await issueTokens(user.id, user.email, user.role, successor.id) };
      }

      await deps.repositories.authSessions.revokeFamily(session.familyId, 'reuse', now());
      await audit(deps.repositories.audit, {
        actorId: user.id,
        action: 'auth.refresh_reuse',
        entity: 'auth_session',
        entityId: session.id,
        requestId,
      });
      throw errors.unauthenticated();
    }

    if (session.revokedAt !== null) {
      throw errors.unauthenticated();
    }

    const successor = await deps.repositories.authSessions.create({
      userId: user.id,
      familyId: session.familyId,
      expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    const rotated = await deps.repositories.authSessions.markRotated(session.id, successor.id, now());
    if (!rotated) {
      // Alguém rodou primeiro: dois pedidos paralelos não criam dois
      // sucessores válidos para a mesma família.
      await deps.repositories.authSessions.revokeFamily(session.familyId, 'reuse', now());
      throw errors.unauthenticated();
    }

    // A rotação normal **não** é auditada (D22): só a reutilização e o logout
    // entram na trilha.
    return { user: toPublicUser(user, true), tokens: await issueTokens(user.id, user.email, user.role, successor.id) };
  }

  /**
   * Logout — idempotente e de família inteira.
   *
   * Qualquer token devolve `204`: nunca revela se o token existia.
   */
  async function logout(refreshToken: string, requestId?: string): Promise<void> {
    const sessionId = verifyRefreshToken(refreshToken, deps.secret);
    if (sessionId === undefined) {
      return;
    }
    const session = await deps.repositories.authSessions.findById(sessionId);
    if (session === null) {
      return;
    }
    await deps.repositories.authSessions.revokeFamily(session.familyId, 'logout', now());
    await audit(deps.repositories.audit, {
      actorId: session.userId,
      action: 'auth.logout',
      entity: 'auth_session',
      entityId: session.id,
      requestId,
    });
  }

  return { register, login, refresh, logout, openSession, issueTokens, now, secret: deps.secret, repositories: deps.repositories };
}

export type AuthService = ReturnType<typeof createAuthService>;
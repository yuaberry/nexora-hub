import type { GameProvider } from '@nexora/protocol';

/**
 * Tipos de domínio persistidos.
 *
 * Os nomes são os **mesmos** do Nexora Cloud e do contrato partilhado
 * (`@nexora/protocol`): não há dois nomes para o mesmo conceito.
 */

export type UserRole = 'user' | 'admin';

/** Motivo da revogação de uma sessão de autenticação. */
export type AuthSessionRevokeReason =
  /** O token foi rodado: substituído pelo sucessor. */
  | 'rotated'
  /** O utilizador terminou a sessão. */
  | 'logout'
  /** Reutilização detectada: a família foi revogada. */
  | 'reuse'
  /** O token expirou. */
  | 'expired';

/** Estado de uma sessão de jogo. */
export type GameSessionState = 'running' | 'ended';

export type { GameProvider };

/** Acções auditadas (as **escritas**; as leituras não — ver D22). */
export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_locked'
  | 'auth.logout'
  | 'auth.refresh_reuse'
  | 'auth.mfa_enroll'
  | 'auth.mfa_confirm'
  | 'auth.mfa_disable'
  | 'library.entry.create'
  | 'library.favorite.update'
  | 'library.collection.add'
  | 'library.entry.remove'
  | 'session.start'
  | 'session.end';
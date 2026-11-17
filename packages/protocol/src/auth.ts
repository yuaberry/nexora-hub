/**
 * Contrato de autenticação da conta NEXORA.
 *
 * Espelha o Nexora Cloud: dois tokens, duas vidas. O token de acesso (JWT,
 * 1 h) identifica o pedido; o token de renovação (opaco, `id.hmac`) roda a
 * cada renovação e a sua família morre se for reutilizado. Nenhum dos dois é
 * guardado em disco pelo cliente — o token vive no `sessionStorage` da
 * sessão, no desktop e no browser.
 */

export type UserRole = 'user' | 'admin';

/** Utilizador visível publicamente (nunca a linha da base de dados). */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly planId: string;
  /** `true` quando o segundo factor está activo. */
  readonly mfaEnabled: boolean;
  /** ISO-8601 UTC. */
  readonly createdAt: string;
}

export interface AuthTokens {
  /** JWT de acesso (TTL curto, 1 h). */
  readonly accessToken: string;
  /** Token de renovação opaco (`id.hmac`), rotativo. */
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  /** Validade do token de acesso, em segundos. */
  readonly expiresIn: number;
}

/**
 * Desafio de segundo factor.
 *
 * O login com MFA activo **não** devolve tokens: devolve um desafio, que só
 * a rota `/auth/mfa/verify` converte em sessão. O desafio é assinado com uma
 * chave derivada — nunca com a chave dos tokens de acesso.
 */
export interface MfaChallenge {
  readonly mfaRequired: true;
  readonly challengeId: string;
  /** Validade do desafio, em segundos (5 min). */
  readonly expiresIn: number;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface MfaVerifyRequest {
  readonly challengeId: string;
  /** Código TOTP de 6 dígitos ou código de resgate. */
  readonly code: string;
}

export interface MfaEnrollment {
  /** Segredo base32 (mostrado uma única vez). */
  readonly secret: string;
  /** URI `otpauth://` para o aplicador de autenticação. */
  readonly uri: string;
}

/** Resposta do login: tokens, desafio MFA, ou conta bloqueada. */
export type LoginResponse =
  | ({ readonly kind: 'authenticated' } & AuthTokens)
  | ({ readonly kind: 'mfa_required' } & MfaChallenge);
/**
 * Tipos do grupo familiar.
 *
 * O domínio não conhece a base de dados: manipula um **estado** explícito e
 * devolve um estado novo. É assim que as regras (limite de plano, papéis,
 * expiração de convites) são testadas sem infraestrutura — e é assim que a
 * API as aplica, contra o repositório que estiver em uso.
 */

/** Papel de um membro do grupo. */
export type FamilyRole = 'owner' | 'adult' | 'member';

/** Um membro do grupo. */
export interface FamilyMember {
  readonly userId: string;
  readonly role: FamilyRole;
  /** ISO-8601 UTC da entrada. */
  readonly joinedAt: string;
}

/** Estado de um convite. */
export type FamilyInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/** Um convite para entrar no grupo. */
export interface FamilyInvite {
  readonly id: string;
  /** Código apresentado por quem aceita. */
  readonly code: string;
  /** Email convidado (a pessoa pode ainda não ter conta). */
  readonly email: string;
  /** Quem convidou. */
  readonly invitedBy: string;
  readonly status: FamilyInviteStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** ISO-8601 UTC da resposta (aceite/recusa), ou `null`. */
  readonly respondedAt: string | null;
}

/** O estado que as transições puras manipulam. */
export interface FamilyState {
  /** `null` enquanto a pessoa não tem grupo. */
  readonly groupId: string | null;
  readonly name: string | null;
  /** Dono do grupo (único que pode dissolvê-lo). */
  readonly ownerId: string | null;
  readonly members: readonly FamilyMember[];
  readonly invites: readonly FamilyInvite[];
}

/** Estado inicial: ninguém está num grupo. */
export const EMPTY_FAMILY: FamilyState = {
  groupId: null,
  name: null,
  ownerId: null,
  members: [],
  invites: [],
};

/** Motivos de recusa — todos em português, traduzidos pela rota. */
export type FamilyRefusal =
  | 'already-in-family'
  | 'not-in-family'
  | 'name-invalid'
  | 'not-allowed'
  | 'self-invite'
  | 'already-member'
  | 'invite-pending'
  | 'invite-not-found'
  | 'invite-expired'
  | 'limit-reached'
  | 'cannot-remove-owner'
  | 'not-member';

/**
 * Resultado de uma transição: estado novo, ou o motivo da recusa.
 *
 * A recusa pode trazer o estado novo quando a transição deixou uma marca
 * útil — um convite expirado passa a **expirado** mesmo não tendo entrado
 * ninguém, e a rota persiste essa marca.
 */
export type FamilyOutcome =
  | { readonly ok: true; readonly state: FamilyState }
  | { readonly ok: false; readonly reason: FamilyRefusal; readonly state?: FamilyState };

/** O dono pode convidar, remover e dissolver. */
export function canInvite(role: FamilyRole): boolean {
  return role === 'owner' || role === 'adult';
}

/** Só o dono remove outros membros (um membro remove-se a si mesmo = sair). */
export function canRemoveOthers(role: FamilyRole): boolean {
  return role === 'owner';
}

/** Papel de um membro (`'member'` quando não está no grupo). */
export function roleOf(state: FamilyState, userId: string): FamilyRole | null {
  return state.members.find((member) => member.userId === userId)?.role ?? null;
}

/** Nome válido: 2 a 40 caracteres depois de aparado. */
export function isValidFamilyName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 40;
}

/** Email válido: uma `@`, um ponto no domínio e sem espaços. */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string' || email.length > 254 || email.includes(' ')) {
    return false;
  }
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}
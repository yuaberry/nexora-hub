/**
 * Transições do grupo familiar — funções puras.
 *
 * Cada função recebe o estado e devolve um estado novo (ou o motivo da
 * recusa). Nada de relógio, nada de identificadores gerados aqui: o tempo e
 * os ids entram como argumentos, e por isso os testes são deterministas.
 *
 * Regras que estas funções travam:
 *
 * - uma pessoa está em **no máximo um** grupo;
 * - convites pendentes ocupam lugar (senão o limite de plano seria furado
 *   com uma pilha de convites);
 * - o dono não sai nem é removido — ou fica, ou o grupo é dissolvido;
 * - um convite expirado não entra por ninguém.
 */

import type { HotbarPlan } from '../plans/plans.js';
import { canAddFamilyMember } from './limits.js';
import {
  EMPTY_FAMILY,
  canInvite,
  canRemoveOthers,
  isValidFamilyName,
  roleOf,
  type FamilyInvite,
  type FamilyState,
  type FamilyOutcome,
} from './types.js';

/** Validade de um convite, em dias. */
export const INVITE_TTL_DAYS = 7;

/** Soma dias a uma data ISO-8601 (devolve ISO-8601). */
export function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** Convites pendentes do grupo. */
export function pendingInvites(state: FamilyState): readonly FamilyInvite[] {
  return state.invites.filter((invite) => invite.status === 'pending');
}

/**
 * Lugares ocupados: membros **e** convites pendentes.
 *
 * É o que impede convidar seis pessoas para um grupo com dois lugares: o
 * limite do plano é respeitado antes de alguém aceitar, não só depois.
 */
export function occupiedSlots(state: FamilyState): number {
  return state.members.length + pendingInvites(state).length;
}

/**
 * Cria o grupo com o criador como dono.
 *
 * Recusa quem já está num grupo — estar em dois seria conviver com duas
 * bibliotecas partilhadas sem saber de qual.
 */
export function createFamily(
  state: FamilyState,
  input: {
    groupId: string;
    name: string;
    ownerId: string;
    /** ISO-8601 UTC do agora. */
    now: string;
    plan: HotbarPlan;
  },
): FamilyOutcome {
  if (state.groupId !== null) {
    return { ok: false, reason: 'already-in-family' };
  }
  if (!isValidFamilyName(input.name)) {
    return { ok: false, reason: 'name-invalid' };
  }
  // Criar um grupo com um membro nunca fura o limite — mas a verificação
  // mantém a regra num único sítio, mesmo para um plano com limite zero.
  if (!canAddFamilyMember(input.plan, 0)) {
    return { ok: false, reason: 'limit-reached' };
  }
  return {
    ok: true,
    state: {
      groupId: input.groupId,
      name: input.name.trim(),
      ownerId: input.ownerId,
      members: [{ userId: input.ownerId, role: 'owner', joinedAt: input.now }],
      invites: [],
    },
  };
}

/**
 * Convida um email para o grupo (o convite fica **pendente**).
 *
 * O convite não cria conta: quem aceita entra com a conta que já tem (ou
 * nenhuma — aí o código não serve para nada).
 */
export function inviteMember(
  state: FamilyState,
  input: {
    inviteId: string;
    code: string;
    email: string;
    /** Quem convida (tem de ter papel no grupo). */
    actorId: string;
    /** Email de quem convida — convidar-se a si mesmo é recusado. */
    actorEmail: string;
    /** ISO-8601 UTC do agora. */
    now: string;
    plan: HotbarPlan;
  },
): FamilyOutcome {
  if (state.groupId === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  const role = roleOf(state, input.actorId);
  if (role === null || !canInvite(role)) {
    return { ok: false, reason: 'not-allowed' };
  }
  if (input.email.toLowerCase() === input.actorEmail.toLowerCase()) {
    return { ok: false, reason: 'self-invite' };
  }
  // Um convite pendente para o mesmo email impede outro: senão a pilha de
  // convites ocupava todos os lugares sem que ninguém tivesse entrado.
  const pending = pendingInvites(state).some(
    (invite) => invite.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (pending) {
    return { ok: false, reason: 'invite-pending' };
  }
  if (!canAddFamilyMember(input.plan, occupiedSlots(state))) {
    return { ok: false, reason: 'limit-reached' };
  }
  const invite: FamilyInvite = {
    id: input.inviteId,
    code: input.code,
    email: input.email,
    invitedBy: input.actorId,
    status: 'pending',
    createdAt: input.now,
    expiresAt: addDays(input.now, INVITE_TTL_DAYS),
    respondedAt: null,
  };
  return { ok: true, state: { ...state, invites: [...state.invites, invite] } };
}

/**
 * Aceita um convite pelo código: a pessoa entra como membro.
 *
 * Quem já está noutro grupo recusa — é a rota que sabe se a conta tem grupo,
 * e o domínio recusa pelo estado que recebe.
 */
export function acceptInvite(
  state: FamilyState,
  input: {
    code: string;
    userId: string;
    /** ISO-8601 UTC do agora. */
    now: string;
    plan: HotbarPlan;
  },
): FamilyOutcome {
  if (state.groupId === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  const invite = state.invites.find((item) => item.code === input.code);
  if (invite === undefined || invite.status !== 'pending') {
    return { ok: false, reason: 'invite-not-found' };
  }
  // A expiração é verificada a aceitar, não a criar: um convite velho não
  // entra por ninguém, mesmo que o grupo ainda tenha lugar.
  if (new Date(invite.expiresAt).getTime() < new Date(input.now).getTime()) {
    const expired: FamilyState = {
      ...state,
      invites: state.invites.map((item) =>
        item.id === invite.id ? { ...item, status: 'expired', respondedAt: input.now } : item,
      ),
    };
    return { ok: false, reason: 'invite-expired', state: expired };
  }
  if (!canAddFamilyMember(input.plan, state.members.length)) {
    return { ok: false, reason: 'limit-reached' };
  }
  return {
    ok: true,
    state: {
      ...state,
      members: [...state.members, { userId: input.userId, role: 'member', joinedAt: input.now }],
      invites: state.invites.map((item) =>
        item.id === invite.id ? { ...item, status: 'accepted', respondedAt: input.now } : item,
      ),
    },
  };
}

/** Recusa um convite (quem o recebeu pode dizer que não). */
export function declineInvite(state: FamilyState, input: { code: string; now: string }): FamilyOutcome {
  if (state.groupId === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  const invite = state.invites.find((item) => item.code === input.code);
  if (invite === undefined || invite.status !== 'pending') {
    return { ok: false, reason: 'invite-not-found' };
  }
  return {
    ok: true,
    state: {
      ...state,
      invites: state.invites.map((item) =>
        item.id === invite.id ? { ...item, status: 'declined', respondedAt: input.now } : item,
      ),
    },
  };
}

/**
 * Remove um membro — ou sai do grupo, quando o membro é o próprio.
 *
 * O dono não é removível: quem manda embora o grupo inteiro dissolve-o.
 */
export function removeMember(
  state: FamilyState,
  input: { actorId: string; userId: string },
): FamilyOutcome {
  if (state.groupId === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  const actorRole = roleOf(state, input.actorId);
  if (actorRole === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  const targetRole = roleOf(state, input.userId);
  if (targetRole === null) {
    return { ok: false, reason: 'not-member' };
  }
  // Sair é remover-se a si mesmo; remover outro exige ser dono.
  if (input.actorId !== input.userId && !canRemoveOthers(actorRole)) {
    return { ok: false, reason: 'not-allowed' };
  }
  if (targetRole === 'owner') {
    return { ok: false, reason: 'cannot-remove-owner' };
  }
  return {
    ok: true,
    state: { ...state, members: state.members.filter((member) => member.userId !== input.userId) },
  };
}

/** Dissolve o grupo (só o dono). O estado volta a vazio. */
export function dissolveFamily(state: FamilyState, input: { actorId: string }): FamilyOutcome {
  if (state.groupId === null) {
    return { ok: false, reason: 'not-in-family' };
  }
  if (state.ownerId !== input.actorId) {
    return { ok: false, reason: 'not-allowed' };
  }
  return { ok: true, state: EMPTY_FAMILY };
}

/**
 * Marca os convites pendentes já expirados como **expirados**.
 *
 * Chamado a ler (antes de responder), para o histórico não mostrar um
 * convite velho como se ainda pudesse ser aceite.
 */
export function expireInvites(state: FamilyState, now: string): FamilyState {
  const reference = new Date(now).getTime();
  let changed = false;
  const invites = state.invites.map((invite) => {
    if (invite.status === 'pending' && new Date(invite.expiresAt).getTime() < reference) {
      changed = true;
      return { ...invite, status: 'expired' as const, respondedAt: now };
    }
    return invite;
  });
  return changed ? { ...state, invites } : state;
}
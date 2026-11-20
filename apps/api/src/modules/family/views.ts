import {
  EMPTY_FAMILY,
  expireInvites,
  familyBenefits,
  FREE_PLAN,
  maxFamilyMembers,
  planById,
  remainingFamilySlots,
  type FamilyRefusal,
  type FamilyRole,
  type FamilyState,
  type HotbarPlan,
} from '@nexora/core';
import { errors } from '../../plugins/errorHandler.js';
import type {
  FamilyGroupSnapshot,
  FamilyMemberRecord,
  Repositories,
} from '../../repositories/types.js';

/**
 * Vistas e leituras da Família — o que as rotas montam antes de responder.
 *
 * Separado das rotas para que o ficheiro de handlers fique pequeno: aqui
 * vivem as conversões (registo → estado do domínio, estado → vista), o
 * plano do dono e a tradução das recusas do domínio para os erros do
 * contrato.
 */

/** Alfabeto do código de convite (sem `0/O` nem `1/I`: lidos em voz alta). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de convite legível e inequívoco. */
export function inviteCode(): string {
  return Array.from(
    { length: 10 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? 'X',
  ).join('');
}

/** Instante actual em ISO-8601. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Plano do dono do grupo (`free` quando o dono não é encontrado). */
export async function planOf(repositories: Repositories, ownerId: string): Promise<HotbarPlan> {
  const owner = await repositories.users.findById(ownerId);
  return (owner !== null ? planById(owner.planId) : undefined) ?? FREE_PLAN;
}

/** Estado do domínio de um grupo (`EMPTY_FAMILY` quando a pessoa não tem). */
export async function stateOfUser(
  repositories: Repositories,
  userId: string,
): Promise<{ snapshot: FamilyGroupSnapshot | null; state: FamilyState }> {
  const snapshot = await repositories.family.findGroupByUser(userId);
  if (snapshot === null) {
    return { snapshot: null, state: EMPTY_FAMILY };
  }
  return { snapshot, state: stateOf(snapshot) };
}

/** Converte a vista do repositório no estado do domínio. */
export function stateOf(snapshot: FamilyGroupSnapshot): FamilyState {
  return {
    groupId: snapshot.group.id,
    name: snapshot.group.name,
    ownerId: snapshot.group.ownerId,
    members: snapshot.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    invites: snapshot.invites.map((invite) => ({
      id: invite.id,
      code: invite.code,
      email: invite.email,
      invitedBy: invite.invitedBy,
      status: invite.status,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      respondedAt: invite.respondedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Persiste os convites que a expiração preguiçosa marcou como expirados.
 *
 * Sem isto, um convite com sete dias continuaria `pending` na base e a
 * página mostrá-lo-ia como aceitável para sempre.
 */
export async function persistExpired(
  repositories: Repositories,
  snapshot: FamilyGroupSnapshot,
  state: FamilyState,
): Promise<void> {
  const expiredIds = new Set(
    state.invites.filter((invite) => invite.status === 'expired').map((invite) => invite.id),
  );
  for (const row of snapshot.invites) {
    if (row.status === 'pending' && expiredIds.has(row.id)) {
      await repositories.family.respondInvite(row.id, 'expired', new Date());
    }
  }
}

/** Nome e email de cada membro (a conta pode já ter sido apagada). */
export async function memberViews(
  repositories: Repositories,
  members: readonly FamilyMemberRecord[],
): Promise<readonly Record<string, unknown>[]> {
  return Promise.all(
    members.map(async (member) => {
      const user = await repositories.users.findById(member.userId);
      return {
        userId: member.userId,
        displayName: user?.displayName ?? null,
        email: user?.email ?? null,
        role: member.role as FamilyRole,
        joinedAt: member.joinedAt.toISOString(),
      };
    }),
  );
}

/** Vista completa do grupo (membros com nome, convites e limites do plano). */
export async function familyView(
  repositories: Repositories,
  snapshot: FamilyGroupSnapshot,
  plan: HotbarPlan,
): Promise<Record<string, unknown>> {
  const [members, invites] = await Promise.all([
    memberViews(repositories, snapshot.members),
    Promise.resolve(snapshot.invites),
  ]);
  return {
    id: snapshot.group.id,
    name: snapshot.group.name,
    ownerId: snapshot.group.ownerId,
    createdAt: snapshot.group.createdAt.toISOString(),
    plan: {
      id: plan.id,
      maxMembers: maxFamilyMembers(plan),
      remainingSlots: remainingFamilySlots(plan, snapshot.members.length),
      benefits: familyBenefits(plan),
    },
    members,
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      code: invite.code,
      status: invite.status,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
    })),
  };
}

/** Traduz uma recusa do domínio no erro do contrato. */
export function refusalError(reason: FamilyRefusal, context: string): ReturnType<typeof errors.conflict> {
  switch (reason) {
    case 'name-invalid':
    case 'self-invite':
    case 'invite-expired':
      return errors.invalidRequest(context);
    case 'not-allowed':
      return errors.forbidden('Permissão insuficiente nesta operação.');
    case 'not-in-family':
    case 'invite-not-found':
    case 'not-member':
      return errors.notFound(context);
    default:
      // `already-in-family`, `already-member`, `invite-pending`,
      // `limit-reached`, `cannot-remove-owner`: o pedido é válido, o estado
      // é que não permite — daí o 409, nunca um 500.
      return errors.conflict(context, { reason });
  }
}

/** O grupo da pessoa, já com os convites vencidos marcados. */
export async function currentFamily(
  repositories: Repositories,
  userId: string,
): Promise<{ snapshot: FamilyGroupSnapshot | null; state: FamilyState; plan: HotbarPlan | null }> {
  const { snapshot, state } = await stateOfUser(repositories, userId);
  if (snapshot === null) {
    return { snapshot: null, state, plan: null };
  }
  const expiredState = expireInvites(state, nowIso());
  await persistExpired(repositories, snapshot, expiredState);
  const fresh = await repositories.family.findGroupByUser(userId);
  if (fresh === null) {
    return { snapshot: null, state, plan: null };
  }
  return {
    snapshot: fresh,
    state: stateOf(fresh),
    plan: await planOf(repositories, fresh.group.ownerId),
  };
}

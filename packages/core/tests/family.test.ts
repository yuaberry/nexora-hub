import { describe, expect, it } from 'vitest';
import { FREE_PLAN, PREMIUM_PLAN } from '../src/plans/plans.js';
import {
  canAddFamilyMember,
  familyBenefits,
  maxFamilyMembers,
  remainingFamilySlots,
} from '../src/family/limits.js';
import {
  INVITE_TTL_DAYS,
  acceptInvite,
  addDays,
  createFamily,
  declineInvite,
  dissolveFamily,
  expireInvites,
  inviteMember,
  occupiedSlots,
  removeMember,
} from '../src/family/state.js';
import { EMPTY_FAMILY, roleOf } from '../src/family/types.js';
import { mergeSharedLibraries } from '../src/family/shared-games.js';

/** Cria um grupo novo com o dono (`u-dono`). */
function groupWith(plan = FREE_PLAN, name = 'Família Teste') {
  const outcome = createFamily(EMPTY_FAMILY, {
    groupId: 'g1',
    name,
    ownerId: 'u-dono',
    now: '2026-01-01T10:00:00.000Z',
    plan,
  });
  if (!outcome.ok) {
    throw new Error('grupo deveria ser criado');
  }
  return outcome.state;
}

describe('limites de plano', () => {
  it('declara os limites de membros por plano', () => {
    expect(FREE_PLAN.maxFamilyMembers).toBe(2);
    expect(PREMIUM_PLAN.maxFamilyMembers).toBe(6);
    expect(maxFamilyMembers(FREE_PLAN)).toBe(2);
    expect(maxFamilyMembers(PREMIUM_PLAN)).toBe(6);
  });

  it('free aceita o segundo membro e recusa o terceiro', () => {
    expect(canAddFamilyMember(FREE_PLAN, 1)).toBe(true);
    expect(canAddFamilyMember(FREE_PLAN, 2)).toBe(false);
    expect(remainingFamilySlots(FREE_PLAN, 1)).toBe(1);
    expect(remainingFamilySlots(FREE_PLAN, 5)).toBe(0);
  });

  it('recusa contagens absurdas em vez de as deixar passar', () => {
    expect(canAddFamilyMember(FREE_PLAN, -1)).toBe(false);
    expect(canAddFamilyMember(FREE_PLAN, Number.NaN)).toBe(false);
    expect(remainingFamilySlots(FREE_PLAN, -3)).toBe(FREE_PLAN.maxFamilyMembers);
  });

  it('benefícios: o que existe está disponível, a nuvem está planeada', () => {
    const free = familyBenefits(FREE_PLAN);
    expect(free.find((item) => item.labelKey === 'family.benefit.members')?.value).toBe('2');
    expect(free.find((item) => item.labelKey === 'family.benefit.sharedLibrary')?.available).toBe(true);
    // Partilha de saves na nuvem ainda não existe: o selo tem razão de ser.
    expect(free.find((item) => item.labelKey === 'family.benefit.saveSharing')?.available).toBe(false);
  });
});

describe('criar grupo', () => {
  it('cria com o dono como membro', () => {
    const state = groupWith();
    expect(state.groupId).toBe('g1');
    expect(state.ownerId).toBe('u-dono');
    expect(state.members).toHaveLength(1);
    expect(roleOf(state, 'u-dono')).toBe('owner');
  });

  it('recusa quem já está num grupo', () => {
    const state = groupWith();
    const outcome = createFamily(state, {
      groupId: 'g2',
      name: 'Outro',
      ownerId: 'u-dono',
      now: '2026-01-02T10:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(outcome).toEqual({ ok: false, reason: 'already-in-family' });
  });

  it('recusa nome inválido (curto, longo ou vazio)', () => {
    for (const name of ['', ' ', 'a', 'x'.repeat(41)]) {
      const outcome = createFamily(EMPTY_FAMILY, {
        groupId: 'g',
        name,
        ownerId: 'u',
        now: '2026-01-01T10:00:00.000Z',
        plan: FREE_PLAN,
      });
      expect(outcome.ok).toBe(false);
    }
  });

  it('aceita nome com espaços em volta e guarda aparado', () => {
    const state = groupWith(FREE_PLAN, '  Família A  ');
    expect(state.name).toBe('Família A');
  });
});

describe('convites', () => {
  it('convida e ocupa um lugar enquanto está pendente', () => {
    const state = groupWith();
    const outcome = inviteMember(state, {
      inviteId: 'i1',
      code: 'CODIGO1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.invites).toHaveLength(1);
    // 1 membro + 1 convite = 2 lugares ocupados num plano de 2: cheio.
    expect(occupiedSlots(outcome.state)).toBe(2);
  });

  it('o convite vale sete dias', () => {
    const state = groupWith();
    const outcome = inviteMember(state, {
      inviteId: 'i1',
      code: 'CODIGO1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.invites[0]?.expiresAt).toBe(addDays('2026-01-01T11:00:00.000Z', INVITE_TTL_DAYS));
  });

  it('recusa convidar-se a si mesmo', () => {
    const state = groupWith();
    const outcome = inviteMember(state, {
      inviteId: 'i1',
      code: 'C',
      email: 'dono@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(outcome).toEqual({ ok: false, reason: 'self-invite' });
  });

  it('recusa dois convites pendentes para o mesmo email', () => {
    const first = inviteMember(groupWith(), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = inviteMember(first.state, {
      inviteId: 'i2',
      code: 'C2',
      email: 'IRMA@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T12:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(second).toEqual({ ok: false, reason: 'invite-pending' });
  });

  it('recusa convite quando o grupo está cheio (membros + pendentes)', () => {
    const state = groupWith();
    const first = inviteMember(state, {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = inviteMember(first.state, {
      inviteId: 'i2',
      code: 'C2',
      email: 'outro@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T12:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(second).toEqual({ ok: false, reason: 'limit-reached' });
  });

  it('membro comum não convida (papel de adulto convida)', () => {
    const state = groupWith(PREMIUM_PLAN);
    const joined = acceptInvite(state, {
      code: 'x',
      userId: 'u-membro',
      now: '2026-01-02T10:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(joined.ok).toBe(false);
    // Constrói um estado com um membro comum directamente no domínio.
    const withMember = {
      ...state,
      members: [...state.members, { userId: 'u-membro', role: 'member' as const, joinedAt: '2026-01-02T10:00:00.000Z' }],
    };
    const outcome = inviteMember(withMember, {
      inviteId: 'i9',
      code: 'C9',
      email: 'outro@nexora.local',
      actorId: 'u-membro',
      actorEmail: 'membro@nexora.local',
      now: '2026-01-02T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(outcome).toEqual({ ok: false, reason: 'not-allowed' });
  });
});

describe('aceitar convite', () => {
  it('aceite entra o membro e marca o convite', () => {
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const outcome = acceptInvite(created.state, {
      code: 'C1',
      userId: 'u-irma',
      now: '2026-01-02T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(roleOf(outcome.state, 'u-irma')).toBe('member');
    expect(outcome.state.invites[0]?.status).toBe('accepted');
    // Aceitar lierta o lugar do convite: o pendente deixa de contar.
    expect(occupiedSlots(outcome.state)).toBe(2);
  });

  it('convite inexistente não entra', () => {
    const outcome = acceptInvite(groupWith(PREMIUM_PLAN), {
      code: 'NAO-EXISTE',
      userId: 'u',
      now: '2026-01-02T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(outcome).toEqual({ ok: false, reason: 'invite-not-found' });
  });

  it('convite expirado é recusado e marcado como expirado', () => {
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const outcome = acceptInvite(created.state, {
      code: 'C1',
      userId: 'u-irma',
      now: addDays('2026-01-01T11:00:00.000Z', INVITE_TTL_DAYS + 1),
      plan: PREMIUM_PLAN,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe('invite-expired');
    // A marca da expiração fica no estado — a rota persiste-a.
    expect(outcome.state?.invites[0]?.status).toBe('expired');
    expect(outcome.state?.members).toHaveLength(1);
  });

  it('limite do plano recusa o aceite que não cabe', () => {
    // O grupo encheu ao abrigo do premium (dono + 1 membro, com um convite
    // pendente a ocupar o terceiro lugar). Se o dono passar ao plano livre,
    // o aceite desse convite já não cabe — e é recusado, não executado.
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const joined = acceptInvite(created.state, {
      code: 'C1',
      userId: 'u-irma',
      now: '2026-01-01T12:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) {
      return;
    }
    const pending = inviteMember(joined.state, {
      inviteId: 'i2',
      code: 'C2',
      email: 'outro@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T13:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) {
      return;
    }
    const outcome = acceptInvite(pending.state, {
      code: 'C2',
      userId: 'u-outro',
      now: '2026-01-02T11:00:00.000Z',
      plan: FREE_PLAN,
    });
    expect(outcome).toEqual({ ok: false, reason: 'limit-reached' });
  });

  it('recusar marca o convite sem acrescentar membro', () => {
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const outcome = declineInvite(created.state, { code: 'C1', now: '2026-01-02T11:00:00.000Z' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.invites[0]?.status).toBe('declined');
    expect(outcome.state.members).toHaveLength(1);
    // Recusar liberta o lugar: um novo convite passa a caber.
    expect(occupiedSlots(outcome.state)).toBe(1);
  });
});

describe('membros', () => {
  it('membro sai do grupo removendo-se a si mesmo', () => {
    const state = {
      ...groupWith(PREMIUM_PLAN),
      members: [
        { userId: 'u-dono', role: 'owner' as const, joinedAt: '2026-01-01T10:00:00.000Z' },
        { userId: 'u-membro', role: 'member' as const, joinedAt: '2026-01-02T10:00:00.000Z' },
      ],
    };
    const outcome = removeMember(state, { actorId: 'u-membro', userId: 'u-membro' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state.members).toHaveLength(1);
    }
  });

  it('membro comum não remove outro membro', () => {
    const state = {
      ...groupWith(PREMIUM_PLAN),
      members: [
        { userId: 'u-dono', role: 'owner' as const, joinedAt: '2026-01-01T10:00:00.000Z' },
        { userId: 'u-membro', role: 'member' as const, joinedAt: '2026-01-02T10:00:00.000Z' },
        { userId: 'u-outro', role: 'member' as const, joinedAt: '2026-01-03T10:00:00.000Z' },
      ],
    };
    const outcome = removeMember(state, { actorId: 'u-membro', userId: 'u-outro' });
    expect(outcome).toEqual({ ok: false, reason: 'not-allowed' });
  });

  it('dono remove outro membro', () => {
    const state = {
      ...groupWith(PREMIUM_PLAN),
      members: [
        { userId: 'u-dono', role: 'owner' as const, joinedAt: '2026-01-01T10:00:00.000Z' },
        { userId: 'u-membro', role: 'member' as const, joinedAt: '2026-01-02T10:00:00.000Z' },
      ],
    };
    const outcome = removeMember(state, { actorId: 'u-dono', userId: 'u-membro' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state.members).toHaveLength(1);
    }
  });

  it('o dono não é removível — quem quer o grupo fora dissolve-o', () => {
    const state = groupWith();
    const outcome = removeMember(state, { actorId: 'u-dono', userId: 'u-dono' });
    expect(outcome).toEqual({ ok: false, reason: 'cannot-remove-owner' });
  });

  it('remover quem não é membro recusa', () => {
    const outcome = removeMember(groupWith(PREMIUM_PLAN), { actorId: 'u-dono', userId: 'u-ninguem' });
    expect(outcome).toEqual({ ok: false, reason: 'not-member' });
  });

  it('só o dono dissolve o grupo', () => {
    const state = {
      ...groupWith(PREMIUM_PLAN),
      members: [
        { userId: 'u-dono', role: 'owner' as const, joinedAt: '2026-01-01T10:00:00.000Z' },
        { userId: 'u-membro', role: 'member' as const, joinedAt: '2026-01-02T10:00:00.000Z' },
      ],
    };
    const refused = dissolveFamily(state, { actorId: 'u-membro' });
    expect(refused).toEqual({ ok: false, reason: 'not-allowed' });
    const dissolved = dissolveFamily(state, { actorId: 'u-dono' });
    expect(dissolved.ok).toBe(true);
    if (dissolved.ok) {
      expect(dissolved.state).toEqual(EMPTY_FAMILY);
    }
  });
});

describe('expiração preguiçosa', () => {
  it('marca convites pendentes já vencidos', () => {
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const later = expireInvites(created.state, '2026-01-20T11:00:00.000Z');
    expect(later.invites[0]?.status).toBe('expired');
    expect(occupiedSlots(later)).toBe(1);
  });

  it('não mexe em convite dentro da validade', () => {
    const created = inviteMember(groupWith(PREMIUM_PLAN), {
      inviteId: 'i1',
      code: 'C1',
      email: 'irma@nexora.local',
      actorId: 'u-dono',
      actorEmail: 'dono@nexora.local',
      now: '2026-01-01T11:00:00.000Z',
      plan: PREMIUM_PLAN,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const later = expireInvites(created.state, '2026-01-05T11:00:00.000Z');
    expect(later.invites[0]?.status).toBe('pending');
  });
});

describe('biblioteca partilhada', () => {
  it('junta sem duplicar e lista os donos', () => {
    const games = mergeSharedLibraries([
      { userId: 'u1', externalKey: 'minecraft', title: 'Minecraft' },
      { userId: 'u2', externalKey: 'minecraft', title: 'Minecraft' },
      { userId: 'u2', externalKey: 'terraria', title: 'Terraria' },
    ]);
    expect(games).toHaveLength(2);
    const minecraft = games.find((game) => game.externalKey === 'minecraft');
    expect(minecraft?.owners).toEqual(['u1', 'u2']);
    expect(games[0]?.title).toBe('Minecraft');
  });

  it('lista vazia quando ninguém tem jogos', () => {
    expect(mergeSharedLibraries([])).toHaveLength(0);
  });

  it('o mesmo dono duas vezes não duplica na lista de donos', () => {
    const games = mergeSharedLibraries([
      { userId: 'u1', externalKey: 'minecraft', title: 'Minecraft' },
      { userId: 'u1', externalKey: 'minecraft', title: 'Minecraft' },
    ]);
    expect(games[0]?.owners).toEqual(['u1']);
  });
});
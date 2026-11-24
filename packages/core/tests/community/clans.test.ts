import { describe, expect, it } from 'vitest';
import {
  canChangeRole,
  canKick,
  canLeave,
  canManage,
  isFull,
  MAX_CLAN_MEMBERS,
  MAX_CLAN_NAME_LENGTH,
  MAX_CLAN_TAG_LENGTH,
  type Clan,
  type ClanMembership,
} from '../../src/community/clans.js';

/**
 * Clãs — as quatro regras de quem pode o quê.
 */
function clan(overrides: Partial<Clan> = {}): Clan {
  return {
    id: 'c1',
    name: 'NEXORA',
    tag: 'NX',
    description: 'Um clã de prova.',
    ownerId: 'dono',
    memberCount: 3,
    createdAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

function membro(overrides: Partial<ClanMembership> = {}): ClanMembership {
  return {
    clanId: 'c1',
    userId: 'u1',
    role: 'member',
    joinedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

describe('canManage', () => {
  it('dono e oficiais gerem; membro comum e estranho não', () => {
    expect(canManage(clan(), membro({ role: 'owner', userId: 'dono' }))).toBe(true);
    expect(canManage(clan(), membro({ role: 'officer' }))).toBe(true);
    expect(canManage(clan(), membro({ role: 'member' }))).toBe(false);
    expect(canManage(clan(), null)).toBe(false);
    // pertença a outro clã não conta
    expect(canManage(clan(), membro({ clanId: 'outro' }))).toBe(false);
  });
});

describe('canChangeRole', () => {
  it('só o dono muda papéis, e nunca a si próprio', () => {
    expect(canChangeRole(clan(), membro({ role: 'owner', userId: 'dono' }), 'u2')).toBe(true);
    expect(canChangeRole(clan(), membro({ role: 'owner', userId: 'dono' }), 'dono')).toBe(false);
    expect(canChangeRole(clan(), membro({ role: 'officer' }), 'u2')).toBe(false);
    expect(canChangeRole(clan(), membro({ role: 'member' }), 'u2')).toBe(false);
  });
});

describe('canLeave', () => {
  it('todos saem menos o dono', () => {
    expect(canLeave(clan(), membro({ role: 'owner', userId: 'dono' }))).toBe(false);
    expect(canLeave(clan(), membro({ role: 'officer' }))).toBe(true);
    expect(canLeave(clan(), membro({ role: 'member' }))).toBe(true);
    expect(canLeave(clan(), null)).toBe(false);
  });
});

describe('canKick', () => {
  it('quem gere expulsa, mas nunca o dono', () => {
    expect(canKick(clan(), membro({ role: 'owner', userId: 'dono' }), membro({ userId: 'u2', role: 'member' }))).toBe(true);
    // o dono não expulsa o dono (ele próprio)
    expect(canKick(clan(), membro({ role: 'owner', userId: 'dono' }), membro({ userId: 'dono', role: 'owner' }))).toBe(false);
    // um oficial não expulsa outro oficial
    expect(canKick(clan(), membro({ role: 'officer', userId: 'of1' }), membro({ userId: 'of2', role: 'officer' }))).toBe(false);
    // mas expulsa um membro comum
    expect(canKick(clan(), membro({ role: 'officer', userId: 'of1' }), membro({ userId: 'u2', role: 'member' }))).toBe(true);
    // e nunca a si próprio
    expect(canKick(clan(), membro({ role: 'officer', userId: 'of1' }), membro({ userId: 'of1', role: 'officer' }))).toBe(false);
    // um membro comum não expulsa ninguém
    expect(canKick(clan(), membro({ role: 'member' }), membro({ userId: 'u2', role: 'member' }))).toBe(false);
    // e um alvo que não é membro não se expulsa
    expect(canKick(clan(), membro({ role: 'owner', userId: 'dono' }), null)).toBe(false);
  });
});

describe('isFull', () => {
  it('o limite é aplicado', () => {
    expect(isFull(clan({ memberCount: MAX_CLAN_MEMBERS }))).toBe(true);
    expect(isFull(clan({ memberCount: MAX_CLAN_MEMBERS - 1 }))).toBe(false);
  });
});

describe('limites', () => {
  it('declarados', () => {
    expect(MAX_CLAN_NAME_LENGTH).toBe(24);
    expect(MAX_CLAN_TAG_LENGTH).toBe(5);
    expect(MAX_CLAN_MEMBERS).toBe(50);
  });
});

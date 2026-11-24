import { randomUUID } from 'node:crypto';
import type {
  ClanCreation,
  ClanInviteRecord,
  ClanMemberRecord,
  ClanRecord,
  ClanRepository,
} from './types.js';

/**
 * Clãs em memória — grupos, pertenças e convites.
 *
 * As contagens vivem no clã e são escritas pelas mesmas operações que mexem
 * nas pertenças: entrar e sair nunca deixam a conta desalinhada com a lista.
 */
export class MemoryClanRepository implements ClanRepository {
  private readonly clanRows = new Map<string, ClanRecord>();
  private readonly memberRows = new Map<string, ClanMemberRecord>();
  private readonly inviteRows = new Map<string, ClanInviteRecord>();

  async create(input: { name: string; tag: string; description: string; ownerId: string }): Promise<ClanCreation> {
    const name = input.name.trim();
    if (name.length < 3 || name.length > 24) {
      return { ok: false, reason: 'name-invalid' };
    }
    if ([...this.clanRows.values()].some((clan) => clan.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, reason: 'name-taken' };
    }
    const clan: ClanRecord = {
      id: randomUUID(),
      name,
      tag: input.tag.trim(),
      description: input.description,
      ownerId: input.ownerId,
      memberCount: 1,
      createdAt: new Date(),
    };
    this.clanRows.set(clan.id, clan);
    const membership: ClanMemberRecord = {
      clanId: clan.id,
      userId: input.ownerId,
      role: 'owner',
      joinedAt: clan.createdAt,
    };
    this.memberRows.set(memberKey(clan.id, input.ownerId), membership);
    return { ok: true, clan, membership };
  }

  async findById(clanId: string): Promise<ClanRecord | null> {
    return this.clanRows.get(clanId) ?? null;
  }

  async findByName(name: string): Promise<ClanRecord | null> {
    const wanted = name.trim().toLowerCase();
    return [...this.clanRows.values()].find((clan) => clan.name.toLowerCase() === wanted) ?? null;
  }

  async listByUser(userId: string): Promise<readonly { readonly clan: ClanRecord; readonly role: string }[]> {
    return [...this.memberRows.values()]
      .filter((member) => member.userId === userId)
      .map((member) => ({ clan: this.clanRows.get(member.clanId), role: member.role }))
      .filter((entry): entry is { clan: ClanRecord; role: string } => entry.clan !== undefined)
      .sort((left, right) => left.clan.name.localeCompare(right.clan.name));
  }

  async members(clanId: string): Promise<readonly ClanMemberRecord[]> {
    return [...this.memberRows.values()]
      .filter((member) => member.clanId === clanId)
      .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
  }

  async membership(clanId: string, userId: string): Promise<ClanMemberRecord | null> {
    return this.memberRows.get(memberKey(clanId, userId)) ?? null;
  }

  async invite(input: { clanId: string; inviterId: string; inviteeEmail: string }): Promise<ClanInviteRecord> {
    const record: ClanInviteRecord = {
      id: randomUUID(),
      clanId: input.clanId,
      inviterId: input.inviterId,
      inviteeEmail: input.inviteeEmail.trim(),
      status: 'pending',
      createdAt: new Date(),
      answeredAt: null,
    };
    this.inviteRows.set(record.id, record);
    return record;
  }

  async pendingInvites(email: string): Promise<readonly ClanInviteRecord[]> {
    const wanted = email.trim().toLowerCase();
    return [...this.inviteRows.values()].filter(
      (invite) => invite.inviteeEmail.toLowerCase() === wanted && invite.status === 'pending',
    );
  }

  async findInvite(inviteId: string): Promise<ClanInviteRecord | null> {
    return this.inviteRows.get(inviteId) ?? null;
  }

  async answerInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<ClanInviteRecord | null> {
    const invite = this.inviteRows.get(inviteId);
    if (invite === undefined || invite.status !== 'pending') {
      return null;
    }
    const answered: ClanInviteRecord = { ...invite, status, answeredAt: new Date() };
    this.inviteRows.set(inviteId, answered);
    return answered;
  }

  async join(clanId: string, userId: string): Promise<ClanMemberRecord | null> {
    const clan = this.clanRows.get(clanId);
    if (clan === undefined || this.memberRows.has(memberKey(clanId, userId))) {
      return null;
    }
    const membership: ClanMemberRecord = { clanId, userId, role: 'member', joinedAt: new Date() };
    this.memberRows.set(memberKey(clanId, userId), membership);
    this.clanRows.set(clanId, { ...clan, memberCount: clan.memberCount + 1 });
    return membership;
  }

  async setRole(clanId: string, userId: string, role: string): Promise<boolean> {
    const member = this.memberRows.get(memberKey(clanId, userId));
    if (member === undefined) {
      return false;
    }
    this.memberRows.set(memberKey(clanId, userId), { ...member, role });
    return true;
  }

  async removeMember(clanId: string, userId: string): Promise<boolean> {
    const removed = this.memberRows.delete(memberKey(clanId, userId));
    if (removed) {
      const clan = this.clanRows.get(clanId);
      if (clan !== undefined) {
        this.clanRows.set(clanId, { ...clan, memberCount: Math.max(1, clan.memberCount - 1) });
      }
    }
    return removed;
  }

  async dissolve(clanId: string): Promise<boolean> {
    if (!this.clanRows.delete(clanId)) {
      return false;
    }
    for (const key of [...this.memberRows.keys()]) {
      if (key.startsWith(`${clanId}::`)) {
        this.memberRows.delete(key);
      }
    }
    for (const [id, invite] of this.inviteRows) {
      if (invite.clanId === clanId) {
        this.inviteRows.delete(id);
      }
    }
    return true;
  }
}

/** Chave composta da pertença. */
function memberKey(clanId: string, userId: string): string {
  return `${clanId}::${userId}`;
}

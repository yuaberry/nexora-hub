import type {
  FamilyGroupRecord,
  FamilyGroupSnapshot,
  FamilyInviteRecord,
  FamilyMemberRecord,
  FamilyRepository,
  NewFamilyInviteInput,
  NewFamilyMemberInput,
} from './types.js';

/**
 * Grupo familiar em memória.
 *
 * As mesmas regras do PostgreSQL, aplicadas aqui: um dono tem **um** grupo,
 * um utilizador é membro de **um** grupo, e um código de convite aparece uma
 * vez. É esta implementação que os testes de integração exercitam — e que
 * serve o modo degradado (sem `DATABASE_URL`).
 */
export class MemoryFamilyRepository implements FamilyRepository {
  private readonly groups = new Map<string, FamilyGroupRecord>();
  private readonly members = new Map<string, FamilyMemberRecord>();
  private readonly invites = new Map<string, FamilyInviteRecord>();

  async createGroup(input: { id: string; name: string; ownerId: string }): Promise<FamilyGroupRecord> {
    const now = new Date();
    const record: FamilyGroupRecord = {
      id: input.id,
      name: input.name,
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };
    this.groups.set(record.id, record);
    // O dono entra como membro: um grupo sem dono não tem quem o dissolva.
    this.members.set(memberKey(record.id, input.ownerId), {
      groupId: record.id,
      userId: input.ownerId,
      role: 'owner',
      joinedAt: now,
    });
    return record;
  }

  async findGroupByUser(userId: string): Promise<FamilyGroupSnapshot | null> {
    const membership = [...this.members.values()].find((row) => row.userId === userId);
    if (membership === undefined) {
      return null;
    }
    return this.snapshot(membership.groupId);
  }

  async findGroupById(groupId: string): Promise<FamilyGroupSnapshot | null> {
    return this.snapshot(groupId);
  }

  async addMember(input: NewFamilyMemberInput): Promise<void> {
    const key = memberKey(input.groupId, input.userId);
    const existing = this.members.get(key);
    if (existing !== undefined) {
      // Entrar duas vezes não muda o papel: a primeira entrada é a que fica.
      return;
    }
    this.members.set(key, {
      groupId: input.groupId,
      userId: input.userId,
      role: input.role,
      joinedAt: input.joinedAt,
    });
  }

  async removeMember(groupId: string, userId: string): Promise<boolean> {
    return this.members.delete(memberKey(groupId, userId));
  }

  async createInvite(input: NewFamilyInviteInput): Promise<FamilyInviteRecord> {
    const record: FamilyInviteRecord = {
      id: input.id,
      groupId: input.groupId,
      code: input.code,
      email: input.email,
      invitedBy: input.invitedBy,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      respondedAt: null,
    };
    this.invites.set(record.id, record);
    return record;
  }

  async findInviteByCode(code: string): Promise<FamilyInviteRecord | null> {
    return [...this.invites.values()].find((row) => row.code === code) ?? null;
  }

  async respondInvite(
    inviteId: string,
    status: 'accepted' | 'declined' | 'expired',
    now: Date,
  ): Promise<FamilyInviteRecord | null> {
    const row = this.invites.get(inviteId);
    if (row === undefined) {
      return null;
    }
    const updated: FamilyInviteRecord = { ...row, status, respondedAt: now };
    this.invites.set(inviteId, updated);
    return updated;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    const existed = this.groups.delete(groupId);
    for (const key of [...this.members.keys()]) {
      if (key.startsWith(`${groupId}:`)) {
        this.members.delete(key);
      }
    }
    for (const row of [...this.invites.values()]) {
      if (row.groupId === groupId) {
        this.invites.delete(row.id);
      }
    }
    return existed;
  }

  /** Monta a vista do grupo (membros e convites ordenados). */
  private async snapshot(groupId: string): Promise<FamilyGroupSnapshot | null> {
    const group = this.groups.get(groupId);
    if (group === undefined) {
      return null;
    }
    const members = [...this.members.values()]
      .filter((row) => row.groupId === groupId)
      .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
    const invites = [...this.invites.values()]
      .filter((row) => row.groupId === groupId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return { group, members, invites };
  }
}

/** Chave de um membro (grupo + utilizador). */
function memberKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}
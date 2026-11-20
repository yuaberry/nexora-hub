import { and, asc, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { familyGroups, familyInvites, familyMembers } from '../db/family-schema.js';
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
 * Grupo familiar em PostgreSQL.
 *
 * O que a memória não dá conta e aqui é garantido pelo esquema: o criador
 * entra como dono **na mesma transacção** que o grupo (um grupo sem dono não
 * ficaria com ninguém para o dissolver), e o índice único do código impede
 * dois convites com o mesmo código — aceitar duas vezes o mesmo código
 * acrescentaria um membro a mais.
 */
export class PostgresFamilyRepository implements FamilyRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async createGroup(input: { id: string; name: string; ownerId: string }): Promise<FamilyGroupRecord> {
    const rows = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(familyGroups)
        .values({ id: input.id, name: input.name, ownerId: input.ownerId })
        .returning();
      const group = inserted[0];
      if (group === undefined) {
        throw new Error('Falha ao criar o grupo familiar.');
      }
      await tx.insert(familyMembers).values({
        groupId: input.id,
        userId: input.ownerId,
        role: 'owner',
      });
      return group;
    });

    return toGroupRecord(rows);
  }

  async findGroupByUser(userId: string): Promise<FamilyGroupSnapshot | null> {
    const membership = await this.db
      .select({ groupId: familyMembers.groupId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId))
      .limit(1);
    const groupId = membership[0]?.groupId;
    if (groupId === undefined) {
      return null;
    }
    return this.snapshot(groupId);
  }

  async findGroupById(groupId: string): Promise<FamilyGroupSnapshot | null> {
    return this.snapshot(groupId);
  }

  async addMember(input: NewFamilyMemberInput): Promise<void> {
    await this.db
      .insert(familyMembers)
      .values({ groupId: input.groupId, userId: input.userId, role: input.role, joinedAt: input.joinedAt })
      .onConflictDoNothing();
  }

  async removeMember(groupId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(familyMembers)
      .where(and(eq(familyMembers.groupId, groupId), eq(familyMembers.userId, userId)))
      .returning({ userId: familyMembers.userId });
    return rows.length > 0;
  }

  async createInvite(input: NewFamilyInviteInput): Promise<FamilyInviteRecord> {
    const rows = await this.db
      .insert(familyInvites)
      .values({
        id: input.id,
        groupId: input.groupId,
        code: input.code,
        email: input.email,
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Falha ao criar o convite.');
    }
    return toInviteRecord(row);
  }

  async findInviteByCode(code: string): Promise<FamilyInviteRecord | null> {
    const rows = await this.db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.code, code))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toInviteRecord(row);
  }

  async respondInvite(
    inviteId: string,
    status: 'accepted' | 'declined' | 'expired',
    now: Date,
  ): Promise<FamilyInviteRecord | null> {
    const rows = await this.db
      .update(familyInvites)
      .set({ status, respondedAt: now })
      .where(eq(familyInvites.id, inviteId))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toInviteRecord(row);
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.delete(familyMembers).where(eq(familyMembers.groupId, groupId));
      await tx.delete(familyInvites).where(eq(familyInvites.groupId, groupId));
      return tx.delete(familyGroups).where(eq(familyGroups.id, groupId)).returning({ id: familyGroups.id });
    });
    return rows.length > 0;
  }

  /** Monta a vista do grupo (membros e convites ordenados). */
  private async snapshot(groupId: string): Promise<FamilyGroupSnapshot | null> {
    const groupRows = await this.db
      .select()
      .from(familyGroups)
      .where(eq(familyGroups.id, groupId))
      .limit(1);
    const group = groupRows[0];
    if (group === undefined) {
      return null;
    }
    const [members, invites] = await Promise.all([
      this.db
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.groupId, groupId))
        .orderBy(asc(familyMembers.joinedAt)),
      this.db
        .select()
        .from(familyInvites)
        .where(eq(familyInvites.groupId, groupId))
        .orderBy(desc(familyInvites.createdAt)),
    ]);
    return {
      group: toGroupRecord(group),
      members: members.map(toMemberRecord),
      invites: invites.map(toInviteRecord),
    };
  }
}

/** Converte uma linha do grupo no registo do domínio. */
function toGroupRecord(row: typeof familyGroups.$inferSelect): FamilyGroupRecord {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/** Converte uma linha de membro no registo do domínio. */
function toMemberRecord(row: typeof familyMembers.$inferSelect): FamilyMemberRecord {
  return {
    groupId: row.groupId,
    userId: row.userId,
    role: row.role === 'owner' || row.role === 'adult' ? row.role : 'member',
    joinedAt: row.joinedAt ?? new Date(),
  };
}

/** Converte uma linha de convite no registo do domínio. */
function toInviteRecord(row: typeof familyInvites.$inferSelect): FamilyInviteRecord {
  return {
    id: row.id,
    groupId: row.groupId,
    code: row.code,
    email: row.email,
    invitedBy: row.invitedBy,
    status:
      row.status === 'pending' ||
      row.status === 'accepted' ||
      row.status === 'declined' ||
      row.status === 'expired'
        ? row.status
        : 'pending',
    createdAt: row.createdAt ?? new Date(),
    expiresAt: row.expiresAt ?? new Date(),
    respondedAt: row.respondedAt ?? null,
  };
}
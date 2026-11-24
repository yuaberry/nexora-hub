import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type {
  ClanCreation,
  ClanInviteRecord,
  ClanMemberRecord,
  ClanRecord,
  ClanRepository,
} from './types.js';

/**
 * Clãs em PostgreSQL.
 *
 * **Recurso de outro utilizador devolve `404`, nunca `403`**: ver papéis e
 * expulsar filtram sempre pela pertença de quem age. As contagens vivem no
 * clã e são escritas pelas mesmas operações que mexem nas pertenças — entrar
 * e sair nunca deixam a conta desalinhada com a lista.
 */

const { clanInvites, clanMembers, clans } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Converte uma linha do banco no registo do domínio. */
function toClan(row: typeof clans.$inferSelect): ClanRecord {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    description: row.description,
    ownerId: row.ownerId,
    memberCount: row.memberCount,
    createdAt: row.createdAt,
  };
}

/** Converte uma linha do banco no registo do domínio. */
function toMember(row: typeof clanMembers.$inferSelect): ClanMemberRecord {
  return {
    clanId: row.clanId,
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
  };
}

/** Converte uma linha do banco no registo do domínio. */
function toInvite(row: typeof clanInvites.$inferSelect): ClanInviteRecord {
  return {
    id: row.id,
    clanId: row.clanId,
    inviterId: row.inviterId,
    inviteeEmail: row.inviteeEmail,
    status: row.status,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
  };
}

/** Clãs em PostgreSQL. */
export class PostgresClanRepository implements ClanRepository {
  constructor(private readonly db: Db) {}

  async create(input: { name: string; tag: string; description: string; ownerId: string }): Promise<ClanCreation> {
    const name = input.name.trim();
    if (name.length < 3 || name.length > 24) {
      return { ok: false, reason: 'name-invalid' };
    }
    const taken = await this.db.select({ id: clans.id }).from(clans).where(sql`lower(${clans.name}) = ${name.toLowerCase()}`).limit(1);
    if (taken.length > 0) {
      return { ok: false, reason: 'name-taken' };
    }
    const rows = await this.db
      .insert(clans)
      .values({
        name,
        tag: input.tag.trim(),
        description: input.description,
        ownerId: input.ownerId,
        memberCount: 1,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('O clã não foi devolvido pelo banco.');
    }
    const membership: ClanMemberRecord = {
      clanId: row.id,
      userId: input.ownerId,
      role: 'owner',
      joinedAt: row.createdAt,
    };
    await this.db.insert(clanMembers).values(membership);
    return { ok: true, clan: toClan(row), membership: toMember({ ...membership } as typeof clanMembers.$inferSelect) };
  }

  async findById(clanId: string): Promise<ClanRecord | null> {
    const rows = await this.db.select().from(clans).where(eq(clans.id, clanId)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toClan(row);
  }

  async findByName(name: string): Promise<ClanRecord | null> {
    const rows = await this.db.select().from(clans).where(sql`lower(${clans.name}) = ${name.trim().toLowerCase()}`).limit(1);
    const row = rows[0];
    return row === undefined ? null : toClan(row);
  }

  async listByUser(userId: string): Promise<readonly { readonly clan: ClanRecord; readonly role: string }[]> {
    const rows = await this.db
      .select({ clan: clans, role: clanMembers.role })
      .from(clanMembers)
      .innerJoin(clans, eq(clans.id, clanMembers.clanId))
      .where(eq(clanMembers.userId, userId))
      .orderBy(asc(clans.name));
    return rows.map((row) => ({ clan: toClan(row.clan), role: row.role }));
  }

  async members(clanId: string): Promise<readonly ClanMemberRecord[]> {
    const rows = await this.db
      .select()
      .from(clanMembers)
      .where(eq(clanMembers.clanId, clanId))
      .orderBy(asc(clanMembers.joinedAt));
    return rows.map(toMember);
  }

  async membership(clanId: string, userId: string): Promise<ClanMemberRecord | null> {
    const rows = await this.db
      .select()
      .from(clanMembers)
      .where(and(eq(clanMembers.clanId, clanId), eq(clanMembers.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toMember(row);
  }

  async invite(input: { clanId: string; inviterId: string; inviteeEmail: string }): Promise<ClanInviteRecord> {
    const rows = await this.db
      .insert(clanInvites)
      .values({
        clanId: input.clanId,
        inviterId: input.inviterId,
        inviteeEmail: input.inviteeEmail.trim(),
        status: 'pending',
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('O convite não foi devolvido pelo banco.');
    }
    return toInvite(row);
  }

  async pendingInvites(email: string): Promise<readonly ClanInviteRecord[]> {
    const rows = await this.db
      .select()
      .from(clanInvites)
      .where(and(eq(sql`lower(${clanInvites.inviteeEmail})`, email.trim().toLowerCase()), eq(clanInvites.status, 'pending')));
    return rows.map(toInvite);
  }

  async findInvite(inviteId: string): Promise<ClanInviteRecord | null> {
    const rows = await this.db.select().from(clanInvites).where(eq(clanInvites.id, inviteId)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toInvite(row);
  }

  async answerInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<ClanInviteRecord | null> {
    const rows = await this.db
      .update(clanInvites)
      .set({ status, answeredAt: new Date() })
      .where(and(eq(clanInvites.id, inviteId), eq(clanInvites.status, 'pending')))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toInvite(row);
  }

  async join(clanId: string, userId: string): Promise<ClanMemberRecord | null> {
    const clan = await this.findById(clanId);
    if (clan === null) {
      return null;
    }
    const joinedAt = new Date();
    await this.db
      .insert(clanMembers)
      .values({ clanId, userId, role: 'member', joinedAt })
      .onConflictDoNothing();
    await this.db
      .update(clans)
      .set({ memberCount: sql`(select count(*) from ${clanMembers} where ${clanMembers.clanId} = ${clanId})` })
      .where(eq(clans.id, clanId));
    return { clanId, userId, role: 'member', joinedAt };
  }

  async setRole(clanId: string, userId: string, role: string): Promise<boolean> {
    const rows = await this.db
      .update(clanMembers)
      .set({ role })
      .where(and(eq(clanMembers.clanId, clanId), eq(clanMembers.userId, userId)))
      .returning({ userId: clanMembers.userId });
    return rows.length > 0;
  }

  async removeMember(clanId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(clanMembers)
      .where(and(eq(clanMembers.clanId, clanId), eq(clanMembers.userId, userId)))
      .returning({ userId: clanMembers.userId });
    if (rows.length === 0) {
      return false;
    }
    await this.db
      .update(clans)
      .set({ memberCount: sql`greatest(1, (select count(*) from ${clanMembers} where ${clanMembers.clanId} = ${clanId}))` })
      .where(eq(clans.id, clanId));
    return true;
  }

  async dissolve(clanId: string): Promise<boolean> {
    const rows = await this.db.delete(clans).where(eq(clans.id, clanId)).returning({ id: clans.id });
    if (rows.length === 0) {
      return false;
    }
    await this.db.delete(clanMembers).where(eq(clanMembers.clanId, clanId));
    await this.db.delete(clanInvites).where(eq(clanInvites.clanId, clanId));
    return true;
  }
}
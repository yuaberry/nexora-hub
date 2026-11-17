import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { AuditRecordInput, AuditRepository, UserRecord, UserRepository } from './types.js';

/**
 * Repositório de utilizadores em PostgreSQL.
 *
 * A contagem de tentativas falhadas é **atómica na base de dados**
 * (`failed_login_attempts + 1` em SQL): cinco logins em paralelo têm de
 * contar cinco. Somar em memória e gravar depois perderia tentativas e o
 * lockout nunca existiria.
 */

type Db = NodePgDatabase<typeof schema>;

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async create(input: Parameters<UserRepository['create']>[0]): Promise<UserRecord> {
    const rows = await this.db
      .insert(schema.users)
      .values({
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
        role: input.role ?? 'user',
        planId: input.planId ?? 'free',
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em users.');
    }
    return row;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async countAll(): Promise<number> {
    const rows = await this.db.select({ total: sql<number>`count(*)::int` }).from(schema.users);
    return rows[0]?.total ?? 0;
  }

  async incrementFailedAttempts(userId: string): Promise<number> {
    const rows = await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning({ attempts: schema.users.failedLoginAttempts });
    return rows[0]?.attempts ?? 0;
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async lockUntil(userId: string, until: Date | null): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ lockedUntil: until, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async setRole(userId: string, role: UserRecord['role']): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async setDisplayName(userId: string, displayName: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }
}

/** Repositório de auditoria em PostgreSQL. */
export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  async record(input: AuditRecordInput) {
    const rows = await this.db
      .insert(schema.auditLogs)
      .values({
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: { ...(input.metadata ?? {}) },
        requestId: input.requestId ?? null,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em audit_logs.');
    }
    return row;
  }

  async list(query: { limit: number; offset: number }) {
    const rows = await this.db
      .select()
      .from(schema.auditLogs)
      .orderBy(sql`${schema.auditLogs.createdAt} desc`)
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.auditLogs);
    return { items: rows, total: totalRows[0]?.total ?? 0 };
  }
}
import { randomUUID } from 'node:crypto';
import type {
  AuditLogRecord,
  AuditRecordInput,
  AuditRepository,
  NewUserRecord,
  UserRecord,
  UserRepository,
} from './types.js';

/**
 * Repositório de utilizadores em memória.
 *
 * Serve os testes de integração e o **modo degradado** (sem `DATABASE_URL`).
 * A contagem de tentativas falhadas continua a ser atómica — aqui, por o
 * processo ser de fio único; no PostgreSQL é `failed_login_attempts + 1` em
 * SQL, e a Interface é a mesma.
 */

export class MemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, UserRecord>();

  async create(input: NewUserRecord): Promise<UserRecord> {
    const now = new Date();
    const record: UserRecord = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      role: input.role ?? 'user',
      planId: input.planId ?? 'free',
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const target = email.toLowerCase();
    for (const row of this.rows.values()) {
      if (row.email === target) {
        return row;
      }
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async countAll(): Promise<number> {
    return this.rows.size;
  }

  async incrementFailedAttempts(userId: string): Promise<number> {
    const row = this.rows.get(userId);
    if (row === undefined) {
      return 0;
    }
    const updated: UserRecord = {
      ...row,
      failedLoginAttempts: row.failedLoginAttempts + 1,
      updatedAt: new Date(),
    };
    this.rows.set(userId, updated);
    return updated.failedLoginAttempts;
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    const row = this.rows.get(userId);
    if (row === undefined) {
      return;
    }
    this.rows.set(userId, { ...row, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() });
  }

  async lockUntil(userId: string, until: Date | null): Promise<void> {
    const row = this.rows.get(userId);
    if (row === undefined) {
      return;
    }
    this.rows.set(userId, { ...row, lockedUntil: until, updatedAt: new Date() });
  }

  async setRole(userId: string, role: UserRecord['role']): Promise<void> {
    const row = this.rows.get(userId);
    if (row === undefined) {
      return;
    }
    this.rows.set(userId, { ...row, role, updatedAt: new Date() });
  }

  async setDisplayName(userId: string, displayName: string): Promise<void> {
    const row = this.rows.get(userId);
    if (row === undefined) {
      return;
    }
    this.rows.set(userId, { ...row, displayName, updatedAt: new Date() });
  }
}

/** Repositório de auditoria em memória. */
export class MemoryAuditRepository implements AuditRepository {
  private readonly rows: AuditLogRecord[] = [];

  async record(input: AuditRecordInput): Promise<AuditLogRecord> {
    const row: AuditLogRecord = {
      id: randomUUID(),
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: { ...(input.metadata ?? {}) },
      requestId: input.requestId ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async list(query: { limit: number; offset: number }): Promise<{
    items: readonly AuditLogRecord[];
    total: number;
  }> {
    const sorted = [...this.rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      items: sorted.slice(query.offset, query.offset + query.limit),
      total: sorted.length,
    };
  }
}
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from '../db/schema.js';
import type {
  AuthSessionRecord,
  AuthSessionRepository,
  MfaRepository,
  MfaSecretRecord,
  NewAuthSessionRecord,
} from './types.js';

/**
 * Sessões de autenticação em PostgreSQL.
 *
 * A **rotação é atómica**: revogar o token actual e criar o sucessor são uma
 * só operação (transacção). Dois pedidos paralelos não podem criar dois
 * sucessores válidos para a mesma família — é o que `markRotated` garante ao
 * devolver `false` quando a sessão já estava revogada.
 */

type Db = NodePgDatabase<typeof schema>;

export class PostgresAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewAuthSessionRecord): Promise<AuthSessionRecord> {
    const rows = await this.db
      .insert(schema.authSessions)
      .values({
        userId: input.userId,
        familyId: input.familyId ?? randomUUID(),
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em auth_sessions.');
    }
    return row;
  }

  async findById(id: string): Promise<AuthSessionRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async markRotated(sessionId: string, successorId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(schema.authSessions)
      .set({ rotatedToId: successorId, revokedAt: now, revokeReason: 'rotated', lastUsedAt: now })
      .where(sql`${schema.authSessions.id} = ${sessionId} and ${schema.authSessions.revokedAt} is null`)
      .returning({ id: schema.authSessions.id });
    return rows.length > 0;
  }

  async revokeFamily(familyId: string, reason: AuthSessionRecord['revokeReason'], now: Date): Promise<number> {
    const rows = await this.db
      .update(schema.authSessions)
      .set({ revokedAt: now, revokeReason: reason })
      .where(sql`${schema.authSessions.familyId} = ${familyId} and ${schema.authSessions.revokedAt} is null`)
      .returning({ id: schema.authSessions.id });
    return rows.length;
  }

  async revokeById(sessionId: string, reason: AuthSessionRecord['revokeReason'], now: Date): Promise<void> {
    await this.db
      .update(schema.authSessions)
      .set({ revokedAt: now, revokeReason: reason })
      .where(sql`${schema.authSessions.id} = ${sessionId} and ${schema.authSessions.revokedAt} is null`);
  }

  async listActiveByUser(userId: string): Promise<readonly AuthSessionRecord[]> {
    return this.db
      .select()
      .from(schema.authSessions)
      .where(sql`${schema.authSessions.userId} = ${userId} and ${schema.authSessions.revokedAt} is null`);
  }

  async deleteExpiredBefore(before: Date): Promise<number> {
    const rows = await this.db
      .delete(schema.authSessions)
      .where(sql`${schema.authSessions.expiresAt} < ${before}`)
      .returning({ id: schema.authSessions.id });
    return rows.length;
  }
}

/**
 * MFA em PostgreSQL.
 *
 * O consumo do passo TOTP é um `UPDATE` **condicional**: dois pedidos
 * paralelos com o mesmo código disputam a mesma linha e só um ganha. Um passo
 * igual ou anterior ao último aceite é recusado — a excepção deliberada é o
 * enrollment, onde o passo **não** é consumido (é o serviço que decide, não o
 * repositório).
 */
export class PostgresMfaRepository implements MfaRepository {
  constructor(private readonly db: Db) {}

  async upsertPendingSecret(userId: string, ciphertext: string): Promise<MfaSecretRecord> {
    const current = await this.findSecret(userId);
    if (current !== null && current.enabledAt !== null) {
      throw new Error('MFA_ACTIVE');
    }
    const rows = await this.db
      .insert(schema.mfaSecrets)
      .values({ userId, secretCiphertext: ciphertext, enabledAt: null, lastUsedStep: null })
      .onConflictDoUpdate({
        target: schema.mfaSecrets.userId,
        set: { secretCiphertext: ciphertext, enabledAt: null, lastUsedStep: null, updatedAt: new Date() },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em mfa_secrets.');
    }
    return row;
  }

  async confirmSecret(userId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(schema.mfaSecrets)
      .set({ enabledAt: now, updatedAt: now })
      .where(eq(schema.mfaSecrets.userId, userId))
      .returning({ userId: schema.mfaSecrets.userId });
    return rows.length > 0;
  }

  async consumeStep(userId: string, step: number): Promise<boolean> {
    const rows = await this.db
      .update(schema.mfaSecrets)
      .set({ lastUsedStep: step, updatedAt: new Date() })
      .where(
        sql`${schema.mfaSecrets.userId} = ${userId} and (${schema.mfaSecrets.lastUsedStep} is null or ${schema.mfaSecrets.lastUsedStep} < ${step})`,
      )
      .returning({ userId: schema.mfaSecrets.userId });
    return rows.length > 0;
  }

  async findSecret(userId: string): Promise<MfaSecretRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.mfaSecrets)
      .where(eq(schema.mfaSecrets.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findEnabled(userId: string): Promise<MfaSecretRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.mfaSecrets)
      .where(sql`${schema.mfaSecrets.userId} = ${userId} and ${schema.mfaSecrets.enabledAt} is not null`)
      .limit(1);
    return rows[0] ?? null;
  }

  async disable(userId: string): Promise<void> {
    await this.db.delete(schema.mfaSecrets).where(eq(schema.mfaSecrets.userId, userId));
    await this.db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.userId, userId));
  }

  async replaceRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void> {
    await this.db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.userId, userId));
    if (codeHashes.length === 0) {
      return;
    }
    await this.db.insert(schema.mfaRecoveryCodes).values(
      codeHashes.map((codeHash) => ({ userId, codeHash })),
    );
  }

  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    // O filtro pelo **dono** está no WHERE: o código de outra conta nem
    // sequer é marcado como usado.
    const rows = await this.db
      .update(schema.mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        sql`${schema.mfaRecoveryCodes.codeHash} = ${codeHash} and ${schema.mfaRecoveryCodes.userId} = ${userId} and ${schema.mfaRecoveryCodes.usedAt} is null`,
      )
      .returning({ id: schema.mfaRecoveryCodes.id });
    return rows.length > 0;
  }

  async countRecoveryCodes(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.mfaRecoveryCodes)
      .where(
        sql`${schema.mfaRecoveryCodes.userId} = ${userId} and ${schema.mfaRecoveryCodes.usedAt} is null`,
      );
    return rows[0]?.total ?? 0;
  }
}
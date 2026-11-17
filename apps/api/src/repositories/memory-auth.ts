import { randomUUID } from 'node:crypto';
import type {
  AuthSessionRecord,
  AuthSessionRepository,
  MfaRepository,
  MfaSecretRecord,
  NewAuthSessionRecord,
} from './types.js';

/**
 * Repositório de sessões de autenticação em memória.
 *
 * A **rotação é atómica** aqui por o processo ser de fio único; no PostgreSQL
 * é uma transacção. A interface é a mesma, e é a interface que garante a
 * regra: dois pedidos paralelos não criam dois sucessores válidos para a
 * mesma família.
 */

export class MemoryAuthSessionRepository implements AuthSessionRepository {
  private readonly rows = new Map<string, AuthSessionRecord>();

  async create(input: NewAuthSessionRecord): Promise<AuthSessionRecord> {
    const now = new Date();
    const record: AuthSessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      familyId: input.familyId ?? randomUUID(),
      rotatedToId: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revokeReason: null,
      lastUsedAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<AuthSessionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async markRotated(sessionId: string, successorId: string, now: Date): Promise<boolean> {
    const row = this.rows.get(sessionId);
    if (row === undefined || row.revokedAt !== null) {
      return false;
    }
    this.rows.set(sessionId, {
      ...row,
      rotatedToId: successorId,
      revokedAt: now,
      revokeReason: 'rotated',
      lastUsedAt: now,
    });
    return true;
  }

  async revokeFamily(familyId: string, reason: AuthSessionRecord['revokeReason']): Promise<number> {
    const now = new Date();
    let revoked = 0;
    for (const [id, row] of this.rows) {
      if (row.familyId === familyId && row.revokedAt === null) {
        this.rows.set(id, { ...row, revokedAt: now, revokeReason: reason });
        revoked += 1;
      }
    }
    return revoked;
  }

  async revokeById(sessionId: string, reason: AuthSessionRecord['revokeReason']): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row === undefined || row.revokedAt !== null) {
      return;
    }
    this.rows.set(sessionId, { ...row, revokedAt: new Date(), revokeReason: reason });
  }

  async listActiveByUser(userId: string): Promise<readonly AuthSessionRecord[]> {
    return [...this.rows.values()].filter(
      (row) => row.userId === userId && row.revokedAt === null,
    );
  }

  async deleteExpiredBefore(before: Date): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt < before) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

/**
 * Repositório de MFA em memória.
 *
 * O consumo do passo TOTP é atómico (fio único): dois pedidos paralelos com o
 * mesmo código disputam a mesma linha e só um ganha.
 */
export class MemoryMfaRepository implements MfaRepository {
  private readonly secrets = new Map<string, MfaSecretRecord>();
  private readonly codes = new Map<string, { userId: string; usedAt: Date | null }>();

  async upsertPendingSecret(userId: string, ciphertext: string): Promise<MfaSecretRecord> {
    const current = this.secrets.get(userId);
    if (current !== undefined && current.enabledAt !== null) {
      throw new Error('MFA_ACTIVE');
    }
    const record: MfaSecretRecord = {
      userId,
      secretCiphertext: ciphertext,
      enabledAt: null,
      lastUsedStep: null,
    };
    this.secrets.set(userId, record);
    return record;
  }

  async confirmSecret(userId: string, now: Date): Promise<boolean> {
    const row = this.secrets.get(userId);
    if (row === undefined) {
      return false;
    }
    this.secrets.set(userId, { ...row, enabledAt: now });
    return true;
  }

  async consumeStep(userId: string, step: number): Promise<boolean> {
    const row = this.secrets.get(userId);
    if (row === undefined) {
      return false;
    }
    if (row.lastUsedStep !== null && step <= row.lastUsedStep) {
      return false;
    }
    this.secrets.set(userId, { ...row, lastUsedStep: step });
    return true;
  }

  async findSecret(userId: string): Promise<MfaSecretRecord | null> {
    return this.secrets.get(userId) ?? null;
  }

  async findEnabled(userId: string): Promise<MfaSecretRecord | null> {
    const row = this.secrets.get(userId);
    if (row === undefined || row.enabledAt === null) {
      return null;
    }
    return row;
  }

  async disable(userId: string): Promise<void> {
    this.secrets.delete(userId);
    for (const [hash, code] of this.codes) {
      if (code.userId === userId) {
        this.codes.delete(hash);
      }
    }
  }

  async replaceRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void> {
    for (const [hash, code] of this.codes) {
      if (code.userId === userId) {
        this.codes.delete(hash);
      }
    }
    for (const hash of codeHashes) {
      this.codes.set(hash, { userId, usedAt: null });
    }
  }

  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const code = this.codes.get(codeHash);
    // O código de outra conta **não** é marcado como usado: quem o apresenta
    // não o pode gastar.
    if (code === undefined || code.userId !== userId || code.usedAt !== null) {
      return false;
    }
    this.codes.set(codeHash, { userId, usedAt: new Date() });
    return true;
  }

  async countRecoveryCodes(userId: string): Promise<number> {
    let count = 0;
    for (const code of this.codes.values()) {
      if (code.userId === userId && code.usedAt === null) {
        count += 1;
      }
    }
    return count;
  }
}
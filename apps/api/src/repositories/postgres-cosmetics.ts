import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { userCosmeticEquipped, userCosmetics } from '../db/cosmetics-schema.js';
import type {
  CosmeticRecord,
  CosmeticRepository,
  EquippedRecord,
} from './types.js';

/**
 * Cosméticos em PostgreSQL.
 *
 * O que a memória não dá conta: o `onConflictDoNothing` torna a compra
 * idempotente sem leitura antes (dois pedidos em paralelo dão uma linha), e
 * equipar é um `upsert` pela chave utilizador/tipo — trocar o selo substitui
 * o anterior sem deixar o utilizador com dois ao mesmo tempo.
 */
export class PostgresCosmeticRepository implements CosmeticRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async listOwned(userId: string): Promise<readonly CosmeticRecord[]> {
    const rows = await this.db
      .select()
      .from(userCosmetics)
      .where(eq(userCosmetics.userId, userId))
      .orderBy(desc(userCosmetics.acquiredAt));
    return rows.map((row) => ({
      userId: row.userId,
      cosmeticId: row.cosmeticId,
      acquiredAt: row.acquiredAt ?? new Date(),
    }));
  }

  async own(userId: string, cosmeticId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .insert(userCosmetics)
      .values({ userId, cosmeticId, acquiredAt: now })
      .onConflictDoNothing()
      .returning({ cosmeticId: userCosmetics.cosmeticId });
    return rows.length > 0;
  }

  async equipped(userId: string): Promise<readonly EquippedRecord[]> {
    const rows = await this.db
      .select()
      .from(userCosmeticEquipped)
      .where(eq(userCosmeticEquipped.userId, userId));
    return rows.map((row) => ({
      userId: row.userId,
      kind: row.kind,
      cosmeticId: row.cosmeticId,
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  async equip(userId: string, kind: string, cosmeticId: string, now: Date): Promise<void> {
    await this.db
      .insert(userCosmeticEquipped)
      .values({ userId, kind, cosmeticId, updatedAt: now })
      .onConflictDoUpdate({
        target: [userCosmeticEquipped.userId, userCosmeticEquipped.kind],
        set: { cosmeticId, updatedAt: now },
      });
  }

  async unequip(userId: string, kind: string): Promise<boolean> {
    // O `where` é pelo par inteiro: sem o `kind`, desequipar um selo
    // apagaria todos os tipos do utilizador.
    const rows = await this.db
      .delete(userCosmeticEquipped)
      .where(and(eq(userCosmeticEquipped.userId, userId), eq(userCosmeticEquipped.kind, kind)))
      .returning({ kind: userCosmeticEquipped.kind });
    return rows.length > 0;
  }
}
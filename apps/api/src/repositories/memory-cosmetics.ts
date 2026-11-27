import type {
  CosmeticRecord,
  CosmeticRepository,
  EquippedRecord,
} from './types.js';

/**
 * Cosméticos em memória — as mesmas regras do PostgreSQL.
 *
 * A compra é uma linha pelo par utilizador/cosmético (comprar duas vezes o
 * mesmo devolve `false`), e o que está equipado é uma linha por tipo:
 * equipar substitui, e desequipar apaga — nunca dois selos ao mesmo tempo.
 */
export class MemoryCosmeticRepository implements CosmeticRepository {
  private readonly owned = new Map<string, Date>();
  private readonly equippedByKey = new Map<string, { cosmeticId: string; updatedAt: Date }>();

  async listOwned(userId: string): Promise<readonly CosmeticRecord[]> {
    return [...this.owned.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([key, acquiredAt]) => ({
        userId,
        cosmeticId: key.slice(userId.length + 1),
        acquiredAt,
      }))
      .sort((left, right) => right.acquiredAt.getTime() - left.acquiredAt.getTime());
  }

  async own(userId: string, cosmeticId: string, now: Date): Promise<boolean> {
    const key = `${userId}:${cosmeticId}`;
    if (this.owned.has(key)) {
      return false;
    }
    this.owned.set(key, now);
    return true;
  }

  async equipped(userId: string): Promise<readonly EquippedRecord[]> {
    return [...this.equippedByKey.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([key, value]) => ({
        userId,
        kind: key.slice(userId.length + 1),
        cosmeticId: value.cosmeticId,
        updatedAt: value.updatedAt,
      }));
  }

  async equip(userId: string, kind: string, cosmeticId: string, now: Date): Promise<void> {
    this.equippedByKey.set(`${userId}:${kind}`, { cosmeticId, updatedAt: now });
  }

  async unequip(userId: string, kind: string): Promise<boolean> {
    return this.equippedByKey.delete(`${userId}:${kind}`);
  }
}
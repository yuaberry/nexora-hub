import type { WishlistRecord, WishlistRepository } from './types.js';

/**
 * Lista de desejos em memória.
 *
 * O par utilizador/jogo é a identidade: adicionar duas vezes não duplica, e
 * remover o que não existe devolve `false` — a rota traduz em `404`.
 */
export class MemoryWishlistRepository implements WishlistRepository {
  private readonly rows = new Map<string, WishlistRecord>();

  async add(userId: string, gameId: string, id: string): Promise<WishlistRecord> {
    const existing = [...this.rows.values()].find(
      (row) => row.userId === userId && row.gameId === gameId,
    );
    if (existing !== undefined) {
      return existing;
    }
    const record: WishlistRecord = { id, userId, gameId, createdAt: new Date() };
    this.rows.set(`${userId}:${gameId}`, record);
    return record;
  }

  async remove(userId: string, gameId: string): Promise<boolean> {
    return this.rows.delete(`${userId}:${gameId}`);
  }

  async listByUser(userId: string): Promise<readonly WishlistRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }
}
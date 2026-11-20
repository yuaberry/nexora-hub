import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { wishlists } from '../db/wishlist-schema.js';
import { randomUUID } from 'node:crypto';
import type { WishlistRecord, WishlistRepository } from './types.js';

/**
 * Lista de desejos em PostgreSQL.
 *
 * O par (utilizador, jogo) é a chave primária: `onConflictDoNothing` torna a
 * adição idempotente sem precisar de uma leitura antes, e a remoção devolve
 * as linhas apagadas — zero linhas significa "não estava lá".
 */
export class PostgresWishlistRepository implements WishlistRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async add(userId: string, gameId: string, id: string): Promise<WishlistRecord> {
    const rows = await this.db
      .insert(wishlists)
      .values({ userId, gameId })
      .onConflictDoNothing()
      .returning();

    const row = rows[0];
    if (row === undefined) {
      // Já existia: devolve o registo existente (a adição é idempotente).
      const existing = await this.db
        .select()
        .from(wishlists)
        .where(and(eq(wishlists.userId, userId), eq(wishlists.gameId, gameId)))
        .limit(1);
      const found = existing[0];
      if (found === undefined) {
        throw new Error('Falha ao adicionar à lista de desejos.');
      }
      return {
        id: `${userId}:${gameId}`,
        userId: found.userId,
        gameId: found.gameId,
        createdAt: found.createdAt ?? new Date(),
      };
    }

    return {
      id,
      userId: row.userId,
      gameId: row.gameId,
      createdAt: row.createdAt ?? new Date(),
    };
  }

  async remove(userId: string, gameId: string): Promise<boolean> {
    const rows = await this.db
      .delete(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.gameId, gameId)))
      .returning({ userId: wishlists.userId });
    return rows.length > 0;
  }

  async listByUser(userId: string): Promise<readonly WishlistRecord[]> {
    const rows = await this.db
      .select()
      .from(wishlists)
      .where(eq(wishlists.userId, userId))
      .orderBy(desc(wishlists.createdAt));
    return rows.map((row) => ({
      id: `${userId}:${row.gameId}`,
      userId: row.userId,
      gameId: row.gameId,
      createdAt: row.createdAt ?? new Date(),
    }));
  }
}

/** Identificador de um item (reexportado para os testes). */
export { randomUUID };
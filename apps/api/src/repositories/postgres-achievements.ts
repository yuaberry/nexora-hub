import { desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pointEntries, userAchievements } from '../db/achievements-schema.js';
import type {
  AchievementRepository,
  PointEntryRecord,
} from './types.js';

/**
 * Conquistas e pontos em PostgreSQL.
 *
 * O que a memória não dá conta: o `onConflictDoNothing` torna o desbloqueio
 * idempotente sem leitura antes (dois pedidos em paralelo dão uma linha), e a
 * contagem global de uma conquista é um `count(*)` agrupado — o número de
 * jogadores que a têm, não uma estimativa.
 */
export class PostgresAchievementRepository implements AchievementRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async listUnlocked(userId: string): Promise<readonly { achievementId: string; unlockedAt: Date }[]> {
    const rows = await this.db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .orderBy(desc(userAchievements.unlockedAt));
    return rows.map((row) => ({
      achievementId: row.achievementId,
      unlockedAt: row.unlockedAt ?? new Date(),
    }));
  }

  async unlock(userId: string, achievementId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .insert(userAchievements)
      .values({ userId, achievementId, unlockedAt: now })
      .onConflictDoNothing()
      .returning({ achievementId: userAchievements.achievementId });
    return rows.length > 0;
  }

  async countUnlockedByAchievement(achievementId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(userAchievements)
      .where(eq(userAchievements.achievementId, achievementId));
    return rows[0]?.total ?? 0;
  }

  async addPoints(input: { userId: string; delta: number; reason: string; entityId: string | null }): Promise<PointEntryRecord> {
    const rows = await this.db
      .insert(pointEntries)
      .values({
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        entityId: input.entityId,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Falha a gravar os pontos.');
    }
    return {
      id: row.id,
      userId: row.userId,
      delta: row.delta,
      reason: row.reason,
      entityId: row.entityId,
      createdAt: row.createdAt ?? new Date(),
    };
  }

  async listPoints(userId: string, limit: number): Promise<readonly PointEntryRecord[]> {
    const rows = await this.db
      .select()
      .from(pointEntries)
      .where(eq(pointEntries.userId, userId))
      .orderBy(desc(pointEntries.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      delta: row.delta,
      reason: row.reason,
      entityId: row.entityId,
      createdAt: row.createdAt ?? new Date(),
    }));
  }

  async balance(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`coalesce(sum(${pointEntries.delta}), 0)::int` })
      .from(pointEntries)
      .where(eq(pointEntries.userId, userId));
    return rows[0]?.total ?? 0;
  }
}


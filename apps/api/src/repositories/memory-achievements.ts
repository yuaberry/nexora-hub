import { randomUUID } from 'node:crypto';
import type {
  AchievementRepository,
  PointEntryRecord,
} from './types.js';

/**
 * Conquistas e pontos em memória.
 *
 * As mesmas regras do PostgreSQL: uma conquista desbloqueada é uma linha
 * (chave pelo par), e o saldo é a **soma** das entradas do livro — nunca um
 * campo guardado que possa divergir do que aconteceu.
 */
export class MemoryAchievementRepository implements AchievementRepository {
  private readonly unlocked = new Map<string, Date>();
  private readonly entries: PointEntryRecord[] = [];

  async listUnlocked(userId: string): Promise<readonly { achievementId: string; unlockedAt: Date }[]> {
    return [...this.unlocked.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([key, unlockedAt]) => ({
        achievementId: key.slice(userId.length + 1),
        unlockedAt,
      }))
      .sort((left, right) => right.unlockedAt.getTime() - left.unlockedAt.getTime());
  }

  async unlock(userId: string, achievementId: string, now: Date): Promise<boolean> {
    const key = `${userId}:${achievementId}`;
    if (this.unlocked.has(key)) {
      // Desbloquear duas vezes não repete os pontos: o livro é só de acréscimos.
      return false;
    }
    this.unlocked.set(key, now);
    return true;
  }

  async countUnlockedByAchievement(achievementId: string): Promise<number> {
    return [...this.unlocked.keys()].filter((key) => key.endsWith(`:${achievementId}`)).length;
  }

  async addPoints(input: { userId: string; delta: number; reason: string; entityId: string | null }): Promise<PointEntryRecord> {
    const record: PointEntryRecord = {
      id: randomUUID(),
      userId: input.userId,
      delta: input.delta,
      reason: input.reason,
      entityId: input.entityId,
      createdAt: new Date(),
    };
    this.entries.push(record);
    return record;
  }

  async listPoints(userId: string, limit: number): Promise<readonly PointEntryRecord[]> {
    return this.entries
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async balance(userId: string): Promise<number> {
    return this.entries
      .filter((entry) => entry.userId === userId)
      .reduce((total, entry) => total + entry.delta, 0);
  }
}
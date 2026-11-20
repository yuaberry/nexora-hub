import { randomUUID } from 'node:crypto';
import type {
  LibraryEntryRecord,
  LibraryRepository,
  PlaySessionRecord,
  PlaySessionRepository,
  UpsertLibraryEntryInput,
} from './types.js';

/**
 * Repositório da biblioteca em memória.
 *
 * `externalKey` é a identidade estável da entrada local: sincronizar a mesma
 * pasta duas vezes actualiza a entrada em vez de a duplicar.
 */
export class MemoryLibraryRepository implements LibraryRepository {
  private readonly rows = new Map<string, LibraryEntryRecord>();

  async upsertEntry(input: UpsertLibraryEntryInput): Promise<LibraryEntryRecord> {
    const existing = [...this.rows.values()].find(
      (row) => row.userId === input.userId && row.externalKey === input.externalKey,
    );
    const now = new Date();

    if (existing === undefined) {
      const record: LibraryEntryRecord = {
        id: randomUUID(),
        userId: input.userId,
        externalKey: input.externalKey,
        title: input.title,
        cover: input.cover ?? null,
        provider: input.provider ?? 'local',
        installPath: input.installPath ?? null,
        executablePath: input.executablePath ?? null,
        tags: [...(input.tags ?? [])],
        adult: input.adult ?? false,
        favorite: false,
        collections: [],
        lastPlayedAt: null,
        totalSeconds: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.rows.set(record.id, record);
      return record;
    }

    const updated: LibraryEntryRecord = {
      ...existing,
      title: input.title,
      cover: input.cover ?? existing.cover,
      provider: input.provider ?? existing.provider,
      installPath: input.installPath ?? existing.installPath,
      executablePath: input.executablePath ?? existing.executablePath,
      tags: input.tags === undefined ? existing.tags : [...input.tags],
      adult: input.adult ?? existing.adult,
      updatedAt: now,
    };
    this.rows.set(updated.id, updated);
    return updated;
  }

  async list(userId: string, query: { limit: number; offset: number }): Promise<{
    items: readonly LibraryEntryRecord[];
    total: number;
  }> {
    const rows = [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => left.title.localeCompare(right.title));
    return { items: rows.slice(query.offset, query.offset + query.limit), total: rows.length };
  }

  async findById(userId: string, id: string): Promise<LibraryEntryRecord | null> {
    const row = this.rows.get(id);
    if (row === undefined || row.userId !== userId) {
      return null;
    }
    return row;
  }

  async findByExternalKey(userId: string, externalKey: string): Promise<LibraryEntryRecord | null> {
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.externalKey === externalKey) {
        return row;
      }
    }
    return null;
  }

  async setFavorite(userId: string, id: string, favorite: boolean): Promise<LibraryEntryRecord | null> {
    const row = await this.findById(userId, id);
    if (row === null) {
      return null;
    }
    const updated: LibraryEntryRecord = { ...row, favorite, updatedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }

  async addCollection(userId: string, id: string, collection: string): Promise<LibraryEntryRecord | null> {
    const row = await this.findById(userId, id);
    if (row === null) {
      return null;
    }
    if (row.collections.includes(collection)) {
      return row;
    }
    const updated: LibraryEntryRecord = {
      ...row,
      collections: [...row.collections, collection],
      updatedAt: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const row = await this.findById(userId, id);
    if (row === null) {
      return false;
    }
    this.rows.delete(id);
    return true;
  }

  async addPlayedSeconds(userId: string, gameId: string, seconds: number, playedAt: Date): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.externalKey === gameId) {
        this.rows.set(row.id, {
          ...row,
          totalSeconds: row.totalSeconds + seconds,
          lastPlayedAt: playedAt,
          updatedAt: playedAt,
        });
        return;
      }
    }
  }

  async totalsByGame(userId: string): Promise<ReadonlyMap<string, number>> {
    const totals = new Map<string, number>();
    for (const row of this.rows.values()) {
      if (row.userId === userId) {
        totals.set(row.externalKey, (totals.get(row.externalKey) ?? 0) + row.totalSeconds);
      }
    }
    return totals;
  }

  async listByUser(userId: string): Promise<readonly LibraryEntryRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => left.title.localeCompare(right.title));
  }
}

/** Repositório de sessões de jogo em memória. */
export class MemoryPlaySessionRepository implements PlaySessionRepository {
  private readonly rows = new Map<string, PlaySessionRecord>();

  async start(userId: string, gameId: string): Promise<PlaySessionRecord> {
    const record: PlaySessionRecord = {
      id: randomUUID(),
      userId,
      gameId,
      state: 'running',
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: 0,
      exitCode: null,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findById(userId: string, id: string): Promise<PlaySessionRecord | null> {
    const row = this.rows.get(id);
    if (row === undefined || row.userId !== userId) {
      return null;
    }
    return row;
  }

  async list(userId: string, query: { limit: number; offset: number }): Promise<{
    items: readonly PlaySessionRecord[];
    total: number;
  }> {
    const rows = [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
    return { items: rows.slice(query.offset, query.offset + query.limit), total: rows.length };
  }

  async end(
    userId: string,
    id: string,
    input: { endedAt: Date; exitCode: number | null },
  ): Promise<PlaySessionRecord | null> {
    const row = this.rows.get(id);
    if (row === undefined || row.userId !== userId || row.state === 'ended') {
      return null;
    }
    const durationSeconds = Math.max(
      0,
      Math.round((input.endedAt.getTime() - row.startedAt.getTime()) / 1000),
    );
    const updated: PlaySessionRecord = {
      ...row,
      state: 'ended',
      endedAt: input.endedAt,
      durationSeconds,
      exitCode: input.exitCode,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async listAllByUser(userId: string): Promise<readonly PlaySessionRecord[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }

  async listEndedByUser(userId: string, limit: number): Promise<readonly PlaySessionRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId && row.state === 'ended')
      .sort((left, right) => (right.endedAt ?? right.startedAt).getTime() - (left.endedAt ?? left.startedAt).getTime())
      .slice(0, limit);
  }

  async totalPlayedSeconds(userId: string, gameId: string): Promise<number> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId && row.gameId === gameId && row.state === 'ended')
      .reduce((total, row) => total + (row.durationSeconds ?? 0), 0);
  }
}
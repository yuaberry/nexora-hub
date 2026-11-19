import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { secondsBetween } from '../lib/time.js';
import * as schema from '../db/schema.js';
import type {
  LibraryEntryRecord,
  LibraryRepository,
  PlaySessionRecord,
  PlaySessionRepository,
  UpsertLibraryEntryInput,
} from './types.js';

/**
 * Biblioteca e sessões de jogo em PostgreSQL.
 *
 * **Recurso de outro utilizador devolve `404`, nunca `403`**: todas as
 * consultas filtram pelo dono, e uma linha que não é do utilizador é
 * indistinguível de uma linha que não existe — não confirma existência.
 */

type Db = NodePgDatabase<typeof schema>;

export class PostgresLibraryRepository implements LibraryRepository {
  constructor(private readonly db: Db) {}

  async upsertEntry(input: UpsertLibraryEntryInput): Promise<LibraryEntryRecord> {
    const rows = await this.db
      .insert(schema.libraryEntries)
      .values({
        userId: input.userId,
        externalKey: input.externalKey,
        title: input.title,
        cover: input.cover ?? null,
        provider: input.provider ?? 'local',
        installPath: input.installPath ?? null,
        executablePath: input.executablePath ?? null,
        tags: [...(input.tags ?? [])],
        adult: input.adult ?? false,
      })
      .onConflictDoUpdate({
        target: [schema.libraryEntries.userId, schema.libraryEntries.externalKey],
        set: {
          title: input.title,
          cover: input.cover ?? null,
          installPath: input.installPath ?? null,
          executablePath: input.executablePath ?? null,
          tags: [...(input.tags ?? [])],
          adult: input.adult ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em library_entries.');
    }
    return row;
  }

  async list(userId: string, query: { limit: number; offset: number }) {
    const rows = await this.db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, userId))
      .orderBy(schema.libraryEntries.title)
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, userId));
    return { items: rows, total: totalRows[0]?.total ?? 0 };
  }

  async findById(userId: string, id: string): Promise<LibraryEntryRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.libraryEntries)
      .where(and(eq(schema.libraryEntries.id, id), eq(schema.libraryEntries.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByExternalKey(userId: string, externalKey: string): Promise<LibraryEntryRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.libraryEntries)
      .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.externalKey, externalKey)))
      .limit(1);
    return rows[0] ?? null;
  }

  async setFavorite(userId: string, id: string, favorite: boolean): Promise<LibraryEntryRecord | null> {
    const rows = await this.db
      .update(schema.libraryEntries)
      .set({ favorite, updatedAt: new Date() })
      .where(and(eq(schema.libraryEntries.id, id), eq(schema.libraryEntries.userId, userId)))
      .returning();
    return rows[0] ?? null;
  }

  async addCollection(userId: string, id: string, collection: string): Promise<LibraryEntryRecord | null> {
    const rows = await this.db
      .update(schema.libraryEntries)
      .set({
        collections: sql`array_append(${schema.libraryEntries.collections}, ${collection})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.libraryEntries.id, id),
          eq(schema.libraryEntries.userId, userId),
          sql`not (${collection} = any(${schema.libraryEntries.collections}))`,
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.libraryEntries)
      .where(and(eq(schema.libraryEntries.id, id), eq(schema.libraryEntries.userId, userId)))
      .returning({ id: schema.libraryEntries.id });
    return rows.length > 0;
  }

  async addPlayedSeconds(userId: string, gameId: string, seconds: number, playedAt: Date): Promise<void> {
    await this.db
      .update(schema.libraryEntries)
      .set({
        totalSeconds: sql`${schema.libraryEntries.totalSeconds} + ${seconds}`,
        lastPlayedAt: playedAt,
        updatedAt: playedAt,
      })
      .where(
        and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.externalKey, gameId)),
      );
  }

  async totalsByGame(userId: string): Promise<ReadonlyMap<string, number>> {
    const rows = await this.db
      .select({
        externalKey: schema.libraryEntries.externalKey,
        total: sql<number>`coalesce(sum(${schema.libraryEntries.totalSeconds}), 0)::int`,
      })
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, userId))
      .groupBy(schema.libraryEntries.externalKey);
    return new Map(rows.map((row) => [row.externalKey, row.total]));
  }
}

/** Sessões de jogo em PostgreSQL. */
export class PostgresPlaySessionRepository implements PlaySessionRepository {
  constructor(private readonly db: Db) {}

  async start(userId: string, gameId: string): Promise<PlaySessionRecord> {
    const rows = await this.db
      .insert(schema.gameSessions)
      .values({ userId, gameId, state: 'running' })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT sem retorno em game_sessions.');
    }
    return row;
  }

  async findById(userId: string, id: string): Promise<PlaySessionRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.gameSessions)
      .where(and(eq(schema.gameSessions.id, id), eq(schema.gameSessions.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(userId: string, query: { limit: number; offset: number }) {
    const rows = await this.db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.userId, userId))
      .orderBy(sql`${schema.gameSessions.startedAt} desc`)
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.userId, userId));
    return { items: rows, total: totalRows[0]?.total ?? 0 };
  }

  async end(
    userId: string,
    id: string,
    input: { endedAt: Date; exitCode: number | null },
  ): Promise<PlaySessionRecord | null> {
    const current = await this.findById(userId, id);
    if (current === null || current.state === 'ended') {
      return null;
    }
    const durationSeconds = secondsBetween(current.startedAt, input.endedAt);
    const rows = await this.db
      .update(schema.gameSessions)
      .set({ state: 'ended', endedAt: input.endedAt, durationSeconds, exitCode: input.exitCode })
      .where(and(eq(schema.gameSessions.id, id), eq(schema.gameSessions.userId, userId)))
      .returning();
    return rows[0] ?? null;
  }

  async totalPlayedSeconds(userId: string, gameId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`coalesce(sum(${schema.gameSessions.durationSeconds}), 0)::int` })
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.userId, userId),
          eq(schema.gameSessions.gameId, gameId),
          eq(schema.gameSessions.state, 'ended'),
        ),
      );
    return rows[0]?.total ?? 0;
  }
}
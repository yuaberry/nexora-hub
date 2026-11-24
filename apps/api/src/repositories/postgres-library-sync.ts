import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { SyncedEntryInput, SyncedEntryRecord, SyncedLibraryRepository } from './types.js';

/**
 * Biblioteca sincronizada em PostgreSQL.
 *
 * **Uma entrada por utilizador e jogo**: sincronizar substitui pela chave
 * externa (`onConflictDoUpdate`), e enviar a mesma biblioteca duas vezes não
 * duplica nada. As contagens do relatório são honestas — quantas entraram e
 * quantas foram actualizadas.
 */

const { syncedLibrary } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Converte uma linha do banco no registo do domínio. */
function toRecord(row: typeof syncedLibrary.$inferSelect): SyncedEntryRecord {
  return {
    id: row.id,
    userId: row.userId,
    externalKey: row.externalKey,
    title: row.title,
    steamAppId: row.steamAppId,
    coverUrl: row.coverUrl,
    installed: row.installed,
    favorite: row.favorite,
    totalSeconds: row.totalSeconds,
    updatedAt: row.updatedAt,
  };
}

/** Biblioteca sincronizada em PostgreSQL. */
export class PostgresLibrarySyncRepository implements SyncedLibraryRepository {
  constructor(private readonly db: Db) {}

  async sync(userId: string, entries: readonly SyncedEntryInput[]): Promise<{ updated: number; added: number }> {
    // Quais já existem: uma consulta antes do ciclo (as contagens do relatório
    // são honestas — quantas entraram e quantas foram actualizadas).
    const before = await this.db
      .select({ externalKey: syncedLibrary.externalKey })
      .from(syncedLibrary)
      .where(eq(syncedLibrary.userId, userId));
    const known = new Set(before.map((row) => row.externalKey));
    let added = 0;
    let updated = 0;
    for (const entry of entries) {
      if (known.has(entry.externalKey)) {
        updated += 1;
      } else {
        added += 1;
      }
      await this.db
        .insert(syncedLibrary)
        .values({
          userId,
          externalKey: entry.externalKey,
          title: entry.title,
          steamAppId: entry.steamAppId ?? null,
          coverUrl: entry.coverUrl ?? null,
          installed: entry.installed ?? false,
          favorite: entry.favorite ?? false,
          totalSeconds: entry.totalSeconds ?? 0,
        })
        .onConflictDoUpdate({
          target: [syncedLibrary.userId, syncedLibrary.externalKey],
          set: {
            title: entry.title,
            steamAppId: entry.steamAppId ?? null,
            coverUrl: entry.coverUrl ?? null,
            installed: entry.installed ?? false,
            favorite: entry.favorite ?? false,
            totalSeconds: entry.totalSeconds ?? 0,
            updatedAt: new Date(),
          },
        });
    }
    return { updated, added };
  }

  async list(userId: string): Promise<readonly SyncedEntryRecord[]> {
    const rows = await this.db
      .select()
      .from(syncedLibrary)
      .where(eq(syncedLibrary.userId, userId))
      .orderBy(asc(syncedLibrary.title));
    return rows.map(toRecord);
  }
}
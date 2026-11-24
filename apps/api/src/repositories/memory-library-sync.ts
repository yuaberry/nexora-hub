import { randomUUID } from 'node:crypto';
import type { SyncedEntryInput, SyncedEntryRecord, SyncedLibraryRepository } from './types.js';

/**
 * Biblioteca sincronizada em memória — o que a conta guarda do utilizador.
 *
 * Sincronizar substitui pela chave externa: enviar a mesma biblioteca duas
 * vezes não duplica nada. As contagens do relatório são honestas — quantas
 * entraram e quantas foram actualizadas.
 */
export class MemoryLibrarySyncRepository implements SyncedLibraryRepository {
  private readonly rows = new Map<string, SyncedEntryRecord>();

  async sync(userId: string, entries: readonly SyncedEntryInput[]): Promise<{ updated: number; added: number }> {
    let updated = 0;
    let added = 0;
    for (const entry of entries) {
      const key = entryKey(userId, entry.externalKey);
      const previous = this.rows.get(key);
      if (previous === undefined) {
        added += 1;
      } else {
        updated += 1;
      }
      this.rows.set(key, {
        id: previous?.id ?? randomUUID(),
        userId,
        externalKey: entry.externalKey,
        title: entry.title,
        steamAppId: entry.steamAppId ?? null,
        coverUrl: entry.coverUrl ?? null,
        installed: entry.installed ?? false,
        favorite: entry.favorite ?? false,
        totalSeconds: entry.totalSeconds ?? 0,
        updatedAt: new Date(),
      });
    }
    return { updated, added };
  }

  async list(userId: string): Promise<readonly SyncedEntryRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => left.title.localeCompare(right.title));
  }
}

/** Chave composta da entrada. */
function entryKey(userId: string, externalKey: string): string {
  return `${userId}::${externalKey}`;
}

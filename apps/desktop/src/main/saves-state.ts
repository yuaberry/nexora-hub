/**
 * Estado de saves — snapshots versionados no computador do utilizador.
 *
 * Um save é o progresso de quem joga: não se pode perder. O motor
 * (`@nexora/cloud`) guarda **versões** de uma pasta de saves, e o índice
 * fica na base local — um snapshot sobrevive ao encerramento do launcher.
 *
 * A nuvem (Nexora Cloud) continua `planned` e a interface diz-o: o que
 * existe hoje é criar, listar e restaurar snapshots **locais**.
 */

import { join } from 'node:path';
import { SnapshotStore, type SaveSnapshotRecord } from '@nexora/cloud';
import type { LocalLibrary } from './db.js';

/** Cria o estado de saves (motor + índice persistido). */
export function createSavesState(library: LocalLibrary, snapshotsRoot: string): SavesState {
  const store = new SnapshotStore(snapshotsRoot);
  const records: SaveSnapshotRecord[] = library
    .allSnapshots()
    .map((row) => ({
      id: row.id,
      gameId: row.gameKey,
      label: row.label,
      createdAt: row.createdAt,
      path: row.path,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      revision: row.revision,
    }));

  // O motor começa com o índice reconstruído da base local: a revisão
  // continua de onde parou, e os snapshots antigos continuam restauráveis.
  store.loadFrom(records);

  // Uma função de leitura partilhada por `list` e `remove`: o escopo é o
  // jogo, e as duas operações têm de olhar para o mesmo conjunto.
  const listOf = (gameKey: string): readonly SaveSnapshotRecord[] =>
    library.listSnapshots(gameKey).map((row) => ({
      id: row.id,
      gameId: row.gameKey,
      label: row.label,
      createdAt: row.createdAt,
      path: row.path,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      revision: row.revision,
    }));

  return {
    store,
    /** Cria um snapshot da pasta de saves de um jogo. */
    async create(gameKey: string, label: string, savePath: string) {
      const result = await store.create(gameKey, label, savePath);
      if (!result.ok) {
        return { ok: false as const, reason: result.reason };
      }
      library.addSnapshot({
        id: result.record.id,
        gameKey,
        label: result.record.label,
        createdAt: result.record.createdAt,
        path: result.record.path,
        sizeBytes: result.record.sizeBytes,
        checksum: result.record.checksum,
        revision: result.record.revision,
      });
      return { ok: true as const, record: result.record };
    },
    list(gameKey: string): readonly SaveSnapshotRecord[] {
      return listOf(gameKey);
    },
    restore(id: string, savePath: string) {
      return store.restore(id, savePath);
    },
    remove(gameKey: string, id: string) {
      // O escopo é o jogo: um snapshot de outro jogo não é removível por aqui.
      const owned = listOf(gameKey).some((record) => record.id === id);
      if (!owned) {
        return false;
      }
      const removed = store.remove(id);
      if (removed) {
        library.removeSnapshot(id);
      }
      return removed;
    },
  };
}

/** Estado de saves partilhado pelo IPC. */
export interface SavesState {
  readonly store: SnapshotStore;
  readonly create: (gameKey: string, label: string, savePath: string) => Promise<
    { readonly ok: true; readonly record: SaveSnapshotRecord } | { readonly ok: false; readonly reason: string }
  >;
  readonly list: (gameKey: string) => readonly SaveSnapshotRecord[];
  readonly restore: (id: string, savePath: string) => { readonly ok: boolean; readonly reason?: string };
  readonly remove: (gameKey: string, id: string) => boolean;
}

/** Pasta dos snapshots dentro do userData. */
export function snapshotsRootFor(userDataPath: string): string {
  return join(userDataPath, 'save-snapshots');
}
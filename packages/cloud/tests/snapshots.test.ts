import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideSync, nextRevision, snapshotsFor } from '../src/snapshots.js';
import { SnapshotStore, checksumOfFolder, folderSize } from '../src/snapshot-store.js';
import type { SaveSnapshotRecord, SnapshotMeta } from '../src/snapshots.js';

/**
 * Snapshots de saves.
 *
 * O que estes testes travam: um snapshot é uma cópia **fiel** (restaurar
 * devolve exactamente o que existia), a revisão nunca se repete, e a decisão
 * de sincronização diz `diverged` quando os dois lados escreveram a partir da
 * mesma base — o caso em que escolher em silêncio perderia progresso.
 */

/** Pasta de saves de prova. */
function saveFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexora-save-'));
  mkdirSync(join(dir, 'nivel1'), { recursive: true });
  writeFileSync(join(dir, 'save.dat'), Buffer.from('progresso do jogador', 'binary'));
  writeFileSync(join(dir, 'nivel1', 'estado.bin'), Buffer.from('nivel um', 'binary'));
  return dir;
}

/** Metadados mínimos. */
function meta(revision: number, checksum: string): SnapshotMeta {
  return { gameId: 'jogo', revision, checksum, source: 'local' };
}

/** Registo mínimo (para as funções puras). */
function record(gameId: string, revision: number, createdAt: string, checksum = 'x'): SaveSnapshotRecord {
  return { id: `${gameId}-${revision}`, gameId, label: 'auto', createdAt, path: '/snap', sizeBytes: 10, checksum, revision };
}

describe('decideSync', () => {
  it('mesma revisão e mesmo checksum está em sincronia', () => {
    expect(decideSync(meta(2, 'aaa'), meta(2, 'aaa'))).toBe('in-sync');
  });

  it('mesma revisão com checksums diferentes é divergência', () => {
    expect(decideSync(meta(2, 'aaa'), meta(2, 'bbb'))).toBe('diverged');
  });

  it('revisão local mais alta está à frente', () => {
    expect(decideSync(meta(3, 'bbb'), meta(2, 'aaa'))).toBe('local-ahead');
  });

  it('revisão remota mais alta está à frente', () => {
    expect(decideSync(meta(2, 'aaa'), meta(5, 'ccc'))).toBe('remote-ahead');
  });
});

describe('nextRevision', () => {
  it('começa em 1', () => {
    expect(nextRevision([], 'jogo')).toBe(1);
  });

  it('nunca reutiliza uma revisão', () => {
    const records = [record('jogo', 1, '2026-01-01T00:00:00.000Z'), record('jogo', 3, '2026-01-02T00:00:00.000Z')];
    expect(nextRevision(records, 'jogo')).toBe(4);
  });

  it('conta por jogo', () => {
    const records = [record('outro', 9, '2026-01-01T00:00:00.000Z')];
    expect(nextRevision(records, 'jogo')).toBe(1);
  });
});

describe('snapshotsFor', () => {
  it('devolve só os do jogo, do mais recente para o mais antigo', () => {
    const records = [
      record('jogo', 1, '2026-01-01T00:00:00.000Z'),
      record('outro', 1, '2026-01-01T00:00:00.000Z'),
      record('jogo', 2, '2026-01-03T00:00:00.000Z'),
    ];
    const list = snapshotsFor(records, 'jogo');
    expect(list).toHaveLength(2);
    expect(list[0]?.revision).toBe(2);
  });
});

describe('SnapshotStore', () => {
  it('cria um snapshot e devolve o registo', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'nexora-snap-')));
    const source = saveFolder();
    try {
      const result = await store.create('jogo', 'antes do boss', source);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.record.revision).toBe(1);
      expect(result.record.sizeBytes).toBeGreaterThan(0);
      expect(store.list('jogo')).toHaveLength(1);
    } finally {
      rmSync(source, { force: true, recursive: true });
    }
  });

  it('restaurar devolve exactamente o conteúdo guardado', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'nexora-snap-')));
    const source = saveFolder();
    const restoreTarget = mkdtempSync(join(tmpdir(), 'nexora-rest-'));
    try {
      const created = await store.create('jogo', 'estado A', source);
      if (!created.ok) {
        throw new Error('criação falhou');
      }
      // O utilizador joga mais e o save muda.
      writeFileSync(join(source, 'save.dat'), Buffer.from('progresso DEPOIS do boss', 'binary'));

      expect(store.restore(created.record.id, restoreTarget).ok).toBe(true);
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(join(restoreTarget, 'save.dat'), 'binary')).toBe('progresso do jogador');
      expect(readFileSync(join(restoreTarget, 'nivel1', 'estado.bin'), 'binary')).toBe('nivel um');
    } finally {
      rmSync(source, { force: true, recursive: true });
      rmSync(restoreTarget, { force: true, recursive: true });
    }
  });

  it('recusa uma pasta que não existe', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'nexora-snap-')));
    const result = await store.create('jogo', 'auto', '/pasta/que/nao/existe');
    expect(result.ok).toBe(false);
  });

  it('apaga um snapshot e a sua cópia', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'nexora-snap-')));
    const source = saveFolder();
    try {
      const created = await store.create('jogo', 'auto', source);
      if (!created.ok) {
        throw new Error('criação falhou');
      }
      expect(store.remove(created.record.id)).toBe(true);
      expect(store.list('jogo')).toHaveLength(0);
    } finally {
      rmSync(source, { force: true, recursive: true });
    }
  });
});

describe('checksumOfFolder / folderSize', () => {
  it('o mesmo conteúdo dá o mesmo checksum', async () => {
    const first = saveFolder();
    const second = saveFolder();
    try {
      expect(await checksumOfFolder(first)).toBe(await checksumOfFolder(second));
      expect(folderSize(first)).toBe(folderSize(second));
    } finally {
      rmSync(first, { force: true, recursive: true });
      rmSync(second, { force: true, recursive: true });
    }
  });

  it('conteúdo alterado muda o checksum', async () => {
    const folder = saveFolder();
    try {
      const before = await checksumOfFolder(folder);
      writeFileSync(join(folder, 'save.dat'), Buffer.from('progresso alterado', 'binary'));
      expect(await checksumOfFolder(folder)).not.toBe(before);
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });
});

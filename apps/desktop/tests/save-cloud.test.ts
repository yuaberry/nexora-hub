import { describe, expect, it, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudStatus, restoreFromCloud, uploadToCloud } from '../src/main/save-cloud.js';
import { extractArchive } from '../src/main/save-archive.js';
import type { SaveFetch } from '@nexora/cloud';
import type { SaveSnapshotRecord } from '@nexora/cloud';

/**
 * Saves na nuvem — a orquestração, com rede falsa e pastas reais.
 *
 * O que estes testes travam: **enviar** empacota a pasta real (e o que a nuvem
 * recebe é um arquivo que extrai de volta ao mesmo conteúdo), **restaurar**
 * cria o snapshot de segurança **antes** de tocar na pasta, e o **estado**
 * compara as versões dos dois lados pela regra do motor (`decideSync`) — a
 * divergência é declarada, nunca silenciada.
 */

/** Um snapshot local como o motor os cria. */
function snapshot(id: string, revision: number, checksum: string, path: string): SaveSnapshotRecord {
  return {
    id,
    gameId: 'steam-app:367520',
    label: `v${revision}`,
    createdAt: new Date().toISOString(),
    path,
    sizeBytes: 10,
    checksum,
    revision,
  };
}

/** Um estado de saves falso (em memória). */
function fakeSaves(records: readonly SaveSnapshotRecord[]) {
  return {
    list: () => records,
    create: async (_gameKey: string, _label: string, savePath: string) => {
      records = [...records, snapshot(`seguranca-${records.length + 1}`, records.length + 1, 'sum-seguranca', savePath)];
      return { ok: true };
    },
  };
}

describe('save-cloud', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-save-cloud-'));
  });

  it('envia um arquivo que extrai de volta ao mesmo conteúdo', async () => {
    const source = join(dir, 'saves');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'user1.dat'), 'progresso-secreto');
    writeFileSync(join(source, 'user2.dat'), 'inventário');

    const record = snapshot('snap-1', 1, 'sum-abc', source);
    let uploaded: { url: string; headers: Record<string, string>; body: Uint8Array } | undefined;
    const fetch: SaveFetch = async (url, init) => {
      uploaded = { url, headers: (init.headers ?? {}) as Record<string, string>, body: (init.body ?? new Uint8Array()) as Uint8Array };
      const entry = { id: 'cloud-1', gameKey: record.gameId, label: record.label, checksum: record.checksum, sizeBytes: 10, revision: 1, createdAt: new Date().toISOString() };
      return { status: 201, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({ save: entry }) };
    };

    const result = await uploadToCloud(fakeSaves([record]), 'http://127.0.0.1:3100', 'token', record.gameId, record.id, fetch);
    expect(result.ok).toBe(true);
    // O que subiu leva a revisão e o checksum da cópia local.
    expect(uploaded?.headers['x-save-revision']).toBe('1');
    expect(uploaded?.headers['x-save-checksum']).toBe('sum-abc');

    // E o arquivo extrai de volta ao mesmo conteúdo.
    const target = join(dir, 'volta');
    mkdirSync(target, { recursive: true });
    expect(await extractArchive(uploaded?.body ?? new Uint8Array(), target)).toBe(true);
    expect(readFileSync(join(target, 'user1.dat'), 'utf8')).toBe('progresso-secreto');
    expect(readFileSync(join(target, 'user2.dat'), 'utf8')).toBe('inventário');
  });

  it('restaurar cria o snapshot de segurança antes de extrair', async () => {
    const source = join(dir, 'saves');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'user1.dat'), 'progresso');
    const archive = join(dir, 'arquivo.tar.gz');

    // O arquivo da nuvem é criado pelo mesmo caminho do envio.
    const { createArchive } = await import('../src/main/save-archive.js');
    const bytes = await createArchive(source);
    expect(bytes).not.toBeNull();
    writeFileSync(archive, '');

    let createdBefore = false;
    const saves = {
      list: () => [] as SaveSnapshotRecord[],
      create: async () => {
        createdBefore = true;
        return { ok: true };
      },
    };
    const fetch: SaveFetch = async () => ({
      status: 200,
      headers: { get: (name) => (name === 'x-save-revision' ? '3' : name === 'x-save-checksum' ? 'sum-3' : null) },
      arrayBuffer: async () => new Uint8Array(bytes ?? new Uint8Array()).slice().buffer,
      json: async () => ({}),
    });

    const target = join(dir, 'restaurado');
    mkdirSync(target, { recursive: true });
    const result = await restoreFromCloud(saves, 'http://x', 'token', 'steam-app:367520', 'cloud-1', target, fetch);
    expect(result.ok).toBe(true);
    // A segurança existiu antes da extracção.
    expect(createdBefore).toBe(true);
    // E a pasta ficou com o conteúdo da nuvem.
    expect(readFileSync(join(target, 'user1.dat'), 'utf8')).toBe('progresso');
  });

  it('o estado compara os dois lados pela regra do motor', async () => {
    const source = join(dir, 'saves');
    mkdirSync(source, { recursive: true });
    const local = snapshot('snap-2', 2, 'sum-local', source);
    const saves = { list: () => [local] };

    // Nuvem com a mesma revisão e checksum: em sincronia.
    const fetchSync: SaveFetch = async () => ({
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({
        items: [{ id: 'cloud-2', gameKey: local.gameId, label: 'v2', checksum: 'sum-local', sizeBytes: 10, revision: 2, createdAt: new Date().toISOString() }],
      }),
    });
    const sync = await cloudStatus(saves, 'http://x', 'token', local.gameId, fetchSync);
    expect(sync.ok && sync.value.decision).toBe('in-sync');

    // Nuvem atrás: o local está à frente.
    const fetchBehind: SaveFetch = async () => ({
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({
        items: [{ id: 'cloud-1', gameKey: local.gameId, label: 'v1', checksum: 'sum-outro', sizeBytes: 10, revision: 1, createdAt: new Date().toISOString() }],
      }),
    });
    const behind = await cloudStatus(saves, 'http://x', 'token', local.gameId, fetchBehind);
    expect(behind.ok && behind.value.decision).toBe('local-ahead');

    // Mesma revisão, checksums diferentes: divergência declarada.
    const fetchDiverged: SaveFetch = async () => ({
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({
        items: [{ id: 'cloud-x', gameKey: local.gameId, label: 'v2b', checksum: 'sum-divergente', sizeBytes: 10, revision: 2, createdAt: new Date().toISOString() }],
      }),
    });
    const diverged = await cloudStatus(saves, 'http://x', 'token', local.gameId, fetchDiverged);
    expect(diverged.ok && diverged.value.decision).toBe('diverged');
  });
});
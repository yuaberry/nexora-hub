/**
 * Motor de snapshots em disco.
 *
 * Cria uma cópia de uma pasta de saves, registra os metadados e devolve o
 * registo. A cópia é **recursiva** e o checksum é o agregado dos ficheiros:
 * dois snapshots com o mesmo conteúdo têm o mesmo checksum, e é isso que a
 * decisão de sincronização usa.
 *
 * Nada aqui sabe da nuvem: criar, listar, apagar e restaurar são operações
 * locais. A costura da nuvem entra pelo contrato (`CloudSavesClient`), não
 * por este ficheiro.
 */

import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  nextRevision,
  type SaveSnapshotRecord,
} from './snapshots.js';

/** Cria o motor de snapshots. */
export function createSnapshotStore(snapshotsRoot: string): SnapshotStore {
  return new SnapshotStore(snapshotsRoot);
}

/** Motor de snapshots de uma pasta de saves. */
export class SnapshotStore {
  /** Índice em memória dos snapshots registados. */
  private readonly records: SaveSnapshotRecord[] = [];

  constructor(private readonly snapshotsRoot: string) {
    mkdirSync(snapshotsRoot, { recursive: true });
  }

  /**
   * Cria um snapshot de uma pasta de saves.
   *
   * A pasta de origem é copiada para `<root>/<jogo>/<id>`; o registo fica com
   * a revisão seguinte do jogo. Uma pasta que não existe não cria snapshot —
   * devolve o motivo, em vez de registar uma cópia vazia.
   */
  async create(gameId: string, label: string, sourcePath: string): Promise<
    { readonly ok: true; readonly record: SaveSnapshotRecord } | { readonly ok: false; readonly reason: string }
  > {
    if (!folderExists(sourcePath)) {
      return { ok: false, reason: `Pasta de saves não encontrada: ${sourcePath}` };
    }

    const id = randomUUID();
    const target = join(this.snapshotsRoot, safeSegment(gameId), id);
    mkdirSync(join(this.snapshotsRoot, safeSegment(gameId)), { recursive: true });

    cpSync(sourcePath, target, { recursive: true });
    const checksum = await checksumOfFolder(target);
    const sizeBytes = folderSize(target);

    const record: SaveSnapshotRecord = {
      id,
      gameId,
      label,
      createdAt: new Date().toISOString(),
      path: target,
      sizeBytes,
      checksum,
      revision: nextRevision(this.records, gameId),
    };
    this.records.push(record);
    return { ok: true, record };
  }

  /** Lista os snapshots de um jogo (do mais recente para o mais antigo). */
  list(gameId: string): readonly SaveSnapshotRecord[] {
    return this.records
      .filter((record) => record.gameId === gameId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /**
   * Carrega um índice persistido.
   *
   * O motor começa vazio; quem persistiu o índice (a base local do launcher)
   * devolve-o no arranque. Sem isto, as revisões recomeçavam em 1 e os
   * snapshots antantes ficavam órfãos no disco.
   */
  loadFrom(records: readonly SaveSnapshotRecord[]): void {
    this.records.length = 0;
    this.records.push(...records);
  }

  /**
   * Restaura um snapshot para a pasta de saves.
   *
   * A restauração **substitui** o conteúdo da pasta de destino: é o que
   * "restaurar" significa. Quem quer guardar o estado actual cria um snapshot
   * antes — e a interface oferece-o.
   */
  restore(id: string, destinationPath: string): { readonly ok: boolean; readonly reason?: string } {
    const record = this.records.find((entry) => entry.id === id);
    if (record === undefined) {
      return { ok: false, reason: 'Snapshot não encontrado.' };
    }
    mkdirSync(destinationPath, { recursive: true });
    rmSync(destinationPath, { recursive: true, force: true });
    cpSync(record.path, destinationPath, { recursive: true });
    return { ok: true };
  }

  /** Apaga um snapshot (e a sua cópia no disco). */
  remove(id: string): boolean {
    const index = this.records.findIndex((record) => record.id === id);
    if (index === -1) {
      return false;
    }
    const record = this.records[index]!;
    rmSync(record.path, { recursive: true, force: true });
    this.records.splice(index, 1);
    return true;
  }
}

/**
 * Limite de conteúdo lido por ficheiro, no checksum agregado.
 *
 * Acima disto, a comparação passa a caminho + tamanho — declarado, não
 * silencioso: um save de 200 MB não pode ser lido inteiro a cada sessão, e
 * fingir que o checksum é de conteúdo seria mentir.
 */
export const MAX_CONTENT_BYTES_PER_FILE = 8 * 1024 * 1024;

/** Checksum agregado de uma pasta (ordem estável dos caminhos). */
export async function checksumOfFolder(root: string): Promise<string> {
  const hash = createHash('sha256');
  const files = (await listFiles(root)).slice().sort();
  for (const file of files) {
    hash.update(file.slice(root.length));
    hash.update('\u0000', 'binary');
    const size = sizeOf(file);
    hash.update(String(size));
    hash.update('\u0000', 'binary');
    if (size <= MAX_CONTENT_BYTES_PER_FILE) {
      const { createReadStream } = await import('node:fs');
      await new Promise<void>((resolve) => {
        const stream = createReadStream(file);
        stream.on('data', (chunk: Buffer | string) => {
          hash.update(chunk);
        });
        stream.on('error', () => resolve());
        stream.on('end', () => resolve());
      });
    }
    hash.update('\u0001', 'binary');
  }
  return hash.digest('hex');
}

/** Lista os ficheiros de uma árvore (recursivo). */
async function listFiles(root: string): Promise<readonly string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile()) {
        found.push(full);
      }
    }
  };
  await walk(root);
  return found;
}

/** Tamanho de um ficheiro (0 se não existir). */
function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Soma dos bytes de uma pasta (iterativa, sem recursão profunda). */
export function folderSize(root: string): number {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        total += statSync(full).size;
      }
    } catch {
      continue;
    }
  }
  return total;
}

/** `true` quando uma pasta existe. */
function folderExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Segmento seguro para nome de pasta (o id do jogo pode ter barras). */
function safeSegment(gameId: string): string {
  return gameId.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64) || 'jogo';
}
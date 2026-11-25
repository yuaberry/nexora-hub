import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScreenshotRecord, ScreenshotRepository } from './types.js';

/**
 * Capturas em memória — o índice na memória, o ficheiro no disco.
 *
 * O PNG é opaco para a base: guarda-se no disco de dados e a base guarda o
 * índice (quem, que jogo, que nome, que tamanho). Apagar filtra pelo dono —
 * uma captura alheia é indistinguível de uma inexistente.
 */
export class MemoryScreenshotRepository implements ScreenshotRepository {
  private readonly rows = new Map<string, ScreenshotRecord>();

  constructor(private readonly root: string) {}

  async create(input: { userId: string; gameKey: string; fileName: string; bytes: Buffer }): Promise<ScreenshotRecord> {
    const record: ScreenshotRecord = {
      id: randomUUID(),
      userId: input.userId,
      gameKey: input.gameKey,
      fileName: input.fileName,
      sizeBytes: input.bytes.byteLength,
      createdAt: new Date(),
    };
    try {
      const userDir = join(this.root, input.userId);
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, `${record.id}.png`), input.bytes);
      this.rows.set(record.id, record);
    } catch {
      return record;
    }
    return record;
  }

  async list(userId: string, gameKey?: string): Promise<readonly ScreenshotRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId && (gameKey === undefined || row.gameKey === gameKey))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async find(userId: string, id: string): Promise<ScreenshotRecord | null> {
    return this.rows.get(id)?.userId === userId ? this.rows.get(id) ?? null : null;
  }

  read(userId: string, id: string): Buffer | null {
    const record = this.rows.get(id);
    if (record === undefined || record.userId !== userId) {
      return null;
    }
    const path = join(this.root, userId, `${id}.png`);
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const record = this.rows.get(id);
    if (record === undefined || record.userId !== userId) {
      return false;
    }
    this.rows.delete(id);
    try {
      rmSync(join(this.root, userId, `${id}.png`), { force: true });
    } catch {
      // ficheiro já era: o índice sai na mesma
    }
    return true;
  }
}

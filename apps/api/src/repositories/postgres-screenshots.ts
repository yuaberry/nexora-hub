import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { ScreenshotRecord, ScreenshotRepository } from './types.js';

/**
 * Capturas em PostgreSQL.
 *
 * O PNG vive no disco de dados; a base guarda o índice. Apagar e procurar
 * filtram sempre pelo dono — uma captura alheia é indistinguível de uma
 * inexistente (404, nunca 403).
 */

const { screenshots } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Converte uma linha do banco no registo do domínio. */
function toRecord(row: typeof screenshots.$inferSelect): ScreenshotRecord {
  return {
    id: row.id,
    userId: row.userId,
    gameKey: row.gameKey,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

/** Capturas em PostgreSQL. */
export class PostgresScreenshotRepository implements ScreenshotRepository {
  constructor(
    private readonly db: Db,
    private readonly root: string,
  ) {}

  async create(input: { userId: string; gameKey: string; fileName: string; bytes: Buffer }): Promise<ScreenshotRecord> {
    const rows = await this.db
      .insert(screenshots)
      .values({
        userId: input.userId,
        gameKey: input.gameKey,
        fileName: input.fileName,
        sizeBytes: input.bytes.byteLength,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('A captura não foi devolvida pelo banco.');
    }
    try {
      const userDir = join(this.root, input.userId);
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, `${row.id}.png`), input.bytes);
    } catch {
      // disco cheio ou sem permissão: o índice fica, o ficheiro não
    }
    return toRecord(row);
  }

  async list(userId: string, gameKey?: string): Promise<readonly ScreenshotRecord[]> {
    const rows = await this.db
      .select()
      .from(screenshots)
      .where(
        gameKey === undefined
          ? eq(screenshots.userId, userId)
          : and(eq(screenshots.userId, userId), eq(screenshots.gameKey, gameKey)),
      )
      .orderBy(desc(screenshots.createdAt));
    return rows.map(toRecord);
  }

  async find(userId: string, id: string): Promise<ScreenshotRecord | null> {
    const rows = await this.db
      .select()
      .from(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toRecord(row);
  }

  read(userId: string, id: string): Buffer | null {
    const path = join(this.root, userId, `${id}.png`);
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))
      .returning({ id: screenshots.id });
    if (rows.length === 0) {
      return false;
    }
    rmSync(join(this.root, userId, `${id}.png`), { force: true });
    return true;
  }
}

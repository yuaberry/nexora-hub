import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Base de dados local do launcher (SQLite embutido no Node).
 *
 * Os **ficheiros** dos jogos e os seus metadados ficam no computador do
 * utilizador: o NEXORA HUB não sincroniza nem hospeda conteúdo. O que sai da
 * máquina é apenas o que o utilizador autoriza (o token da conta e os
 * metadados da biblioteca, para a web os poder ler).
 *
 * `node:sqlite` é o SQLite que vem com o Node — sem dependência nativa a
 * compilar, e sem serviço externo.
 */

/** Uma entrada da biblioteca local. */
export interface LocalGameRecord {
  readonly id: number;
  readonly externalKey: string;
  readonly title: string;
  readonly cover: string | null;
  readonly installPath: string;
  readonly executablePath: string;
  readonly tags: readonly string[];
  readonly adult: boolean;
  readonly favorite: boolean;
  readonly lastPlayedAt: string | null;
  readonly totalSeconds: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertLocalGameInput {
  readonly externalKey: string;
  readonly title: string;
  readonly cover?: string | null;
  readonly installPath: string;
  readonly executablePath: string;
  readonly tags?: readonly string[];
  readonly adult?: boolean;
}

/** Biblioteca local persistida em SQLite. */
export class LocalLibrary {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      create table if not exists games (
        id integer primary key autoincrement,
        external_key text not null unique,
        title text not null,
        cover text,
        install_path text not null,
        executable_path text not null,
        tags text not null default '[]',
        adult integer not null default 0,
        favorite integer not null default 0,
        last_played_at text,
        total_seconds integer not null default 0,
        created_at text not null,
        updated_at text not null
      );
    `);
  }

  /** Cria ou actualiza uma entrada (sincronizar duas vezes não duplica). */
  upsert(input: UpsertLocalGameInput): LocalGameRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into games (external_key, title, cover, install_path, executable_path, tags, adult, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(external_key) do update set
           title = excluded.title,
           cover = excluded.cover,
           install_path = excluded.install_path,
           executable_path = excluded.executable_path,
           tags = excluded.tags,
           adult = excluded.adult,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.externalKey,
        input.title,
        input.cover ?? null,
        input.installPath,
        input.executablePath,
        JSON.stringify(input.tags ?? []),
        input.adult === true ? 1 : 0,
        now,
        now,
      );

    const row = this.byExternalKey(input.externalKey);
    if (row === null) {
      throw new Error('Falha ao gravar a entrada local.');
    }
    return row;
  }

  /** Lista a biblioteca local (ordenada por título). */
  list(): readonly LocalGameRecord[] {
    return this.db
      .prepare('select * from games order by title collate nocase')
      .all()
      .map((row) => toRecord(row as Record<string, unknown>));
  }

  findById(id: number): LocalGameRecord | null {
    const row = this.db.prepare('select * from games where id = ?').get(id);
    return row === undefined ? null : toRecord(row as Record<string, unknown>);
  }

  byExternalKey(externalKey: string): LocalGameRecord | null {
    const row = this.db.prepare('select * from games where external_key = ?').get(externalKey);
    return row === undefined ? null : toRecord(row as Record<string, unknown>);
  }

  setFavorite(id: number, favorite: boolean): LocalGameRecord | null {
    const row = this.findById(id);
    if (row === null) {
      return null;
    }
    this.db
      .prepare('update games set favorite = ?, updated_at = ? where id = ?')
      .run(favorite ? 1 : 0, new Date().toISOString(), id);
    return this.findById(id);
  }

  remove(id: number): boolean {
    const result = this.db.prepare('delete from games where id = ?').run(id);
    return Number(result.changes) > 0;
  }

  /** Soma o tempo jogado ao total da entrada. */
  addPlayedSeconds(externalKey: string, seconds: number, playedAt: string): LocalGameRecord | null {
    this.db
      .prepare(
        `update games set total_seconds = total_seconds + ?, last_played_at = ?, updated_at = ? where external_key = ?`,
      )
      .run(seconds, playedAt, playedAt, externalKey);
    return this.byExternalKey(externalKey);
  }

  close(): void {
    this.db.close();
  }
}

/** Converte uma linha do SQLite no registo do domínio. */
function toRecord(row: Record<string, unknown>): LocalGameRecord {
  return {
    id: Number(row['id']),
    externalKey: String(row['external_key']),
    title: String(row['title']),
    cover: typeof row['cover'] === 'string' ? row['cover'] : null,
    installPath: String(row['install_path']),
    executablePath: String(row['executable_path']),
    tags: parseTags(row['tags']),
    adult: Number(row['adult']) === 1,
    favorite: Number(row['favorite']) === 1,
    lastPlayedAt: typeof row['last_played_at'] === 'string' ? row['last_played_at'] : null,
    totalSeconds: Number(row['total_seconds'] ?? 0),
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

function parseTags(value: unknown): readonly string[] {
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}
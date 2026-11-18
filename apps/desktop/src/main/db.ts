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

      create table if not exists save_snapshots (
        id text primary key,
        game_key text not null,
        label text not null,
        created_at text not null,
        path text not null,
        size_bytes integer not null default 0,
        checksum text not null,
        revision integer not null
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

  // ---- Snapshots de saves ---------------------------------------------

  /** Regista um snapshot (o índice persistido; a cópia vive no disco). */
  addSnapshot(record: {
    readonly id: string;
    readonly gameKey: string;
    readonly label: string;
    readonly createdAt: string;
    readonly path: string;
    readonly sizeBytes: number;
    readonly checksum: string;
    readonly revision: number;
  }): void {
    this.db
      .prepare(
        `insert into save_snapshots (id, game_key, label, created_at, path, size_bytes, checksum, revision)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.gameKey,
        record.label,
        record.createdAt,
        record.path,
        record.sizeBytes,
        record.checksum,
        record.revision,
      );
  }

  /** Lista os snapshots de um jogo (do mais recente para o mais antigo). */
  listSnapshots(gameKey: string): readonly SaveSnapshotRow[] {
    return this.db
      .prepare('select * from save_snapshots where game_key = ? order by created_at desc')
      .all(gameKey)
      .map((row) => toSnapshotRow(row as Record<string, unknown>));
  }

  /** Todos os snapshots (para reconstruir o índice no arranque). */
  allSnapshots(): readonly SaveSnapshotRow[] {
    return this.db
      .prepare('select * from save_snapshots order by created_at desc')
      .all()
      .map((row) => toSnapshotRow(row as Record<string, unknown>));
  }

  /** Remove um snapshot do índice. */
  removeSnapshot(id: string): boolean {
    return Number(this.db.prepare('delete from save_snapshots where id = ?').run(id).changes) > 0;
  }
}

/** Uma linha de snapshot da base local. */
export interface SaveSnapshotRow {
  readonly id: string;
  readonly gameKey: string;
  readonly label: string;
  readonly createdAt: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly revision: number;
}

/** Converte uma linha do SQLite no registo de snapshot. */
function toSnapshotRow(row: Record<string, unknown>): SaveSnapshotRow {
  return {
    id: String(row['id']),
    gameKey: String(row['game_key']),
    label: String(row['label']),
    createdAt: String(row['created_at']),
    path: String(row['path']),
    sizeBytes: Number(row['size_bytes'] ?? 0),
    checksum: String(row['checksum']),
    revision: Number(row['revision']),
  };
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
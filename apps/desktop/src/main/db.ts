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
  /** `true` quando a capa foi escolhida pelo utilizador (nunca auto-substituída). */
  readonly coverChosen: boolean;
  /** Descrição curta da loja, em texto simples (guardada para funcionar offline). */
  readonly description: string | null;
  /** `null` quando a entrada veio do catálogo (o jogo não está instalado). */
  readonly installPath: string | null;
  /** `null` quando não há executável conhecido (entrada de catálogo). */
  readonly executablePath: string | null;
  /** Appid da Steam, quando o jogo veio de um manifesto da loja. */
  readonly steamAppId: string | null;
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
  /** Omitido ou `null` numa entrada de catálogo: o jogo não está no disco. */
  readonly installPath?: string | null;
  readonly executablePath?: string | null;
  /** Appid da Steam (manifesto da loja); mantém-se quando não é dado. */
  readonly steamAppId?: string | null;
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
        cover_chosen integer not null default 0,
        description text,
        install_path text,
        executable_path text,
        steam_app_id text,
        tags text not null default '[]',
        adult integer not null default 0,
        favorite integer not null default 0,
        last_played_at text,
        total_seconds integer not null default 0,
        created_at text not null,
        updated_at text not null
      );
    `);

    // Migração idempotente: bases criadas antes do appid ganham a coluna sem
    // perder o que já lá está (o tempo jogado e os favoritos). Nas bases
    // novas a coluna já vem do `create table` acima, e o ALTER falha com
    // "coluna duplicada" — um erro esperado, por isso silenciado.
    try {
      this.db.exec('alter table games add column steam_app_id text;');
    } catch {
      // a coluna já existe — nada a fazer
    }
    try {
      this.db.exec('alter table games add column cover_chosen integer not null default 0;');
    } catch {
      // a coluna já existe — nada a fazer
    }
    try {
      this.db.exec('alter table games add column description text;');
    } catch {
      // a coluna já existe — nada a fazer
    }

    // Migração dos caminhos: as entradas de catálogo (um jogo que o
    // utilizador encontrou pela loja mas que não está instalado) não têm
    // pasta nem executável — as colunas passam a aceitar `NULL`. O SQLite
    // não retira `NOT NULL` a uma coluna: a tabela é recrianda com os dados
    // copiados, e o pragma garante que só acontece uma vez.
    this.migrateNullablePaths();

    this.db.exec(`
      create table if not exists collections (
        id integer primary key autoincrement,
        name text not null unique,
        created_at text not null
      );

      create table if not exists collection_games (
        collection_id integer not null,
        game_key text not null,
        primary key (collection_id, game_key)
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

      create table if not exists game_dlcs (
        game_key text not null,
        app_id text not null,
        title text not null,
        kind text not null,
        free integer not null default 0,
        installed integer not null default 0,
        updated_at text not null,
        primary key (game_key, app_id)
      );
    `);
  }

  /**
   * Recria a tabela dos jogos com os caminhos opcionais (migração única).
   *
   * O pragma `table_info` diz se `install_path` ainda exige valor: se sim, a
   * tabela é copiada para uma nova (com os mesmos dados) e trocada no lugar.
   * Um caminho que já era `NULL` nunca é inventado — só passa a ser aceite.
   */
  private migrateNullablePaths(): void {
    const columns = this.db.prepare('pragma table_info(games)').all() as Record<string, unknown>[];
    const installPath = columns.find((column) => column['name'] === 'install_path');
    if (installPath === undefined || installPath['notnull'] !== 1) {
      return;
    }
    this.db.exec(`
      create table games_migrated (
        id integer primary key autoincrement,
        external_key text not null unique,
        title text not null,
        cover text,
        cover_chosen integer not null default 0,
        description text,
        install_path text,
        executable_path text,
        steam_app_id text,
        tags text not null default '[]',
        adult integer not null default 0,
        favorite integer not null default 0,
        last_played_at text,
        total_seconds integer not null default 0,
        created_at text not null,
        updated_at text not null
      );
      insert into games_migrated (id, external_key, title, cover, cover_chosen, description, install_path, executable_path, steam_app_id, tags, adult, favorite, last_played_at, total_seconds, created_at, updated_at)
        select id, external_key, title, cover, cover_chosen, null as description, install_path, executable_path, steam_app_id, tags, adult, favorite, last_played_at, total_seconds, created_at, updated_at from games;
      drop table games;
      alter table games_migrated rename to games;
    `);
  }

  /** Cria ou actualiza uma entrada (sincronizar duas vezes não duplica). */
  upsert(input: UpsertLocalGameInput): LocalGameRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        // No conflito, **tudo** se actualiza — inclusive o executável: um jogo
        // re-detectado com um executável melhor (a heurística mudou) tem de
        // actualizar a entrada, não ficar com a antiga para sempre. O que é do
        // utilizador (favorito, tempo jogado) mantém-se. Excepção: um caminho
        // novo que vem vazio **nunca** apaga um caminho real — uma entrada de
        // catálogo encontrada depois da importação não pode deixar o jogo
        // instalado sem pasta.
        `insert into games (external_key, title, cover, install_path, executable_path, steam_app_id, tags, adult, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(external_key) do update set
           title = excluded.title,
           cover = case when games.cover_chosen = 1 then games.cover else excluded.cover end,
           install_path = coalesce(excluded.install_path, games.install_path),
           executable_path = coalesce(excluded.executable_path, games.executable_path),
           steam_app_id = coalesce(excluded.steam_app_id, games.steam_app_id),
           tags = excluded.tags,
           adult = excluded.adult,
           favorite = favorite,
           last_played_at = last_played_at,
           total_seconds = total_seconds,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.externalKey,
        input.title,
        input.cover ?? null,
        input.installPath ?? null,
        input.executablePath ?? null,
        input.steamAppId ?? null,
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

  /**
   * Procura uma entrada pelo appid da Steam.
   *
   * É o que impede a duplicação: um jogo encontrado pelo catálogo quando já
   * estava na biblioteca (importado do disco) actualiza a entrada que existe,
   * em vez de criar uma segunda.
   */
  bySteamAppId(appId: string): LocalGameRecord | null {
    const row = this.db.prepare('select * from games where steam_app_id = ?').get(appId);
    return row === undefined ? null : toRecord(row as Record<string, unknown>);
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

  /**
   * Define a capa de um jogo — a personalização do utilizador.
   *
   * `null` volta à capa automática (a da Steam, se existir; o placeholder do
   * tema se não existir). A sincronização com a Steam **nunca** mexe numa
   * capa que o utilizador escolheu: a escolha dele vale mais que a nossa.
   */
  setCover(id: number, cover: string | null, chosen: boolean): LocalGameRecord | null {
    const row = this.findById(id);
    if (row === null) {
      return null;
    }
    this.db
      .prepare('update games set cover = ?, cover_chosen = ?, updated_at = ? where id = ?')
      .run(cover, chosen ? 1 : 0, new Date().toISOString(), id);
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


  // ---- Colecções ------------------------------------------------------

  /** Cria uma colecção (o nome e unico). */
  createCollection(name: string): { readonly id: number; readonly name: string; readonly count: number } {
    const trimmed = name.trim();
    this.db.prepare('insert into collections (name, created_at) values (?, ?)').run(trimmed, new Date().toISOString());
    const row = this.db.prepare('select id, name from collections where name = ?').get(trimmed) as Record<string, unknown>;
    return { id: Number(row['id']), name: String(row['name']), count: 0 };
  }

  /** Lista as colecções com a contagem de jogos. */
  listCollections(): readonly { readonly id: number; readonly name: string; readonly count: number }[] {
    return (
      this.db
        .prepare(
          `select c.id, c.name, count(cg.game_key) as count
           from collections c
           left join collection_games cg on cg.collection_id = c.id
           group by c.id
           order by c.name collate nocase`,
        )
        .all() as Record<string, unknown>[]
    ).map((row) => ({ id: Number(row['id']), name: String(row['name']), count: Number(row['count']) }));
  }

  /** Junta um jogo a uma colecção (idempotente). */
  addToCollection(collectionId: number, gameKey: string): boolean {
    // So jogos que existem na biblioteca entram numa colecção.
    if (this.byGameKey(gameKey) === null) {
      return false;
    }
    this.db
      .prepare('insert or ignore into collection_games (collection_id, game_key) values (?, ?)')
      .run(collectionId, gameKey);
    return true;
  }

  /** Remove um jogo de uma colecção. */
  removeFromCollection(collectionId: number, gameKey: string): boolean {
    return (
      Number(
        this.db
          .prepare('delete from collection_games where collection_id = ? and game_key = ?')
          .run(collectionId, gameKey).changes,
      ) > 0
    );
  }

  /** Apaga uma colecção e as suas associacoes. */
  deleteCollection(collectionId: number): boolean {
    this.db.prepare('delete from collection_games where collection_id = ?').run(collectionId);
    return Number(this.db.prepare('delete from collections where id = ?').run(collectionId).changes) > 0;
  }

  /** Chaves dos jogos de uma colecção. */
  collectionGames(collectionId: number): readonly string[] {
    return (
      this.db
        .prepare('select game_key from collection_games where collection_id = ? order by game_key')
        .all(collectionId) as Record<string, unknown>[]
    ).map((row) => String(row['game_key']));
  }

  /** Registo de um jogo pela chave externa. */
  byGameKey(gameKey: string): LocalGameRecord | null {
    const row = this.db.prepare('select * from games where lower(external_key) = lower(?)').get(gameKey);
    return row === undefined ? null : toRecord(row as Record<string, unknown>);
  }

  /**
   * Guarda a descrição curta de um jogo (vista da loja, para uso offline).
   *
   * `null` não apaga o que lá está: uma resposta vazia da loja não deve
   * limpar uma descrição que já foi buscada com sucesso.
   */
  setDescription(id: number, description: string | null): LocalGameRecord | null {
    if (this.findById(id) === null || description === null) {
      return this.findById(id);
    }
    this.db
      .prepare('update games set description = ?, updated_at = ? where id = ?')
      .run(description, new Date().toISOString(), id);
    return this.findById(id);
  }

  // ---- DLCs declaradas pela loja ----------------------------------------

  /**
   * Substitui as DLCs conhecidas de um jogo.
   *
   * A lista vem da loja (pública) e a marca de instalada vem do disco: o
   * que fica guardado é o cruzamento dos dois — um jogo sem DLCs fica com
   * lista vazia, e a chamada seguinte não repete o que já sabe.
   */
  setDlcs(gameKey: string, dlcs: readonly DlcRow[]): void {
    const now = new Date().toISOString();
    this.db.prepare('delete from game_dlcs where game_key = ?').run(gameKey);
    const insert = this.db.prepare(
      `insert or replace into game_dlcs (game_key, app_id, title, kind, free, installed, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const dlc of dlcs) {
      insert.run(gameKey, dlc.appId, dlc.title, dlc.kind, dlc.free ? 1 : 0, dlc.installed ? 1 : 0, now);
    }
  }

  /** Lista as DLCs de um jogo (por título). */
  listDlcs(gameKey: string): readonly DlcRow[] {
    return (
      this.db
        .prepare('select * from game_dlcs where game_key = ? order by title collate nocase')
        .all(gameKey) as Record<string, unknown>[]
    ).map((row) => ({
      appId: String(row['app_id']),
      title: String(row['title']),
      kind: String(row['kind']),
      free: Number(row['free']) === 1,
      installed: Number(row['installed']) === 1,
    }));
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

/** Uma DLC conhecida de um jogo (nome da loja + se está no disco). */
export interface DlcRow {
  readonly appId: string;
  readonly title: string;
  readonly kind: string;
  readonly free: boolean;
  /** `true` quando a pasta do appid existe numa biblioteca da Steam. */
  readonly installed: boolean;
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
  const steamAppId = row['steam_app_id'];
  return {
    id: Number(row['id']),
    externalKey: String(row['external_key']),
    title: String(row['title']),
    cover: typeof row['cover'] === 'string' ? row['cover'] : null,
    coverChosen: Number(row['cover_chosen'] ?? 0) === 1,
    description: typeof row['description'] === 'string' ? row['description'] : null,
    installPath: typeof row['install_path'] === 'string' ? row['install_path'] : null,
    executablePath: typeof row['executable_path'] === 'string' ? row['executable_path'] : null,
    steamAppId: typeof steamAppId === 'string' && steamAppId !== '' ? steamAppId : null,
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
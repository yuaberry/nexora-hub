import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/**
 * Arquivo de saves na nuvem — o progresso de quem joga, guardado no servidor.
 *
 * Um save é pequeno (kilobytes a alguns megabytes) e precioso: uma pasta de
 * saves corrompida ou um disco que morreu levam horas de jogo. Este arquivo
 * guarda uma **cópia** por versão, indexada por utilizador e por jogo.
 *
 * O arquivo é em disco (um ficheiro comprimido por versão + um índice JSON
 * por utilizador), e não em PostgreSQL, por uma razão declarada: o conteúdo é
 * binário e opaco para a base de dados — guardá-lo como `bytea` encheria a
 * base sem ajudar nenhuma pergunta. O índice, esse, é pequeno e legível.
 *
 * Nada aqui sabe de rede nem de contas: cria, lista, lê e apaga. A rota faz a
 * autorização (o save de outro utilizador devolve 404, nunca 403).
 */

/** O maior save aceite: 512 MB. Acima disso, a recusa é explícita (413). */
export const MAX_SAVE_BYTES = 512 * 1024 * 1024;

/** Um save guardado (o que o índice conhece). */
export interface SaveEntry {
  readonly id: string;
  readonly userId: string;
  /** Chave do jogo (o caminho normalizado, ou `steam-app:<id>`). */
  readonly gameKey: string;
  readonly label: string;
  /** Checksum do conteúdo (o agregado da pasta de saves). */
  readonly checksum: string;
  readonly sizeBytes: number;
  /** Revisão monotónica por jogo (1, 2, 3…). */
  readonly revision: number;
  /** ISO-8601 UTC da criação. */
  readonly createdAt: string;
}

/** O que a criação devolve (ou o motivo da recusa). */
export type SaveCreation =
  | { readonly ok: true; readonly entry: SaveEntry }
  | { readonly ok: false; readonly reason: 'too-large' | 'bad-key' | 'bad-revision' | 'write-failed' };

/** Arquivo de saves num directório. */
export class SaveStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  /**
   * Guarda uma versão nova.
   *
   * A revisão é `max(existentes do jogo) + 1` — nunca reutilizada, para que a
   * decisão de conflito (no cliente) seja estável. Um jogo com chave válida é
   * obrigatório: sem chave não há a quem responder.
   */
  create(input: {
    readonly userId: string;
    readonly gameKey: string;
    readonly label: string;
    readonly checksum: string;
    readonly bytes: Buffer;
    /**
     * Revisão declarada pelo cliente — a história da cópia local viaja com o
     * save, para que a decisão de conflito (no cliente) compare revisões dos
     * dois lados. Quando não vem, o servador atribui `max + 1`.
     */
    readonly revision?: number;
  }): SaveCreation {
    if (input.bytes.byteLength > MAX_SAVE_BYTES) {
      return { ok: false, reason: 'too-large' };
    }
    const gameKey = safeSegment(input.gameKey);
    if (gameKey === null) {
      return { ok: false, reason: 'bad-key' };
    }
    if (input.revision !== undefined && (!Number.isInteger(input.revision) || input.revision < 1)) {
      return { ok: false, reason: 'bad-revision' };
    }
    const id = randomUUID();
    const revision = input.revision ?? this.nextRevision(input.userId, gameKey);
    const entry: SaveEntry = {
      id,
      userId: input.userId,
      gameKey: input.gameKey,
      label: input.label,
      checksum: input.checksum,
      sizeBytes: input.bytes.byteLength,
      revision,
      createdAt: new Date().toISOString(),
    };
    const userDir = join(this.root, input.userId);
    try {
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, `${id}.tar.gz`), input.bytes);
      const index = this.readIndex(input.userId);
      index.push(entry);
      this.writeIndex(input.userId, index);
    } catch {
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true, entry };
  }

  /** Lista os saves de um utilizador (de um jogo, quando pedido). */
  list(userId: string, gameKey?: string): readonly SaveEntry[] {
    return this.readIndex(userId)
      .filter((entry) => gameKey === undefined || entry.gameKey === gameKey)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /** Procura um save (só do próprio utilizador). */
  find(userId: string, id: string): SaveEntry | null {
    return this.readIndex(userId).find((entry) => entry.id === id) ?? null;
  }

  /** Os bytes de um save (`null` quando não existe). */
  read(userId: string, id: string): Buffer | null {
    const entry = this.find(userId, id);
    if (entry === null) {
      return null;
    }
    const path = join(this.root, userId, `${id}.tar.gz`);
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path);
  }

  /** Apaga um save (a entrada e o ficheiro). */
  remove(userId: string, id: string): boolean {
    const entry = this.find(userId, id);
    if (entry === null) {
      return false;
    }
    const index = this.readIndex(userId).filter((item) => item.id !== id);
    this.writeIndex(userId, index);
    try {
      rmSync(join(this.root, userId, `${id}.tar.gz`), { force: true });
    } catch {
      // ficheiro já era: a entrada sai do índice na mesma
    }
    return true;
  }

  /** Próxima revisão de um jogo (máxima + 1). */
  private nextRevision(userId: string, gameKey: string): number {
    const revisions = this.readIndex(userId)
      .filter((entry) => safeSegment(entry.gameKey) === gameKey)
      .map((entry) => entry.revision);
    return revisions.length === 0 ? 1 : Math.max(...revisions) + 1;
  }

  /** O índice de um utilizador (vazio quando não há). */
  private readIndex(userId: string): SaveEntry[] {
    const path = join(this.root, userId, 'index.json');
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      return Array.isArray(parsed) ? (parsed as SaveEntry[]) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(userId: string, index: readonly SaveEntry[]): void {
    const dir = join(this.root, userId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2));
  }
}

/**
 * Um segmento de caminho seguro (o nome da pasta do utilizador no disco).
 *
 * A chave do jogo pode ser um caminho (`/home/user/.steam/…`): para o disco,
 * só o **hash** dela interessa — assim nenhum caminho do utilizador do
 * cliente se transforma em caminho no servidor (nem `../` nem nada).
 */
function safeSegment(gameKey: string): string | null {
  const trimmed = gameKey.trim();
  if (trimmed === '') {
    return null;
  }
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 32);
}
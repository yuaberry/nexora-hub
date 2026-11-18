/**
 * Snapshots de saves — versões locais e detecção de conflitos.
 *
 * Um save é o progresso de quem joga: não se pode perder. O motor guarda
 * **versões** (snapshots) de uma pasta de saves e sabe responder a única
 * pergunta que importa quando há dois lados: quem está à frente de quem.
 *
 * Regras:
 *
 * - um snapshot é **imutável** — cria-se outro, nunca se edita o existente;
 * - a decisão de conflito é uma **função pura** dos metadados (revisão +
 *   checksum), testada sem tocar no disco;
 * - a nuvem (Nexora Cloud) continua `planned` — estes snapshots são locais,
 *   e a interface diz a diferença.
 */

/** Origem de um snapshot. */
export type SnapshotSource = 'local' | 'cloud';

/** Metadados de um snapshot (o que a decisão de conflito usa). */
export interface SnapshotMeta {
  /** Identificador do save (o jogo). */
  readonly gameId: string;
  /** Revisão monotónica por origem. */
  readonly revision: number;
  /** Checksum do conteúdo (agregado dos ficheiros). */
  readonly checksum: string;
  /** Origem do snapshot. */
  readonly source: SnapshotSource;
}

/** Decisão de sincronização entre dois lados. */
export type SyncDecision =
  /** Os dois lados têm o mesmo conteúdo Reconciliado. */
  | 'in-sync'
  /** Só o lado local avançou. */
  | 'local-ahead'
  /** Só o lado remoto avançou. */
  | 'remote-ahead'
  /** Os dois avançaram a partir da mesma base: há escolha a fazer. */
  | 'diverged';

/**
 * Decide o estado de sincronização entre um snapshot local e um remoto.
 *
 * Semântica deliberada e simples:
 *
 * - mesma revisão + mesmo checksum → `in-sync` (nada a fazer);
 * - **mesma revisão + checksums diferentes** → `diverged`: os dois lados
 *   escreveram a partir da mesma base, e escolher em silêncio perderia o
 *   progresso de um deles — a decisão é de quem joga;
 * - revisões diferentes → o lado com a revisão mais alta está à frente
 *   (`local-ahead` / `remote-ahead`): o outro pode ser actualizado sem
 *   perder nada, porque as versões ficam guardadas.
 */
export function decideSync(local: SnapshotMeta, remote: SnapshotMeta): SyncDecision {
  if (local.revision === remote.revision) {
    return local.checksum === remote.checksum ? 'in-sync' : 'diverged';
  }
  return local.revision > remote.revision ? 'local-ahead' : 'remote-ahead';
}

/** Um snapshot registado (o que fica no índice). */
export interface SaveSnapshotRecord {
  readonly id: string;
  readonly gameId: string;
  /** Rótulo dado por quem criou (ex.: "antes do boss final"). */
  readonly label: string;
  /** ISO-8601 UTC da criação. */
  readonly createdAt: string;
  /** Caminho da cópia no disco. */
  readonly path: string;
  /** Bytes ocupados pela cópia. */
  readonly sizeBytes: number;
  /** Checksum agregado do conteúdo. */
  readonly checksum: string;
  /** Revisão monotónica por jogo (1, 2, 3…). */
  readonly revision: number;
}

/**
 * Próxima revisão de um jogo.
 *
 * A revisão é `max(existentes) + 1` — nunca reutilizada, para que dois
 * snapshots nunca partilhem número e a decisão de conflito seja estável.
 */
export function nextRevision(records: readonly SaveSnapshotRecord[], gameId: string): number {
  const revisions = records.filter((record) => record.gameId === gameId).map((record) => record.revision);
  return revisions.length === 0 ? 1 : Math.max(...revisions) + 1;
}

/** Filtra os snapshots de um jogo, do mais recente para o mais antigo. */
export function snapshotsFor(
  records: readonly SaveSnapshotRecord[],
  gameId: string,
): readonly SaveSnapshotRecord[] {
  return records
    .filter((record) => record.gameId === gameId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
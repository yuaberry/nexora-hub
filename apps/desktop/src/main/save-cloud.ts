/**
 * Saves na nuvem — a costura entre o disco do utilizador e a conta.
 *
 * Três perguntas, respondidas aqui:
 *
 * - **enviar**: um snapshot local (a versão que existe no disco) vira um
 *   arquivo (`tar.gz`) e sobe para a conta — com a **revisão** e o checksum
 *   da cópia local, para a decisão de conflito comparar os dois lados;
 * - **restaurar**: uma versão da nuvem desce, e — antes de tocar na pasta —
 *   um snapshot local de segurança fica guardado (restaurar nunca é um
 *   caminho sem volta);
 * - **estado**: a última versão de cada lado, e a decisão do motor
 *   (`decideSync`, no núcleo): em sincronia, à frente de um lado, ou
 *   **divergente** — que é a única situação que exige escolha de quem joga.
 *
 * O cliente HTTP vive em `@nexora/cloud` (testado com rede falsa); o que aqui
 * existe é a política — o que é protegido antes de ser substituído.
 */

import { downloadSave, listSaves, uploadSave, type CloudSaveEntry, type SaveFetch, type SaveResult } from '@nexora/cloud';
import { decideSync, type SaveSnapshotRecord } from '@nexora/cloud';
import { createArchive, extractArchive } from './save-archive.js';

/** O `fetch` global tem a forma que o cliente pede. */
const fetchLike = fetch as unknown as SaveFetch;

/** O fetch usado por omissão (injectável nos testes). */
function fetchOf(fetch?: SaveFetch): SaveFetch {
  return fetch ?? fetchLike;
}

/** Resultado de uma operação de nuvem (mensagem para a interface). */
export type CloudOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/**
 * Envia um snapshot local para a nuvem.
 *
 * A revisão e o checksum são os da cópia local: o servidor guarda esses
 * valores, e o cliente consegue assim comparar os dois lados sem adivinhar.
 */
export async function uploadToCloud(
  saves: {
    list: (gameKey: string) => readonly SaveSnapshotRecord[];
  },
  baseUrl: string,
  token: string,
  gameKey: string,
  snapshotId: string,
  fetch?: SaveFetch,
): Promise<CloudOutcome<CloudSaveEntry>> {
  const record = saves.list(gameKey).find((snapshot) => snapshot.id === snapshotId);
  if (record === undefined) {
    return { ok: false, reason: 'Snapshot local não encontrado.' };
  }
  const archive = await createArchive(record.path);
  if (archive === null) {
    return { ok: false, reason: 'Não foi possível empacotar a pasta de saves.' };
  }
  const uploaded = await uploadSave(
    baseUrl,
    token,
    { gameKey, label: record.label, checksum: record.checksum, revision: record.revision, bytes: archive },
    fetchOf(fetch),
  );
  return uploaded.ok
    ? { ok: true, value: uploaded.value }
    : { ok: false, reason: uploaded.status === 401 ? 'Sessão expirada.' : 'A nuvem recusou o envio.' };
}

/**
 * Restaura uma versão da nuvem para a pasta de saves.
 *
 * A segurança primeiro: se a pasta existe, um snapshot local é criado **antes**
 * de extrair — restaurar nunca apaga o que lá estava sem deixar rasto.
 */
export async function restoreFromCloud(
  saves: {
    list: (gameKey: string) => readonly SaveSnapshotRecord[];
    create: (gameKey: string, label: string, savePath: string) => Promise<{ readonly ok: boolean }>;
  },
  baseUrl: string,
  token: string,
  gameKey: string,
  cloudId: string,
  savePath: string,
  fetch?: SaveFetch,
): Promise<CloudOutcome<number>> {
  const downloaded: SaveResult<{ bytes: Uint8Array; revision: number; checksum: string }> = await downloadSave(
    baseUrl,
    token,
    cloudId,
    fetchOf(fetch),
  );
  if (!downloaded.ok) {
    return { ok: false, reason: downloaded.status === 401 ? 'Sessão expirada.' : 'A versão não existe na nuvem.' };
  }
  // Segurança: o que está no disco fica guardado antes de ser substituído.
  await saves.create(gameKey, 'antes de restaurar da nuvem', savePath);
  const extracted = await extractArchive(downloaded.value.bytes, savePath);
  return extracted
    ? { ok: true, value: downloaded.value.revision }
    : { ok: false, reason: 'O arquivo não pôde ser extraído.' };
}

/** O que a interface precisa de saber sobre os dois lados. */
export interface CloudStatus {
  readonly local: readonly SaveSnapshotRecord[];
  readonly remote: readonly CloudSaveEntry[];
  /** A decisão do motor entre as últimas versões (`null` sem um dos lados). */
  readonly decision: ReturnType<typeof decideSync> | null;
}

/**
 * O estado de sincronização de um jogo.
 *
 * As duas listas vêm dos dois lados; a decisão compara as **últimas** versões
 * (as mais recentes de cada lado). Sem um dos lados não há decisão — não há
 * conflito com o vazio.
 */
export async function cloudStatus(
  saves: { list: (gameKey: string) => readonly SaveSnapshotRecord[] },
  baseUrl: string,
  token: string,
  gameKey: string,
  fetch?: SaveFetch,
): Promise<CloudOutcome<CloudStatus>> {
  const remote = await listSaves(baseUrl, token, gameKey, fetchOf(fetch));
  if (!remote.ok) {
    return { ok: false, reason: remote.status === 401 ? 'Sessão expirada.' : 'A nuvem está inacessível.' };
  }
  const local = saves.list(gameKey);
  const localLatest = local[0];
  const remoteLatest = remote.value[0];
  const decision =
    localLatest === undefined || remoteLatest === undefined
      ? null
      : decideSync(
          { gameId: gameKey, revision: localLatest.revision, checksum: localLatest.checksum, source: 'local' },
          { gameId: gameKey, revision: remoteLatest.revision, checksum: remoteLatest.checksum, source: 'cloud' },
        );
  return { ok: true, value: { local, remote: remote.value, decision } };
}
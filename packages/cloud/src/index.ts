/**
 * `@nexora/cloud` — saves na nuvem.
 *
 * **Decisão revista (D7).** Os saves na nuvem do launcher passaram a viver na
 * **própria API** (`@nexora/api`, módulo `saves`), com a conta que o
 * utilizador já tem: o cliente real é `cloud-saves.ts`, testado com rede
 * falsa. O *stub* que continua abaixo é o contrato para o **Nexora Cloud**
 * externo — cross-save entre serviços, que continua fase futura, e que agora
 * fica claramente separado do que já funciona.
 */

/** Estado do cliente de saves (sempre explícito). */
export interface CloudSavesStatus {
  /** `false` nesta fase: o cliente é um *stub*. */
  readonly available: false;
  /** Chave de tradução do motivo (`planned.cloud-saves`). */
  readonly reasonKey: 'cloud-saves';
  /** Texto do motivo (pt-BR). */
  readonly reason: string;
}

/** Um save remoto (contrato). */
export interface CloudSaveSlot {
  readonly gameId: string;
  readonly slot: string;
  readonly updatedAt: string;
  readonly sizeBytes: number;
}

/** Resultado de uma operação de saves (contrato). */
export type SavesOperationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonKey: string; readonly reason: string };

/** Interface do cliente de saves — a integração real cumpre este contrato. */
export interface CloudSavesClient {
  readonly status: CloudSavesStatus;
  readonly listSlots: (gameId: string) => Promise<readonly CloudSaveSlot[]>;
  readonly upload: (gameId: string, slot: string, localPath: string) => Promise<SavesOperationResult>;
  readonly download: (gameId: string, slot: string, localPath: string) => Promise<SavesOperationResult>;
}

/** Motivo declarado da indisponibilidade. */
export const CLOUD_SAVES_UNAVAILABLE_REASON =
  'Saves na nuvem: integração com o Nexora Cloud é fase futura.';

/**
 * Cliente *stub* do Nexora Cloud.
 *
 * Devolve sempre a indisponibilidade — com o motivo. É o comportamento
 * honesto de uma capacidade que ainda não existe: a interface mostra o selo
 * "Planeado" a partir daqui, não de uma decisão local.
 */
export function createNexoraCloudClient(): CloudSavesClient {
  const refuse = (): Promise<SavesOperationResult> =>
    Promise.resolve({ ok: false, reasonKey: 'cloud-saves', reason: CLOUD_SAVES_UNAVAILABLE_REASON });

  return {
    status: {
      available: false,
      reasonKey: 'cloud-saves',
      reason: CLOUD_SAVES_UNAVAILABLE_REASON,
    },
    listSlots: () => Promise.resolve([]),
    upload: refuse,
    download: refuse,
  };
}

/** Cliente pronto a usar (o launcher consome esta instância). */
export const nexoraCloudClient: CloudSavesClient = createNexoraCloudClient();
export {
  decideSync,
  nextRevision,
  snapshotsFor,
  type SaveSnapshotRecord,
  type SnapshotMeta,
  type SnapshotSource,
  type SyncDecision,
} from './snapshots.js';
export {
  SnapshotStore,
  checksumOfFolder,
  createSnapshotStore,
  folderSize,
  MAX_CONTENT_BYTES_PER_FILE,
} from './snapshot-store.js';
export {
  deleteSave,
  downloadSave,
  entriesFromList,
  listSaves,
  uploadSave,
  type CloudSaveEntry,
  type SaveFetch,
  type SaveResponse,
  type SaveResult,
} from './cloud-saves.js';

/**
 * IPC dos saves na nuvem — o progresso do utilizador, protegido nas duas
 * direções.
 *
 * Cinco canais. Todos validam o que vem do renderer (entrada externa, nunca
 * código de confiança) e todos devolvem um código de tradução quando falham —
 * o texto é da interface, não do processo principal.
 *
 * A regra que rege todos: **o save nunca se perde**. Restaurar cria um
 * snapshot local de segurança antes de extrair; enviar empacota a versão que
 * existe no disco, com a revisão e o checksum dela.
 */

import { ipcMain } from 'electron';
import { cloudStatus, restoreFromCloud, uploadToCloud } from './save-cloud.js';
import { deleteSave, type SaveFetch } from '@nexora/cloud';
import { DEFAULT_API_BASE_URL } from './config.js';
import type { LocalLibrary } from './db.js';
import type { SavesState } from './saves-state.js';

/** O `fetch` global tem a forma que o cliente pede. */
const fetchLike = fetch as unknown as SaveFetch;

/** Regista os canais dos saves na nuvem. */
export function registerSaveCloudIpc(
  saves: SavesState,
  library: LocalLibrary,
  apiBaseUrl: string = DEFAULT_API_BASE_URL,
): void {
  // O estado de sincronização de um jogo (os dois lados e a decisão).
  ipcMain.handle('saves:cloudStatus', async (_event, gameKey: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly local?: readonly { readonly id: string; readonly label: string; readonly revision: number; readonly createdAt: string }[];
    readonly remote?: readonly { readonly id: string; readonly label: string; readonly revision: number; readonly createdAt: string }[];
    readonly decision?: string;
    readonly message?: string;
  }> => {
    if (typeof gameKey !== 'string' || gameKey === '' || typeof token !== 'string') {
      return { ok: false, message: 'Argumentos em falta.' };
    }
    const status = await cloudStatus(saves, apiBaseUrl, token, gameKey);
    if (!status.ok) {
      return { ok: false, message: status.reason };
    }
    return {
      ok: true,
      local: status.value.local.map((record) => ({
        id: record.id,
        label: record.label,
        revision: record.revision,
        createdAt: record.createdAt,
      })),
      remote: status.value.remote.map((entry) => ({
        id: entry.id,
        label: entry.label,
        revision: entry.revision,
        createdAt: entry.createdAt,
      })),
      decision: status.value.decision ?? undefined,
    };
  });

  // Enviar um snapshot local para a nuvem.
  ipcMain.handle('saves:cloudUpload', async (_event, gameKey: unknown, snapshotId: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly revision?: number;
    readonly message?: string;
  }> => {
    if (typeof gameKey !== 'string' || typeof snapshotId !== 'string' || typeof token !== 'string') {
      return { ok: false, message: 'Argumentos em falta.' };
    }
    const uploaded = await uploadToCloud(saves, apiBaseUrl, token, gameKey, snapshotId);
    return uploaded.ok
      ? { ok: true, revision: uploaded.value.revision }
      : { ok: false, message: uploaded.reason };
  });

  /**
   * Restaurar uma versão da nuvem.
   *
   * A pasta de saves é resolvida no processo principal (a chave do jogo é da
   * biblioteca local) — o renderer nunca manda caminhos de ficheiros.
   */
  ipcMain.handle('saves:cloudRestore', async (_event, gameKey: unknown, cloudId: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly revision?: number;
    readonly message?: string;
  }> => {
    if (typeof gameKey !== 'string' || typeof cloudId !== 'string' || typeof token !== 'string') {
      return { ok: false, message: 'Argumentos em falta.' };
    }
    const entry = library.byGameKey(gameKey);
    if (entry === null || entry.installPath === null) {
      return { ok: false, message: 'Jogo não encontrado.' };
    }
    const restored = await restoreFromCloud(saves, apiBaseUrl, token, gameKey, cloudId, entry.installPath);
    return restored.ok
      ? { ok: true, revision: restored.value }
      : { ok: false, message: restored.reason };
  });

  // Apagar uma versão da nuvem.
  ipcMain.handle('saves:cloudDelete', async (_event, cloudId: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly message?: string;
  }> => {
    if (typeof cloudId !== 'string' || cloudId === '' || typeof token !== 'string') {
      return { ok: false, message: 'Argumentos em falta.' };
    }
    const removed = await deleteSave(apiBaseUrl, token, cloudId, fetchLike);
    return removed.ok ? { ok: true } : { ok: false, message: 'A nuvem recusou a remoção.' };
  });
}
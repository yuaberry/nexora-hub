/**
 * IPC da importação oficial.
 *
 * Canal fino: o renderer pede, o processo principal lê os manifestos das
 * lojas no disco e devolve o que entrou. Nenhum caminho vem do renderer — a
 * detecção das raízes é do processo principal, porque é ele que conhece o
 * sistema.
 */

import { ipcMain } from 'electron';
import { openExternal } from './window.js';
import type { LocalLibrary } from './db.js';
import {
  importOfficial,
  steamInstalled,
  steamRunUrl,
  type OfficialImportView,
} from './official-import.js';
import type { OfficialImportResult } from '../shared/preload-api.js';

/** Regista o canal da importação oficial. */
export function registerOfficialImportIpc(library: LocalLibrary): void {
  ipcMain.handle('library:importOfficial', (): OfficialImportResult => {
    const result: OfficialImportView = importOfficial(library);
    return {
      ok: true,
      imported: result.imported,
      scanned: result.scanned,
      stores: result.stores,
    };
  });

  // A Steam está instalada? (diagnóstico: o botão explica quando não está.)
  ipcMain.handle('library:officialAvailable', (): { readonly available: boolean } => ({
    available: steamInstalled(),
  }));

  /**
   * Handoff para o cliente oficial da Steam.
   *
   * O URL é construído **aqui**, no processo principal: o renderer passa o
   * appid e mais nada. Aberto, o jogo corre pela Steam — com a licença do
   * utilizador, o Proton escolhido por ela e os servidores oficiais. É o
   * caminho legítimo para jogar como a loja corre (Fase 2b); nada de
   * emulação de autenticação, nada de servidores de terceiros.
   */
  ipcMain.handle('steam:open', async (_event, appId: unknown): Promise<{ readonly ok: boolean }> => {
    if (typeof appId !== 'string') {
      return { ok: false };
    }
    const url = steamRunUrl(appId);
    if (url === null) {
      return { ok: false };
    }
    await openExternal(url);
    return { ok: true };
  });
}
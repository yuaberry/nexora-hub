/**
 * IPC da importação oficial.
 *
 * Canal fino: o renderer pede, o processo principal lê os manifestos das
 * lojas no disco e devolve o que entrou. Nenhum caminho vem do renderer — a
 * detecção das raízes é do processo principal, porque é ele que conhece o
 * sistema.
 */

import { ipcMain } from 'electron';
import type { LocalLibrary } from './db.js';
import { importOfficial, steamInstalled, type OfficialImportView } from './official-import.js';
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
}
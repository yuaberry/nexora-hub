/**
 * IPC do detector de modos.
 *
 * Canal fino: o renderer pede a varredura da pasta de instalação de um jogo,
 * e o processo principal lê os `.jar` da pasta `mods` com as ferramentas do
 * sistema. O caminho é validado antes de ser lido — o que vem do renderer é
 * tratado como entrada externa.
 */

import { ipcMain } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { scanMods, type ModsScanView } from './mods.js';

/** Regista o canal do detector de modos. */
export function registerModsIpc(): void {
  ipcMain.handle('mods:scan', async (_event, installPath: unknown): Promise<ModsScanView> => {
    if (typeof installPath !== 'string' || installPath === '' || !existsSync(installPath)) {
      return { folder: null, total: 0, byLoader: [], unknown: 0, totalBytes: 0, mods: [] };
    }
    let isDirectory = false;
    try {
      isDirectory = statSync(installPath).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      return { folder: null, total: 0, byLoader: [], unknown: 0, totalBytes: 0, mods: [] };
    }
    return scanMods(installPath);
  });
}
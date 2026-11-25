/**
 * Instalação de modos — um clique, com o plano antes.
 *
 * O renderer pede para instalar um modo; o processo principal abre o diálogo
 * do sistema (o renderer nunca o faz), monta o **plano** no domínio (só `.jar`,
 * sem sobrescrever em silêncio, com limite de tamanho) e só copia se o plano
 * aceitar. A resposta diz o que aconteceu — nenhum modo "instalado" sem provas.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dialog, ipcMain } from 'electron';
import { planModInstall } from '@nexora/core';
import { findModsFolders } from './mods.js';

/** A chave do motivo (a interface traduz, não o processo principal). */
export type ModInstallFailure =
  | 'no-folder'
  | 'not-a-mod'
  | 'too-large'
  | 'already-exists'
  | 'copy-failed';

/** O resultado da instalação. */
export interface ModInstallResult {
  readonly ok: boolean;
  /** O nome do ficheiro instalado. */
  readonly fileName?: string;
  /** O motivo da recusa (chave de tradução). */
  readonly reason?: ModInstallFailure | 'cancelled';
}

/**
 * Instala um ficheiro escolhido numa pasta de modos.
 *
 * A decisão é do domínio (`planModInstall`) e a cópia é a única escrita: se o
 * plano recusar, nada se copia — a pasta fica como estava. (Separada do diálogo
 * para poder ser testada sem o Electron.)
 */
export function installModFile(source: string, folder: string): ModInstallResult {
  const plan = planModInstall({
    fileName: basename(source),
    sizeBytes: sizeOf(source),
    existing: existingNames(folder),
    targetFolder: folder,
  });
  if (!plan.ok) {
    return { ok: false, reason: plan.reason };
  }
  try {
    mkdirSync(folder, { recursive: true });
    copyFileSync(source, join(folder, plan.fileName));
  } catch {
    return { ok: false, reason: 'copy-failed' };
  }
  return { ok: true, fileName: plan.fileName };
}

/** Regista o canal da instalação de modos. */
export function registerModsInstallIpc(): void {
  ipcMain.handle('mods:install', async (_event, installPath: unknown): Promise<ModInstallResult> => {
    if (typeof installPath !== 'string' || installPath === '' || !existsSync(installPath)) {
      return { ok: false, reason: 'no-folder' };
    }
    // A pasta de modos é a que o scanner encontra (a mesma convenção).
    const folder = findModsFolders(installPath)[0];
    if (folder === undefined) {
      return { ok: false, reason: 'no-folder' };
    }

    const picked = await dialog.showOpenDialog({
      title: 'Instalar modo',
      properties: ['openFile'],
      filters: [{ name: 'Modos', extensions: ['jar', 'disabled'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      // Cancelar não é erro: não há modo instalado, e não há falha a reportar.
      return { ok: false, reason: 'cancelled' };
    }
    const source = picked.filePaths[0];
    if (source === undefined) {
      return { ok: false, reason: 'cancelled' };
    }
    return installModFile(source, folder);
  });
}

/** Os nomes que já estão numa pasta de modos. */
function existingNames(folder: string): readonly string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

/** O tamanho de um ficheiro (0 quando não existe). */
function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
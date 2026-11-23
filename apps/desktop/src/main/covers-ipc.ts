/**
 * IPC das capas e da sincronização — a personalização do utilizador.
 *
 * Quatro canais, todos com o mesmo espírito: o utilizador manda, e o
 * processo principal valida antes de escrever.
 *
 * - `steam:sync` — relê os manifestos da Steam e traz o que mudou (jogos
 *   novos, títulos diferentes); nunca mexe numa capa escolhida pelo utilizador;
 * - `steam:coverOptions` — as imagens que a Steam guardou para um jogo, para
 *   o utilizador escolher entre elas;
 * - `library:setCover` — uma capa à escolha (o caminho tem de ser uma imagem
 *   que exista);
 * - `library:resetCover` — volta à capa automática (a da Steam, se existir).
 */

import { dialog, ipcMain } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { steamCapsuleUrl } from '@nexora/core';
import { steamCoverAlternatives, steamCoverFor } from './steam-images.js';
import { localCoverFile } from './disk-scan.js';
import { syncSteamLibrary } from './steam-sync.js';
import { hydrateCovers } from './covers-hydrate.js';
import type { LocalLibrary } from './db.js';

/** Extensões de imagem aceites como capa. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;

/** A raiz da biblioteca da Steam a que uma pasta de instalação pertence. */
function libraryRootOf(installPath: string): string {
  const marker = 'steamapps/common/';
  const index = installPath.indexOf(marker);
  return index === -1 ? installPath : installPath.slice(0, index);
}

/**
 * Abre o selector de ficheiros de imagem (o renderer nunca abre diálogos).
 *
 * Devolve o caminho escolhido ou `null` — cancelar não é erro, e o caminho é
 * validado no `library:setCover`.
 */
async function pickCoverFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Escolher capa',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

/**
 * Regista os canais das capas e da sincronização.
 *
 * `coversDir` é a pasta do cache das imagens da loja (ao lado da base local):
 * é para lá que a hidratação guarda as cápsulas buscadas.
 */
export function registerCoversIpc(library: LocalLibrary, coversDir: string): void {
  // Sincroniza com o que a Steam tem agora.
  ipcMain.handle('steam:sync', (): {
    readonly ok: boolean;
    readonly updated: number;
    readonly added: number;
    readonly unchanged: number;
    readonly titles: readonly string[];
  } => {
    const report = syncSteamLibrary(library);
    return { ok: true, ...report };
  });

  // As imagens que a Steam guardou para um jogo (para escolher entre elas).
  ipcMain.handle('steam:coverOptions', (_event, gameId: unknown): {
    readonly ok: boolean;
    readonly options?: readonly { readonly path: string; readonly label: string }[];
    readonly message?: string;
  } => {
    const numericId = typeof gameId === 'number' ? gameId : Number(gameId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const entry = library.findById(numericId);
    if (entry === null || entry.steamAppId === null || entry.installPath === null) {
      // Sem appid, ou sem pasta no disco (entrada de catálogo), não há
      // imagens locais da Steam: a capa automática é a da loja ou o
      // placeholder do tema.
      return { ok: true, options: [] };
    }
    const root = libraryRootOf(entry.installPath);
    const chosen = steamCoverFor(root, entry.steamAppId);
    const options = [
      ...(chosen === null ? [] : [{ path: chosen, label: basename(chosen) }]),
      ...steamCoverAlternatives(root, entry.steamAppId).map((path) => ({ path, label: basename(path) })),
    ];
    return { ok: true, options };
  });

  // Define uma capa escolhida pelo utilizador.
  ipcMain.handle('library:setCover', (_event, gameId: unknown, path: unknown): {
    readonly ok: boolean;
    readonly message?: string;
  } => {
    const numericId = typeof gameId === 'number' ? gameId : Number(gameId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, message: 'Jogo em falta.' };
    }
    if (typeof path !== 'string' || path === '') {
      return { ok: false, message: 'Caminho em falta.' };
    }
    // O caminho tem de ser uma imagem que exista: um caminho inventado
    // deixaria o jogo sem capa e sem explicação.
    if (!existsSync(path) || !statSync(path).isFile()) {
      return { ok: false, message: 'Ficheiro não encontrado.' };
    }
    if (!IMAGE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))) {
      return { ok: false, message: 'Formato de imagem não suportado.' };
    }
    const updated = library.setCover(numericId, path, true);
    return updated === null ? { ok: false, message: 'Jogo não encontrado.' } : { ok: true };
  });

  /**
   * Hidrata as capas com a cápsula pública da loja — a mesma arte para todos
   * os utilizadores, guardada no disco. Uma capa escolhida pelo utilizador
   * nunca é substituída. O relatório diz o que mudou.
   */
  ipcMain.handle('covers:hydrate', async (): Promise<{
    readonly ok: boolean;
    readonly updated: number;
    readonly failed: number;
    readonly skipped: number;
  }> => {
    const report = await hydrateCovers(library, coversDir);
    return { ok: true, ...report };
  });

  // Abre o selector de ficheiro (a capa escolhida passa pelo setCover).
  ipcMain.handle('covers:pick', (): Promise<{ readonly ok: boolean; readonly path?: string }> =>
    pickCoverFile().then((path) => (path === null ? { ok: false } : { ok: true, path })),
  );

  // Volta à capa automática (a da Steam, se existir).
  ipcMain.handle('library:resetCover', (_event, gameId: unknown): {
    readonly ok: boolean;
    readonly message?: string;
  } => {
    const numericId = typeof gameId === 'number' ? gameId : Number(gameId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const entry = library.findById(numericId);
    if (entry === null) {
      return { ok: false, message: 'Jogo não encontrado.' };
    }
    // A capa automática é a que a **Steam** guardou no disco; sem pasta no
    // disco (entrada de catálogo), é a cápsula pública da loja; sem nenhuma
    // das duas, `null` — e o placeholder do tema desenha-se. Nunca um caminho
    // adivinhado.
    const steamCover =
      entry.installPath !== null && entry.steamAppId !== null
        ? steamCoverFor(libraryRootOf(entry.installPath), entry.steamAppId)
        : null;
    const automatic =
      steamCover ??
      (entry.installPath !== null ? localCoverFile(entry.installPath) : null) ??
      (entry.steamAppId === null ? null : steamCapsuleUrl(entry.steamAppId));
    const reset = library.setCover(numericId, automatic, false);
    return reset === null ? { ok: false, message: 'Jogo não encontrado.' } : { ok: true };
  });
}
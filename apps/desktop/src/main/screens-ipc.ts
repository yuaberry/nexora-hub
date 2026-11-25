/**
 * IPC das capturas — capturar, listar e remover.
 *
 * Canal fino: o renderer pede a captura (o ecrã é do processo principal), e
 * os caminhos são sempre os do jogo — o renderer nunca manda um caminho de
 * ficheiro, só o jogo.
 */

import { ipcMain } from 'electron';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import { screenshotFolder } from '@nexora/core';
import { captureScreenshot, listScreenshots, removeScreenshot, screenshotsRoot, type ScreenshotView } from './screens.js';
import { DEFAULT_API_BASE_URL } from './config.js';

/** Uma captura na nuvem (vista do contrato). */
interface CloudShot {
  readonly id: string;
  readonly gameKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

/** Sobe uma captura para a conta (o processo principal lê o ficheiro). */
async function uploadShot(
  apiBaseUrl: string,
  gameKey: string,
  fileName: string,
  token: string,
): Promise<CloudShot | null> {
  const path = `${screenshotsRoot(app.getPath('userData'))}/${screenshotFolder(gameKey)}/${fileName}`;
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return null;
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/screenshots`, {
    method: 'POST',
    headers: {
      'content-type': 'image/png',
      authorization: `Bearer ${token}`,
      'x-game-key': gameKey,
      'x-file-name': fileName,
    },
    // O Node aceita Buffer, mas o tipo espera Uint8Array.
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { screenshot?: unknown };
  const shot = payload.screenshot as CloudShot | undefined;
  return shot ?? null;
}

/** Regista os canais das capturas. */
export function registerScreensIpc(): void {
  ipcMain.handle('screens:capture', async (_event, gameKey: unknown): Promise<{
    readonly ok: boolean;
    readonly shot?: ScreenshotView;
  }> => {
    if (typeof gameKey !== 'string' || gameKey === '') {
      return { ok: false };
    }
    const shot = await captureScreenshot(app.getPath('userData'), gameKey);
    return shot === null ? { ok: false } : { ok: true, shot };
  });

  ipcMain.handle('screens:list', (_event, gameKey: unknown): readonly ScreenshotView[] => {
    if (typeof gameKey !== 'string' || gameKey === '') {
      return [];
    }
    return listScreenshots(app.getPath('userData'), gameKey);
  });

  ipcMain.handle('screens:remove', (_event, gameKey: unknown, fileName: unknown): boolean => {
    if (typeof gameKey !== 'string' || typeof fileName !== 'string') {
      return false;
    }
    return removeScreenshot(app.getPath('userData'), gameKey, fileName);
  });

  // Sobe uma captura para a conta (o ficheiro é lido pelo processo principal).
  ipcMain.handle('screens:upload', async (_event, gameKey: unknown, fileName: unknown, token: unknown): Promise<{
    readonly ok: boolean;
    readonly shot?: CloudShot;
  }> => {
    if (typeof gameKey !== 'string' || typeof fileName !== 'string' || typeof token !== 'string') {
      return { ok: false };
    }
    const shot = await uploadShot(DEFAULT_API_BASE_URL, gameKey, fileName, token);
    return shot === null ? { ok: false } : { ok: true, shot };
  });

  // As capturas do jogo na nuvem (as da conta).
  ipcMain.handle('screens:cloudList', async (_event, gameKey: unknown, token: unknown): Promise<readonly CloudShot[]> => {
    if (typeof gameKey !== 'string' || typeof token !== 'string') {
      return [];
    }
    try {
      const query = encodeURIComponent(gameKey);
      const response = await fetch(`${DEFAULT_API_BASE_URL}/api/v1/screenshots?game=${query}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as { items?: unknown };
      return Array.isArray(payload.items) ? (payload.items as CloudShot[]) : [];
    } catch {
      return [];
    }
  });

  // Remove uma captura da nuvem.
  ipcMain.handle('screens:cloudRemove', async (_event, shotId: unknown, token: unknown): Promise<boolean> => {
    if (typeof shotId !== 'string' || typeof token !== 'string') {
      return false;
    }
    try {
      const response = await fetch(`${DEFAULT_API_BASE_URL}/api/v1/screenshots/${shotId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  });
}

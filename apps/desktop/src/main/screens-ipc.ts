/**
 * IPC das capturas — capturar, listar e remover.
 *
 * Canal fino: o renderer pede a captura (o ecrã é do processo principal), e
 * os caminhos são sempre os do jogo — o renderer nunca manda um caminho de
 * ficheiro, só o jogo.
 */

import { ipcMain } from 'electron';
import { app } from 'electron';
import { captureScreenshot, listScreenshots, removeScreenshot, type ScreenshotView } from './screens.js';

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
}

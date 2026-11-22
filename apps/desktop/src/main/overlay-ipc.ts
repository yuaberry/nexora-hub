/**
 * IPC do overlay — abrir e fechar a janela por cima do jogo.
 *
 * Canal fino: o renderer pede o alternar, e o processo principal decide
 * (mostrar ou esconder). O atalho Shift+Tab faz o mesmo caminho — e só está
 * registado enquanto há jogo a correr.
 */

import { ipcMain } from 'electron';
import { toggleOverlay } from './overlay.js';

/** Regista o canal do overlay. */
export function registerOverlayIpc(): void {
  ipcMain.handle('overlay:toggle', (): { readonly ok: boolean; readonly visible: boolean } => {
    const visible = toggleOverlay();
    return { ok: true, visible };
  });
}

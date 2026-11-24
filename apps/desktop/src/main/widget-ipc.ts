/**
 * IPC do widget — mostrar, esconder e parar a sessão.
 *
 * O launcher pede o alternar; o widget pede o parar (o botão do HUD é o mesmo
 * que o do launcher — o widget não inventa um controlo que não existe).
 */

import { ipcMain } from 'electron';
import { toggleWidget, widgetVisible } from './widget.js';
import type { LocalGameRunner } from '@nexora/runner';

/** Regista os canais do widget. */
export function registerWidgetIpc(runner: LocalGameRunner): void {
  // O launcher mostra ou esconde o widget.
  ipcMain.handle('widget:toggle', (): { readonly ok: boolean; readonly visible: boolean } => {
    const visible = toggleWidget();
    return { ok: true, visible };
  });

  // O widget pergunta se está visível (o botão do launcher mostra o estado).
  ipcMain.handle('widget:visible', (): { readonly visible: boolean } => ({ visible: widgetVisible() }));

  // O botão de parar do HUD: a sessão real, pelo runner.
  ipcMain.handle('widget:stop', async (): Promise<{ readonly ok: boolean }> => {
    const running = runner.running();
    for (const session of running) {
      await runner.stop(session.sessionId);
    }
    return { ok: true };
  });
}

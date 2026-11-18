/**
 * Janela principal do launcher.
 *
 * Espelha as regras do Nexora Cloud: renderer isolado (`contextIsolation`,
 * `nodeIntegration: false`, `sandbox: true`), sem navegação externa e sem
 * novas janelas. O renderer só fala com o esquema interno `nexora://`.
 */

import {BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { packageRoot, type DesktopConfig } from './config.js';

/** Nome do produto (título da janela e do instalador). */
export const APP_TITLE = 'NEXORA HUB';

/** Tamanhos mínimos declarados — abaixo disto a interface deixa de funcionar. */
export const MIN_WINDOW = { width: 960, height: 640 } as const;

/** Cria a janela principal. */
export function createMainWindow(config: DesktopConfig): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    title: APP_TITLE,
    backgroundColor: '#07070b',
    show: false,
    webPreferences: {
      preload: join(packageRoot(), 'dist', 'preload', 'index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: process.env['NEXORA_DESKTOP_DEVTOOLS'] === '1',
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  // Navegação externa é bloqueada: a aplicação vive dentro do esquema
  // interno. Nenhuma página da Internet é carregada dentro do renderer.
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(config.startUrl)) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Sem isto a janela fica em `about:blank` e o `ready-to-show` nunca compõe:
  // é o carregamento que faz a interface aparecer.
  void window.loadURL(config.startUrl);
  return window;
}

/** Abre um URL no browser do sistema (usado só por pedidos explícitos). */
export function openExternal(url: string): Promise<void> {
  return shell.openExternal(url);
}
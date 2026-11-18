/**
 * Ponto de entrada do processo principal.
 *
 * Ordem deliberada: o esquema interno é registado como privilegiado **antes**
 * de `app.ready` (a regra do Nexora Cloud), e só depois disso o protocolo é
 * ligado, a janela criada e o IPC registado. A base de dados local é fechada
 * antes de sair — a medida do tempo jogado não pode perder-se.
 */

import { app, dialog, protocol } from 'electron';
import { LocalLibrary } from './db.js';
import { LocalGameRunner } from '@nexora/runner';
import { packageRoot, resolveConfig, hasRendererBuild } from './config.js';
import { registerNexoraProtocol } from './protocol.js';
import { createMainWindow } from './window.js';
import { registerIpc } from './library-ipc.js';
import { registerDownloadsIpc } from './downloads-ipc.js';
import { registerSavesIpc } from './saves-ipc.js';
import type { AppInfoView } from '../shared/preload-api.js';

/**
 * Nome da aplicação — **explícito**, antes de qualquer caminho ser usado.
 *
 * `app.getPath('userData')` deriva do **nome** da app, e o nome por omissão é
 * o do `package.json` (`@nexora/desktop`): sem esta linha o launcher
 * guardaria a base local em `~/.config/@nexora` — um directório com `@` e o
 * nome do pacote, não o nome do produto. Tem de acontecer antes do
 * `requestSingleInstanceLock` (que também usa o `userData`).
 */
app.setName('NEXORA HUB');

/**
 * Registo do esquema privilegiado — no topo do ficheiro, fora de qualquer
 * `whenReady`, porque o Electron exige que aconteça antes do ciclo de vida.
 */
try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'nexora',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
} catch {
  // Em testes (dependências reinjetadas) o `protocol` pode não suportar o
  // registo — o esquema continua a funcionar pelos caminhos servidos.
}

/** Janela principal (mantida para o `activate` do macOS). */
let mainWindow: import('electron').BrowserWindow | null = null;

/** Sessão de aplicação (o que precisa de ser fechado antes de sair). */
let library: LocalLibrary | null = null;
let runner: LocalGameRunner | null = null;

/** Informações do executável — a versão é a do package, nunca inventada. */
function appInfo(): AppInfoView {
  return {
    platform: process.platform,
    versions: {
      app: app.getVersion(),
      electron: process.versions['electron'] ?? '',
      chrome: process.versions['chrome'] ?? '',
      node: process.versions['node'] ?? '',
    },
    desktop: true,
  };
}

/** Arranque da aplicação. */
function bootstrap(): void {
  // A raiz é a do **pacote**, nunca o directório de onde se lançou: um
  // caminho de base de dados que depende do `cwd` quebra com um clique num
  // directório diferente — e a app morreria sem dizer porquê.
  const config = resolveConfig(process.env, app.isPackaged, packageRoot(), process.resourcesPath, app.getPath('userData'));

  registerNexoraProtocol(config);

  if (!hasRendererBuild(config.rendererRoot)) {
    // Uma janela branca sem explicação é o pior diagnóstico possível: o
    // arranque diz, em texto, o que falta.
    console.error(
      `[nexora-hub] build do renderer não encontrado em ${config.rendererRoot}. ` +
        'Execute `pnpm --filter @nexora/desktop build` antes de iniciar a aplicação.',
    );
  }

  library = new LocalLibrary(config.databasePath);
  runner = new LocalGameRunner();

  registerIpc({ library, runner, appInfo: appInfo() });

  // Fontes e downloads: registro + fila, criados a partir da biblioteca local.
  registerDownloadsIpc(library);

  // Saves: snapshots versionados, com o índice na base local.
  registerSavesIpc(library);

  mainWindow = createMainWindow(config);
}

/** Ponto de entrada único — uma segunda instância só foca a primeira. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    try {
      bootstrap();
    } catch (cause) {
      // Uma falha de arranque **não pode ser silenciosa**: um launcher que
      // morre sem explicação deixa o utilizador a achar que o jogo é que
      // falhou. Mostra o motivo e sai com código != 0.
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[nexora-hub] falha no arranque: ${message}`);
      dialog.showErrorBox('NEXORA HUB — falha ao iniciar', message);
      app.exit(1);
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      bootstrap();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    library?.close();
    library = null;
    runner = null;
  });
}
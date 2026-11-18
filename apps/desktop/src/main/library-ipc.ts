/**
 * IPC da biblioteca, do runner e do disco.
 *
 * A fronteira de confiança: o renderer nunca toca em ficheiros nem processos.
 * Cada argumento é validado aqui — o que vem do renderer é tratado como
 * entrada externa, não como código de confiança — e cada erro devolve um
 * código de tradução, nunca um texto solto.
 */

import { existsSync } from 'node:fs';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';
import { LocalGameRunner, resolveLaunchPlan, type LaunchContext } from '@nexora/runner';
import type {
  AppInfoView,
  DesktopGameView,
  DetectedFolderView,
  DiskUsageView,
  ImportResultView,
  LaunchResultView,
  SessionSummaryView,
} from '../shared/preload-api.js';
import { LocalLibrary } from './db.js';
import { detectCommonFolders, pickAndImport } from './import-service.js';
import { directorySize, volumeSpace } from './storage.js';

/** Limites de validação dos argumentos do renderer. */
const MAX_ID_LENGTH = 512;

function isNonEmptyString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/** Converte um registo da base local na vista do renderer. */
function toView(record: {
  readonly id: number;
  readonly externalKey: string;
  readonly title: string;
  readonly cover: string | null;
  readonly installPath: string;
  readonly executablePath: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  readonly lastPlayedAt: string | null;
  readonly totalSeconds: number;
}): DesktopGameView {
  return {
    id: String(record.id),
    externalKey: record.externalKey,
    title: record.title,
    cover: record.cover,
    installPath: record.installPath,
    executablePath: record.executablePath,
    tags: record.tags,
    favorite: record.favorite,
    lastPlayedAt: record.lastPlayedAt,
    totalSeconds: record.totalSeconds,
  };
}

/** Dependências do IPC (injectadas para serem testáveis). */
export interface IpcDependencies {
  readonly library: LocalLibrary;
  readonly runner: LocalGameRunner;
  readonly appInfo: AppInfoView;
}

/** Regista todos os canais do IPC. */
export function registerIpc(dependencies: IpcDependencies): void {
  const { library, runner, appInfo } = dependencies;

  ipcMain.handle('app:info', () => appInfo);

  ipcMain.handle('library:list', () => library.list().map(toView));

  ipcMain.handle('library:importFolder', async (): Promise<ImportResultView> =>
    pickAndImport(library),
  );

  ipcMain.handle('library:detectFolders', (): readonly DetectedFolderView[] =>
    detectCommonFolders(),
  );

  ipcMain.handle('library:toggleFavorite', (_event, id: unknown) => {
    if (!isNonEmptyString(id)) {
      return null;
    }
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return null;
    }
    const record = library.setFavorite(numericId, !(library.findById(numericId)?.favorite ?? false));
    return record === null ? null : toView(record);
  });

  ipcMain.handle('library:remove', (_event, id: unknown) => {
    if (!isNonEmptyString(id)) {
      return false;
    }
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return false;
    }
    return library.remove(numericId);
  });

  ipcMain.handle('storage:usage', (): DiskUsageView => {
    const games = library.list();
    const gamesBytes = games.reduce(
      (total, game) => total + directorySize(game.installPath, 5_000, 3),
      0,
    );
    const root = games[0]?.installPath ?? process.cwd();
    const volume = volumeSpace(root);
    return {
      totalBytes: volume.totalBytes,
      freeBytes: volume.freeBytes,
      gamesBytes,
    };
  });

  ipcMain.handle('runner:launch', async (_event, id: unknown): Promise<LaunchResultView> => {
    if (!isNonEmptyString(id)) {
      return { ok: false, reasonKey: 'not-found' };
    }
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, reasonKey: 'not-found' };
    }
    const game = library.findById(numericId);
    if (game === null) {
      return { ok: false, reasonKey: 'not-found' };
    }

    // O plano de arranque decide a camada (nativo ou Wine/Proton) — e sem
    // Wine no sistema, a recusa é explícita, não um processo que morre.
    const plan = resolveLaunchPlan(
      { gameId: game.externalKey, executablePath: game.executablePath },
      launchContext(),
    );
    if (!plan.ok) {
      return { ok: false, reasonKey: plan.reasonKey };
    }

    const outcome = await runner.launch({
      gameId: game.externalKey,
      // O executável real (a verificação de existência e a identidade da
      // sessão usam-no); o `command` é a camada por cima, quando existe.
      executablePath: game.executablePath,
      command: plan.command,
      args: plan.args,
      env: plan.env,
      cwd: game.installPath,
    });
    if (!outcome.ok) {
      return { ok: false, reasonKey: outcome.reasonKey };
    }

    // O tempo jogado é gravado quando a sessão termina — incluindo o código
    // de saída, para que um crash não seja confundido com uma sessão normal.
    void runner.wait(outcome.session.sessionId).then((summary) => {
      if (summary !== null && !summary.crashed) {
        library.addPlayedSeconds(game.externalKey, summary.durationSeconds, summary.endedAt ?? new Date().toISOString());
      }
    });

    return {
      ok: true,
      sessionId: outcome.session.sessionId,
      gameId: outcome.session.gameId,
      startedAt: outcome.session.startedAt,
    };
  });

  ipcMain.handle('runner:running', (): readonly SessionSummaryView[] =>
    runner.running().map((session) => ({
      sessionId: session.sessionId,
      gameId: session.gameId,
      startedAt: session.startedAt,
      durationSeconds: session.durationSeconds,
      crashed: session.crashed,
    })),
  );

  ipcMain.handle('runner:stop', (_event, sessionId: unknown) => {
    if (!isNonEmptyString(sessionId, 128)) {
      return null;
    }
    const summary = runner.stop(sessionId);
    return summary === null ? null : {
      sessionId: summary.sessionId,
      gameId: summary.gameId,
      startedAt: summary.startedAt,
      durationSeconds: summary.durationSeconds,
      crashed: summary.crashed,
    };
  });
}

/** `true` quando um caminho existe (diagnóstico de arranque). */
export function executableExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Contexto de arranque do sistema.
 *
 * O Wine é procurado no `PATH` (sem instalar nada, sem privilégios): se
 * existir, jogos Windows correm no Linux com prefixo **por jogo**, dentro do
 * `userData`. Se não existir, o plano recusa com motivo honesto.
 */
export function launchContext(): LaunchContext {
  return {
    platform: process.platform,
    winePath: findInPath('wine') ?? findInPath('wine64'),
    winePrefixRoot: join(app.getPath('userData'), 'wine-prefixes'),
  };
}

/** Procura um executável no `PATH` (ou `null`). */
function findInPath(name: string): string | null {
  const paths = (process.env['PATH'] ?? '').split(':').filter((entry) => entry !== '');
  for (const dir of paths) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
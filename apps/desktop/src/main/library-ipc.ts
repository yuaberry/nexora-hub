/**
 * IPC da biblioteca, do runner e do disco.
 *
 * A fronteira de confiança: o renderer nunca toca em ficheiros nem processos.
 * Cada argumento é validado aqui — o que vem do renderer é tratado como
 * entrada externa, não como código de confiança — e cada erro devolve um
 * código de tradução, nunca um texto solto.
 */

import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { accessSync, constants } from 'node:fs';
import { basename, join } from 'node:path';
import { app, globalShortcut, ipcMain } from 'electron';
import { LocalGameRunner, resolveLaunchPlan, type LaunchContext } from '@nexora/runner';
import { DEFAULT_API_BASE_URL } from './config.js';
import { ensureWinePrefix } from './wine-prefix.js';
import { startSessionPresence } from './friends-ipc.js';
import { registerOverlayShortcut, setCurrentGame, unregisterOverlayShortcut } from './overlay.js';
import { setWidgetSession } from './widget.js';
import { findGameMode } from './optimizer.js';
import { installDesktopShortcut } from './shortcuts.js';
import { openExternal } from './window.js';
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
import { detectCommonFolders, importFolder, pickAndImport } from './import-service.js';
import { isKnownToolFolder } from './scan-filter.js';
import { directorySize, volumeSpace } from './storage.js';

/**
 * Chamada autenticada à API, com o token da sessão do renderer.
 *
 * O processo principal **nunca** guarda credenciais: recebe o token do
 * renderer, reencaminha com o cabeçalho e esquece-o. Sem token, o pedido é
 * recusado — a lista de desejos exige conta.
 */
async function apiCall(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  token: unknown,
): Promise<{ ok: boolean; items?: unknown; total?: number; message?: string }> {
  if (typeof token !== 'string' || token === '') {
    return { ok: false, message: 'Sessão obrigatória.' };
  }
  try {
    const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
      method,
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const payload = (text === '' ? {} : JSON.parse(text)) as {
      items?: unknown;
      total?: number;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, message: payload.error?.message ?? 'Pedido recusado.' };
    }
    return { ok: true, items: payload.items, total: payload.total };
  } catch {
    return { ok: false, message: 'A API está inacessível.' };
  }
}

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
  readonly installPath: string | null;
  readonly executablePath: string | null;
  readonly steamAppId?: string | null;
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
    // Appid da Steam, quando o jogo veio de um manifesto da loja: é o que
    // permite o handoff para o cliente oficial.
    steamAppId: record.steamAppId ?? null,
    // Entrada de catálogo: há metadado mas não há disco. A interface mostra
    // o link da loja em vez de um botão que não arranca nada.
    installed: record.executablePath !== null,
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


  // ---- Colecções ------------------------------------------------------

  ipcMain.handle('collections:create', (_event, name: unknown) => {
    if (!isNonEmptyString(name, 64)) {
      return null;
    }
    return library.createCollection(name);
  });

  ipcMain.handle('collections:list', () => library.listCollections());

  ipcMain.handle('collections:add', (_event, collectionId: unknown, gameKey: unknown) => {
    if (typeof collectionId !== 'number' || !Number.isInteger(collectionId) || !isNonEmptyString(gameKey)) {
      return false;
    }
    return library.addToCollection(collectionId, gameKey);
  });

  ipcMain.handle('collections:remove', (_event, collectionId: unknown, gameKey: unknown) => {
    if (typeof collectionId !== 'number' || !Number.isInteger(collectionId) || !isNonEmptyString(gameKey)) {
      return false;
    }
    return library.removeFromCollection(collectionId, gameKey);
  });

  ipcMain.handle('collections:delete', (_event, collectionId: unknown) => {
    if (typeof collectionId !== 'number' || !Number.isInteger(collectionId)) {
      return false;
    }
    return library.deleteCollection(collectionId);
  });

  ipcMain.handle('collections:games', (_event, collectionId: unknown) => {
    if (typeof collectionId !== 'number' || !Number.isInteger(collectionId)) {
      return [];
    }
    return library.collectionGames(collectionId);
  });

  // ---- Scan de disco --------------------------------------------------

  // Procura jogos nas pastas comuns e importa o que encontrar. A detecção é a
  // mesma da importação manual — e uma pasta sem executável plausível é
  // recusada com motivo, não adivinhada.
  ipcMain.handle('library:scan', async (): Promise<{ readonly imported: readonly string[]; readonly scanned: number }> => {
    const folders = detectCommonFolders();
    const imported: string[] = [];
    // As pastas comuns são **contentores**: o scan importa os filhos (cada
    // pasta de jogo), não o contentor — senão aparecia "/Games" como um
    // jogo. Uma pasta sem executável plausível é recusada com motivo.
    for (const folder of folders) {
      let entries: Dirent[];
      try {
        entries = readdirSync(folder.path, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        // Ferramentas do sistema (Proton, runtimes) não entram: a lista é
        // declarada em scan-filter.ts, com o motivo escrito.
        if (isKnownToolFolder(entry.name)) {
          continue;
        }
        const result = importFolder(library, join(folder.path, entry.name));
        imported.push(...result.imported);
      }
    }
    return { imported, scanned: folders.length };
  });


  // ---- Loja (directório público + lista de desejos) --------------------

  // O directório é público: a rota da API não exige sessão. A lista de
  // desejos vai nas credenciais da sessão do renderer (o token vive no
  // sessionStorage do renderer, nunca no processo principal).
  ipcMain.handle('store:catalog', async (_event, query: unknown, platform: unknown, hideAdult: unknown) => {
    const params = new URLSearchParams();
    if (typeof query === 'string' && query.trim() !== '') {
      params.set('q', query);
    }
    if (typeof platform === 'string' && platform !== '') {
      params.set('platform', platform);
    }
    if (hideAdult === false) {
      params.set('hideAdult', 'false');
    }
    const url = `${DEFAULT_API_BASE_URL}/api/v1/store${params.size > 0 ? `?${params}` : ''}`;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        return { ok: false, message: 'Não foi possível carregar o directório.' };
      }
      const body = (await response.json()) as { items: unknown[]; total: number };
      return { ok: true, items: body.items, total: body.total };
    } catch {
      return { ok: false, message: 'A API está inacessível.' };
    }
  });

  ipcMain.handle('storage:usage', (): DiskUsageView => {
    const games = library.list();
    // Entradas de catálogo não ocupam disco: não contam para o volume.
    const gamesBytes = games.reduce(
      (total, game) => total + (game.installPath === null ? 0 : directorySize(game.installPath, 5_000, 3)),
      0,
    );
    const root = games.find((game) => game.installPath !== null)?.installPath ?? process.cwd();
    const volume = volumeSpace(root);
    return {
      totalBytes: volume.totalBytes,
      freeBytes: volume.freeBytes,
      gamesBytes,
    };
  });

  ipcMain.handle('runner:launch', async (_event, id: unknown, launchToken: unknown): Promise<LaunchResultView> => {
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
    // Entrada de catálogo: há metadado, não há disco. O arranque é recusado
    // com o motivo — e a interface mostra o link da loja (o jogo tem de ser
    // instalado pela loja oficial, não pelo launcher).
    if (game.executablePath === null || game.installPath === null) {
      return { ok: false, reasonKey: 'not-installed' };
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

    // O prefixo Wine tem de existir antes do spawn: o Wine faz `chdir` para
    // ele e morre com código 1 se a pasta não estiver lá. Sem isto, o jogo
    // "arrancava" e morria em milissegundos, sem erro visível.
    const prefix = plan.env['WINEPREFIX'];
    if (typeof prefix === 'string') {
      ensureWinePrefix(prefix);
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
      // A marca do jogo na tabela de processos. Com Wine, o processo
      // arrancado sai e o jogo corre noutro grupo (o `wineserver`): sem a
      // marca, a sessão — e o tempo jogado — acabaria a meio.
      processMatch: basename(game.executablePath),
    });
    if (!outcome.ok) {
      return { ok: false, reasonKey: outcome.reasonKey };
    }

    // Presença: com conta, os amigos vêem o jogo a correr — e vêem-no
    // acabar quando a sessão acaba. O token vive só dentro da sessão.
    // O atalho do overlay (Shift+Tab) só existe enquanto há jogo a correr:
    // registá-lo sem jogo seria tomar um atalho do sistema sem motivo.
    if (!globalShortcut.isRegistered('Shift+Tab')) {
      registerOverlayShortcut();
    }
    setCurrentGame({ title: game.title, startedAt: outcome.session.startedAt });
    setWidgetSession({ title: game.title, startedAt: outcome.session.startedAt });

    const sessionEnd = runner.wait(outcome.session.sessionId);
    if (typeof launchToken === 'string' && launchToken !== '') {
      startSessionPresence(launchToken, game.externalKey, sessionEnd);
    }

    // O tempo jogado é gravado quando a sessão termina — incluindo o código
    // de saída, para que um crash não seja confundido com uma sessão normal.
    void sessionEnd.then((summary) => {
      // O jogo acabou: o overlay perde o jogo em curso e o atalho sai.
      setCurrentGame(null);
      setWidgetSession(null);
      unregisterOverlayShortcut();
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

  // Abrir um URL no browser do sistema (usado pelas ligações de compra da
  // loja: a compra acontece na loja oficial, fora do launcher).
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string') {
      return { ok: false };
    }
    // Só passam dois esquemas: `http(s)` (as lojas oficiais) e `steam://`
    // (o protocolo que o cliente da Steam registou no sistema — o handoff
    // para o launcher oficial). Nada mais: um `file://` ou um esquema
    // desconhecido nunca é aberto pelo processo principal.
    const allowed =
      url.startsWith('https://') || url.startsWith('http://') || url.startsWith('steam://rungameid/');
    if (!allowed) {
      return { ok: false };
    }
    await openExternal(url);
    return { ok: true };
  });

  // Lista de desejos: exige conta (o token vem da sessão do renderer).
  ipcMain.handle('wishlist:list', async (_event, token: unknown) => apiCall('GET', '/api/v1/wishlist', token));

  ipcMain.handle('wishlist:add', async (_event, gameId: unknown, token: unknown) => {
    if (typeof gameId !== 'string' || gameId === '') {
      return { ok: false, message: 'Jogo em falta.' };
    }
    return apiCall('POST', `/api/v1/wishlist/${encodeURIComponent(gameId)}`, token);
  });

  ipcMain.handle('wishlist:remove', async (_event, gameId: unknown, token: unknown) => {
    if (typeof gameId !== 'string' || gameId === '') {
      return { ok: false, message: 'Jogo em falta.' };
    }
    return apiCall('DELETE', `/api/v1/wishlist/${encodeURIComponent(gameId)}`, token);
  });

  // Atalho de desktop: só Linux (noutros sistemas, recusa com motivo).
  ipcMain.handle('shortcuts:create', (_event, id: unknown) => {
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
    if (process.platform !== 'linux') {
      return { ok: false, reasonKey: 'unsupported-platform' };
    }
    if (game.executablePath === null || game.installPath === null) {
      return { ok: false, reasonKey: 'not-installed' };
    }
    const result = installDesktopShortcut(
      { name: game.title, exec: game.executablePath, icon: game.cover ?? undefined },
      join(app.getPath('home'), '.local', 'share', 'applications'),
    );
    return result.ok ? { ok: true, path: result.path } : { ok: false, reasonKey: 'write-failed' };
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
    // O GameMode é o tweak de desempenho que se pode aplicar sem privilégios:
    // detectado, não presumido. Sem ele, o plano de arranque não muda.
    gameModePath: findGameMode(),
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
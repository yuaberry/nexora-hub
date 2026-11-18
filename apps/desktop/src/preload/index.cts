import type {
  AppInfoView,
  DesktopApi,
  DesktopGameView,
  DetectedFolders,
  DiskUsageView,
  ImportResultView,
  LaunchResultView,
  LibraryGames,
  RunningSessions,
  SessionSummaryView,
} from '../shared/preload-api.js';

/**
 * Preload do NEXORA HUB.
 *
 * Compilado para CommonScript (`.cts` → `.cjs`) porque `sandbox: true` exige.
 * Expõe **apenas** a fronteira declarada em `shared/preload-api.ts`: nenhum
 * Node, nenhum caminho de ficheiro, nenhum `fs`. O renderer recebe objectos
 * de vista — nunca registos da base de dados.
 *
 * `verbatimModuleSyntax` proíbe `import` de valores num ficheiro CommonJS:
 * por isso o Electron entra por `require`, e só os **tipos** são importados.
 */

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const api: DesktopApi = {
  app: () => ipcRenderer.invoke('app:info') as Promise<AppInfoView>,
  library: {
    list: () => ipcRenderer.invoke('library:list') as Promise<LibraryGames>,
    importFolder: () => ipcRenderer.invoke('library:importFolder') as Promise<ImportResultView>,
    detectFolders: () => ipcRenderer.invoke('library:detectFolders') as Promise<DetectedFolders>,
    toggleFavorite: (id) => ipcRenderer.invoke('library:toggleFavorite', id) as Promise<DesktopGameView | null>,
    remove: (id) => ipcRenderer.invoke('library:remove', id) as Promise<boolean>,
  },
  runner: {
    launch: (id) => ipcRenderer.invoke('runner:launch', id) as Promise<LaunchResultView>,
    running: () => ipcRenderer.invoke('runner:running') as Promise<RunningSessions>,
    stop: (sessionId) => ipcRenderer.invoke('runner:stop', sessionId) as Promise<SessionSummaryView | null>,
  },
  storage: {
    usage: () => ipcRenderer.invoke('storage:usage') as Promise<DiskUsageView>,
  },
};

contextBridge.exposeInMainWorld('nexora', api);
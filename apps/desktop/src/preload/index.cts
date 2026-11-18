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
  SourceOperationResult,
  SourceSearchHit,
  SourceView,
  DownloadTaskView,
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
  sources: {
    installFile: () => ipcRenderer.invoke('sources:installFile') as Promise<SourceOperationResult>,
    installPath: (manifestPath) => ipcRenderer.invoke('sources:installPath', manifestPath) as Promise<SourceOperationResult>,
    list: () => ipcRenderer.invoke('sources:list') as Promise<readonly SourceView[]>,
    search: (query, limit) => ipcRenderer.invoke('sources:search', query, limit) as Promise<readonly SourceSearchHit[]>,
    remove: (sourceId) => ipcRenderer.invoke('sources:remove', sourceId) as Promise<boolean>,
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list') as Promise<readonly DownloadTaskView[]>,
    add: (unifiedId, destinationRoot) => ipcRenderer.invoke('downloads:add', unifiedId, destinationRoot) as Promise<SourceOperationResult>,
    pause: (taskId) => ipcRenderer.invoke('downloads:pause', taskId) as Promise<boolean>,
    resume: (taskId) => ipcRenderer.invoke('downloads:resume', taskId) as Promise<boolean>,
    cancel: (taskId) => ipcRenderer.invoke('downloads:cancel', taskId) as Promise<boolean>,
  },
};

contextBridge.exposeInMainWorld('nexora', api);
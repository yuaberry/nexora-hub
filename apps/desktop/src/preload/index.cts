import type {
  AppInfoView,
  CollectionView,
  DesktopApi,
  ScanResultView,
  ShortcutResultView,
  StoreCatalogResult,
  WishlistItemView,
  DesktopGameView,
  DetectedFolders,
  DiskUsageView,
  DownloadsListView,
  ImportResultView,
  LaunchResultView,
  ProtonRatingView,
  LibraryGames,
  RunningSessions,
  SaveSnapshotView,
  SessionSummaryView,
  SourceOperationResult,
  SourceSearchHit,
  SourceView,
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
  collections: {
    create: (name) => ipcRenderer.invoke('collections:create', name) as Promise<CollectionView | null>,
    list: () => ipcRenderer.invoke('collections:list') as Promise<readonly CollectionView[]>,
    add: (collectionId, gameKey) => ipcRenderer.invoke('collections:add', collectionId, gameKey) as Promise<boolean>,
    remove: (collectionId, gameKey) => ipcRenderer.invoke('collections:remove', collectionId, gameKey) as Promise<boolean>,
    delete: (collectionId) => ipcRenderer.invoke('collections:delete', collectionId) as Promise<boolean>,
    games: (collectionId) => ipcRenderer.invoke('collections:games', collectionId) as Promise<readonly string[]>,
  },
  shortcuts: {
    create: (gameId) => ipcRenderer.invoke('shortcuts:create', gameId) as Promise<ShortcutResultView>,
  },
  scan: {
    disks: () => ipcRenderer.invoke('library:scan') as Promise<ScanResultView>,
  },
  shell: {
    // Abrir no browser do sistema: a compra acontece na loja oficial, fora
    // do launcher. O processo principal decide — o renderer não abre URLs.
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  },
  store: {
    catalog: (query, platform, hideAdult) => ipcRenderer.invoke('store:catalog', query, platform, hideAdult) as Promise<StoreCatalogResult>,
  },
  wishlist: {
    // A lista de desejos exige conta: o pedido vai com o token da sessão do
    // renderer (nunca com credenciais guardadas no processo principal).
    list: () => ipcRenderer.invoke('wishlist:list') as Promise<{ readonly ok: boolean; readonly items?: readonly WishlistItemView[]; readonly message?: string }>,
    add: (gameId) => ipcRenderer.invoke('wishlist:add', gameId) as Promise<{ readonly ok: boolean; readonly message?: string }>,
    remove: (gameId) => ipcRenderer.invoke('wishlist:remove', gameId) as Promise<{ readonly ok: boolean; readonly message?: string }>,
  },
  saves: {
    create: (gameKey, savePath, label) => ipcRenderer.invoke('saves:create', gameKey, savePath, label) as Promise<SourceOperationResult>,
    list: (gameKey) => ipcRenderer.invoke('saves:list', gameKey) as Promise<readonly SaveSnapshotView[]>,
    restore: (snapshotId, savePath) => ipcRenderer.invoke('saves:restore', snapshotId, savePath) as Promise<SourceOperationResult>,
    remove: (gameKey, snapshotId) => ipcRenderer.invoke('saves:remove', gameKey, snapshotId) as Promise<boolean>,
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list') as Promise<DownloadsListView>,
    add: (unifiedId, destinationRoot) => ipcRenderer.invoke('downloads:add', unifiedId, destinationRoot) as Promise<SourceOperationResult>,
    verify: (unifiedId, installFolder) => ipcRenderer.invoke('downloads:verify', unifiedId, installFolder) as Promise<SourceOperationResult>,
    protonRating: (unifiedId) => ipcRenderer.invoke('downloads:protonRating', unifiedId) as Promise<
      { readonly ok: true; readonly rating: ProtonRatingView; readonly reason: string } | { readonly ok: false; readonly reasonKey: string; readonly reason: string }
    >,
    retryExtract: (unifiedId) => ipcRenderer.invoke('downloads:retryExtract', unifiedId) as Promise<SourceOperationResult>,
    pause: (taskId) => ipcRenderer.invoke('downloads:pause', taskId) as Promise<boolean>,
    resume: (taskId) => ipcRenderer.invoke('downloads:resume', taskId) as Promise<boolean>,
    cancel: (taskId) => ipcRenderer.invoke('downloads:cancel', taskId) as Promise<boolean>,
  },
};

contextBridge.exposeInMainWorld('nexora', api);
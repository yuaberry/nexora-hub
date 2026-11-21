import type {
  AppInfoView,
  CollectionView,
  DesktopApi,
  FamilyResult,
  FamilyGameView,
  OfficialImportResult,
  FriendsListView,
  PresenceView,
  ScanResultView,
  ShortcutResultView,
  ChatConversationView,
  ChatMessageView,
  ChatOpenResult,
  OptimizerScanResult,
  OptimizerRunResult,
  OptimizerHistoryResult,
  BenchmarkRunView,
  TelemetrySampleView,
  SocialWriteResult,
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
    // O token (opcional) liga a presença: com conta, os amigos vêem o jogo a correr.
    launch: (id, token) => ipcRenderer.invoke('runner:launch', id, token) as Promise<LaunchResultView>,
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
    // A importação oficial lê os manifestos das lojas no disco — o caminho
    // é do processo principal, nunca do renderer.
    official: () => ipcRenderer.invoke('library:importOfficial') as Promise<OfficialImportResult>,
    officialAvailable: () => ipcRenderer.invoke('library:officialAvailable') as Promise<{ available: boolean }>,
  },
  shell: {
    // Abrir no browser do sistema: a compra acontece na loja oficial, fora
    // do launcher. O processo principal decide — o renderer não abre URLs.
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  },
  steam: {
    // Handoff para o cliente oficial: o renderer passa o appid, o processo
    // principal constrói o URL e decide abrir.
    open: (appId) => ipcRenderer.invoke('steam:open', appId) as Promise<{ ok: boolean }>,
  },
  store: {
    catalog: (query, platform, hideAdult) => ipcRenderer.invoke('store:catalog', query, platform, hideAdult) as Promise<StoreCatalogResult>,
  },
  wishlist: {
    // A lista de desejos exige conta: o token da sessão do renderer viaja
    // em cada chamada (nunca há credenciais guardadas no principal).
    list: (token) => ipcRenderer.invoke('wishlist:list', token) as Promise<{ readonly ok: boolean; readonly items?: readonly WishlistItemView[]; readonly message?: string }>,
    add: (gameId, token) => ipcRenderer.invoke('wishlist:add', gameId, token) as Promise<{ readonly ok: boolean; readonly message?: string }>,
    remove: (gameId, token) => ipcRenderer.invoke('wishlist:remove', gameId, token) as Promise<{ readonly ok: boolean; readonly message?: string }>,
  },
  family: {
    // O grupo familiar exige conta: o token viaja do renderer, como na
    // lista de desejos. O servidor é o dono das regras (limite de plano,
    // convites, papéis) — o launcher só as mostra.
    get: (token) => ipcRenderer.invoke('family:get', token) as Promise<FamilyResult>,
    create: (name, token) => ipcRenderer.invoke('family:create', name, token) as Promise<FamilyResult>,
    invite: (email, token) => ipcRenderer.invoke('family:invite', email, token) as Promise<FamilyResult>,
    accept: (code, token) => ipcRenderer.invoke('family:accept', code, token) as Promise<FamilyResult>,
    decline: (code, token) => ipcRenderer.invoke('family:decline', code, token) as Promise<FamilyResult>,
    remove: (userId, token) => ipcRenderer.invoke('family:remove', userId, token) as Promise<FamilyResult>,
    dissolve: (token) => ipcRenderer.invoke('family:dissolve', token) as Promise<FamilyResult>,
    games: (token) => ipcRenderer.invoke('family:games', token) as Promise<{ readonly ok: boolean; readonly items?: readonly FamilyGameView[]; readonly total?: number; readonly message?: string }>,
  },
  saves: {
    create: (gameKey, savePath, label) => ipcRenderer.invoke('saves:create', gameKey, savePath, label) as Promise<SourceOperationResult>,
    list: (gameKey) => ipcRenderer.invoke('saves:list', gameKey) as Promise<readonly SaveSnapshotView[]>,
    restore: (snapshotId, savePath) => ipcRenderer.invoke('saves:restore', snapshotId, savePath) as Promise<SourceOperationResult>,
    remove: (gameKey, snapshotId) => ipcRenderer.invoke('saves:remove', gameKey, snapshotId) as Promise<boolean>,
  },
  telemetry: {
    sample: () => ipcRenderer.invoke('telemetry:sample') as Promise<TelemetrySampleView>,
    reset: () => ipcRenderer.invoke('telemetry:reset') as Promise<{ ok: boolean }>,
  },
  friends: {
    list: (token) => ipcRenderer.invoke('friends:list', token) as Promise<FriendsListView>,
    request: (email, token) => ipcRenderer.invoke('friends:request', email, token) as Promise<SocialWriteResult>,
    respond: (requestId, action, token) => ipcRenderer.invoke('friends:respond', requestId, action, token) as Promise<SocialWriteResult>,
    remove: (userId, token) => ipcRenderer.invoke('friends:remove', userId, token) as Promise<SocialWriteResult>,
    presence: (token) => ipcRenderer.invoke('friends:presence', token) as Promise<PresenceView>,
    heartbeat: (gameId, token) => ipcRenderer.invoke('friends:heartbeat', gameId, token) as Promise<SocialWriteResult>,
  },
  benchmark: {
    run: () => ipcRenderer.invoke('benchmark:run') as Promise<{ readonly ok: boolean; readonly run?: BenchmarkRunView }>,
    history: () => ipcRenderer.invoke('benchmark:history') as Promise<{ readonly ok: boolean; readonly runs: readonly BenchmarkRunView[] }>,
  },
  chat: {
    list: (token) => ipcRenderer.invoke('chat:list', token) as Promise<{ readonly ok: boolean; readonly items?: readonly ChatConversationView[]; readonly message?: string }>,
    open: (email, token) => ipcRenderer.invoke('chat:open', email, token) as Promise<ChatOpenResult>,
    messages: (conversationId, token) => ipcRenderer.invoke('chat:messages', conversationId, token) as Promise<{ readonly ok: boolean; readonly items?: readonly ChatMessageView[]; readonly message?: string }>,
    send: (conversationId, body, token) => ipcRenderer.invoke('chat:send', conversationId, body, token) as Promise<{ readonly ok: boolean; readonly item?: ChatMessageView; readonly message?: string }>,
  },
  optimizer: {
    scan: (targetIds) => ipcRenderer.invoke('optimizer:scan', targetIds) as Promise<OptimizerScanResult>,
    clean: (targetIds) => ipcRenderer.invoke('optimizer:clean', targetIds) as Promise<OptimizerRunResult>,
    history: () => ipcRenderer.invoke('optimizer:history') as Promise<OptimizerHistoryResult>,
    restore: (runId) => ipcRenderer.invoke('optimizer:restore', runId) as Promise<{ ok: boolean; message?: string }>,
    gameMode: () => ipcRenderer.invoke('optimizer:gamemode') as Promise<{ available: boolean; path: string | null }>,
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
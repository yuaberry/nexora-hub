/**
 * Contrato entre o renderer e o processo principal.
 *
 * Este ficheiro é a **fronteira**: o renderer nunca toca em Node, em ficheiros
 * nem em processos — fala com `window.nexora`, e o preload expõe exactamente
 * o que está aqui. O processo principal valida cada argumento: o que vem do
 * renderer é tratado como entrada externa, não como código de confiança.
 *
 * Nenhum método promete o que não existe: não há downloads, saves na nuvem,
 * amigos ou overlay nesta fase — esses são só tipos.
 */

/** Uma entrada da biblioteca local (vista do renderer). */
export interface DesktopGameView {
  readonly id: string;
  /** Caminho normalizado da pasta instalada (identificador estável do jogo). */
  readonly externalKey: string;
  readonly title: string;
  readonly cover: string | null;
  readonly installPath: string;
  readonly executablePath: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  /** ISO-8601 UTC da última sessão, ou `null`. */
  readonly lastPlayedAt: string | null;
  /** Tempo jogado total, em segundos. */
  readonly totalSeconds: number;
}

/** Uso de disco do volume onde os jogos estão. */
export interface DiskUsageView {
  /** Capacidade total do volume, em bytes (0 = desconhecida). */
  readonly totalBytes: number;
  /** Espaço livre, em bytes. */
  readonly freeBytes: number;
  /** Espaço ocupado pelas pastas de jogo da biblioteca, em bytes. */
  readonly gamesBytes: number;
}

/** Resultado de um pedido de arranque. */
export type LaunchResultView =
  | { readonly ok: true; readonly sessionId: string; readonly gameId: string; readonly startedAt: string }
  | { readonly ok: false; readonly reasonKey: LaunchRefusalKey };

/** Motivos de recusa de arranque — chaves de tradução, não texto solto. */
export type LaunchRefusalKey = 'missing-executable' | 'already-running' | 'not-found' | 'no-runner';

/** Resumo de uma sessão em curso. */
export interface SessionSummaryView {
  readonly sessionId: string;
  readonly gameId: string;
  readonly startedAt: string;
  readonly durationSeconds: number;
  readonly crashed: boolean;
}

/** Resultado de uma importação de pasta. */
export interface ImportResultView {
  /** Títulos importados ou actualizados. */
  readonly imported: readonly string[];
  /** Pastas ignoradas, com o motivo. */
  readonly skipped: readonly { readonly path: string; readonly reasonKey: 'no-executable' | 'cancelled' | 'unreadable' }[];
}

/** Pastas candidatas detectadas automaticamente. */
export interface DetectedFolderView {
  readonly path: string;
  /** Nome legível da pasta (para exibir antes de importar). */
  readonly label: string;
}

/** Informações do executável (diagnóstico honesto, nunca fingido). */
export interface AppInfoView {
  readonly platform: string;
  readonly versions: {
    readonly app: string;
    readonly electron: string;
    readonly chrome: string;
    readonly node: string;
  };
  /** `true` no executável, `false` no browser. */
  readonly desktop: boolean;
}

/** Alias de listas devolvidas pelo IPC (usados nos dois lados da fronteira). */
export type LibraryGames = readonly DesktopGameView[];
export type DetectedFolders = readonly DetectedFolderView[];
export type RunningSessions = readonly SessionSummaryView[];

/** Uma fonte instalada (vista do renderer). */
export interface SourceView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly origin: string;
  readonly installedAt: string;
  readonly legal: {
    readonly basis: string;
    readonly attestedBy: string;
    readonly attestedAt: string;
  };
  readonly games: number;
}

/** Um resultado da pesquisa no catálogo unificado. */
export interface SourceSearchHit {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly match:
    | 'alias-exact'
    | 'title-exact'
    | 'prefix'
    | 'syllable'
    | 'consonant-prefix'
    | 'fuzzy';
  /** `false` quando o jogo só existe por torrent (transporte planeado). */
  readonly available: boolean;
  /** `true` quando o jogo precisa do launcher oficial (handoff). */
  readonly launcherRequired: boolean;
  /** App id da Steam declarado pelo manifesto (para ProtonDB), ou `null`. */
  readonly steamAppId: string | null;
}

/** Uma tarefa de download (vista do renderer). */
export interface DownloadTaskView {
  readonly taskId: string;
  readonly gameId: string;
  readonly url: string;
  readonly destinationPath: string;
  readonly state: 'queued' | 'downloading' | 'paused' | 'verifying' | 'completed' | 'failed';
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
  readonly bytesPerSecond: number;
  readonly attempts: number;
  readonly error: string | null;
  readonly verified: boolean;
}

/** Resultado de uma operação de fonte/download. */
export interface SourceOperationResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly sourceId?: string;
  readonly taskIds?: readonly string[];
}

/** Um snapshot de saves (vista do renderer). */
export interface SaveSnapshotView {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
  readonly sizeBytes: number;
  readonly revision: number;
  readonly checksum: string;
}

/** Uma colecção de jogos (vista do renderer). */
export interface CollectionView {
  readonly id: number;
  readonly name: string;
  readonly count: number;
}

/** Resultado da criação de um atalho de desktop. */
export type ShortcutResultView =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reasonKey: string };

/** Resultado do scan de disco. */
export interface ScanResultView {
  readonly imported: readonly string[];
  readonly scanned: number;
}

/** Um rating do ProtonDB (dado externo, com data da consulta). */
export interface ProtonRatingView {
  readonly tier: string;
  readonly confidence: string;
  readonly score: number;
  readonly total: number;
  readonly fetchedAt: string;
  readonly sourceUrl: string;
}

/** Estado da fila de downloads (tarefas + erros de extracção por jogo). */
export interface DownloadsListView {
  readonly tasks: readonly DownloadTaskView[];
  /** Motivos de extracção falhada, por id unificado do jogo. */
  readonly extractionErrors: Readonly<Record<string, string>>;
}

/** Um jogo no directório da loja (vista do renderer). */
export interface StoreGameView {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tagline: string;
  readonly cover: string | null;
  readonly platforms: readonly string[];
  readonly adult: boolean;
  readonly tags: readonly string[];
  readonly links: readonly {
    readonly store: string;
    readonly url: string;
    readonly price: number | null;
    readonly currency: string | null;
  }[];
}

/** Resultado da consulta ao directório. */
export interface StoreCatalogResult {
  readonly ok: boolean;
  readonly items?: readonly StoreGameView[];
  readonly total?: number;
  readonly message?: string;
}

/** Um item da lista de desejos. */
export interface WishlistItemView {
  readonly gameId: string;
  readonly addedAt: string;
}

/** A API exposta pelo preload em `window.nexora`. */
export interface DesktopApi {
  /** Diagnóstico do executável (assíncrono: a versão vive no main). */
  readonly app: () => Promise<AppInfoView>;
  readonly collections: {
    readonly create: (name: string) => Promise<CollectionView | null>;
    readonly list: () => Promise<readonly CollectionView[]>;
    readonly add: (collectionId: number, gameKey: string) => Promise<boolean>;
    readonly remove: (collectionId: number, gameKey: string) => Promise<boolean>;
    readonly delete: (collectionId: number) => Promise<boolean>;
    readonly games: (collectionId: number) => Promise<readonly string[]>;
  };
  readonly shell: {
    /** Abre um URL no browser do sistema (usado pelas ligações de compra). */
    readonly openExternal: (url: string) => Promise<void>;
  };
  readonly store: {
    /** Catálogo público (não exige conta — a API é pública). */
    readonly catalog: (query?: string, platform?: string, hideAdult?: boolean) => Promise<StoreCatalogResult>;
  };
  readonly wishlist: {
    /** Lista de desejos (exige conta — vai nas credenciais da sessão). */
    readonly list: () => Promise<{ readonly ok: boolean; readonly items?: readonly WishlistItemView[]; readonly message?: string }>;
    readonly add: (gameId: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
    readonly remove: (gameId: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
  };
  readonly shortcuts: {
    readonly create: (gameId: string) => Promise<ShortcutResultView>;
  };
  readonly scan: {
    readonly disks: () => Promise<ScanResultView>;
  };
  readonly library: {
    readonly list: () => Promise<readonly DesktopGameView[]>;
    readonly importFolder: () => Promise<ImportResultView>;
    readonly detectFolders: () => Promise<readonly DetectedFolderView[]>;
    readonly toggleFavorite: (id: string) => Promise<DesktopGameView | null>;
    readonly remove: (id: string) => Promise<boolean>;
  };
  readonly runner: {
    readonly launch: (id: string) => Promise<LaunchResultView>;
    readonly running: () => Promise<readonly SessionSummaryView[]>;
    readonly stop: (sessionId: string) => Promise<SessionSummaryView | null>;
  };
  readonly storage: {
    readonly usage: () => Promise<DiskUsageView>;
  };
  readonly sources: {
    /** Instala um manifesto `.json` escolhido pelo utilizador. */
    readonly installFile: () => Promise<SourceOperationResult>;
    /** Instala um manifesto de um caminho conhecido (automação/CI). */
    readonly installPath: (manifestPath: string) => Promise<SourceOperationResult>;
    readonly list: () => Promise<readonly SourceView[]>;
    readonly search: (query: string, limit?: number) => Promise<readonly SourceSearchHit[]>;
    readonly remove: (sourceId: string) => Promise<boolean>;
  };
  readonly saves: {
    /** Cria um snapshot da pasta de saves de um jogo. */
    readonly create: (gameKey: string, savePath: string, label: string) => Promise<SourceOperationResult>;
    readonly list: (gameKey: string) => Promise<readonly SaveSnapshotView[]>;
    readonly restore: (snapshotId: string, savePath: string) => Promise<SourceOperationResult>;
    readonly remove: (gameKey: string, snapshotId: string) => Promise<boolean>;
  };
  readonly downloads: {
    readonly list: () => Promise<DownloadsListView>;
    readonly add: (unifiedId: string, destinationRoot: string) => Promise<SourceOperationResult>;
    /** Verifica os ficheiros instalados contra o checksum do manifesto. */
    readonly verify: (unifiedId: string, destinationRoot: string) => Promise<SourceOperationResult>;
    /** Rating do ProtonDB (só quando o manifesto declara o app id). */
    readonly protonRating: (unifiedId: string) => Promise<
      | { readonly ok: true; readonly rating: ProtonRatingView; readonly reason: string }
      | { readonly ok: false; readonly reasonKey: string; readonly reason: string }
    >;
    /** Retenta a extracção automática de um jogo. */
    readonly retryExtract: (unifiedId: string) => Promise<SourceOperationResult>;
    readonly pause: (taskId: string) => Promise<boolean>;
    readonly resume: (taskId: string) => Promise<boolean>;
    readonly cancel: (taskId: string) => Promise<boolean>;
  };
}

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    /** Ausente no browser (a web não tem acesso local). */
    readonly nexora?: DesktopApi;
  }
}

/** `true` quando o código corre dentro do executável de desktop. */
export function isDesktopRuntime(): boolean {
  return typeof globalThis !== 'undefined' && globalThis.window?.nexora !== undefined;
}
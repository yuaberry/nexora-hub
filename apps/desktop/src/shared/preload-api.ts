/**
 * Contrato entre o renderer e o processo principal.
 *
 * Este ficheiro é a **fronteira**: o renderer nunca toca em Node, em ficheiros
 * nem em processos — fala com `window.nexora`, e o preload expõe exactamente
 * o que está aqui. O processo principal valida cada argumento: o que vem do
 * renderer é tratado como entrada externa, não como código de confiança.
 *
 * Nenhum método promete o que não existe: o que não existe leva o selo
 * "Planeado" na interface, nunca um botão que finge funcionar.
 */

import type { SteamAppSummary } from '@nexora/core';

/** Uma DLC conhecida (nome da loja) e se está no disco do utilizador. */
export interface DlcView {
  readonly appId: string;
  readonly title: string;
  readonly kind: string;
  readonly free: boolean;
  /** `true` quando a pasta do appid existe numa biblioteca da Steam. */
  readonly installed: boolean;
}

/** Uma entrada da biblioteca local (vista do renderer). */
export interface DesktopGameView {
  readonly id: string;
  /** Caminho normalizado da pasta instalada (identificador estável do jogo). */
  readonly externalKey: string;
  readonly title: string;
  readonly cover: string | null;
  /** `null` quando a entrada veio do catálogo (o jogo não está instalado). */
  readonly installPath: string | null;
  /** `null` quando não há executável conhecido. */
  readonly executablePath: string | null;
  /** Appid da Steam, quando o jogo veio de um manifesto da loja. */
  readonly steamAppId: string | null;
  /** `false` quando não há executável: só há metadado (entrada de catálogo). */
  readonly installed: boolean;
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
export type LaunchRefusalKey = 'missing-executable' | 'already-running' | 'not-found' | 'no-runner' | 'not-installed';

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

/** Uma loja verificada na importação oficial. */
export interface OfficialStoreReportView {
  /** Identificador da loja (`steam`, `epic`, `gog`). */
  readonly store: string;
  /** Chave de tradução do nome da loja. */
  readonly labelKey: string;
  /** Títulos importados ou actualizados. */
  readonly titles: readonly string[];
  /** Ficheiros ignorados (ferramentas, pastas em falta, manifestos partidos). */
  readonly skipped: number;
  /** Motivo quando a loja não deu nada. */
  readonly reasonKey?: string;
}

/** Resultado da importação oficial. */
export interface OfficialImportResult {
  readonly ok: boolean;
  readonly imported?: readonly string[];
  readonly scanned?: number;
  readonly stores?: readonly OfficialStoreReportView[];
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

/** Um membro do grupo familiar (vista do renderer). */
export interface FamilyMemberView {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly role: 'owner' | 'adult' | 'member';
  readonly joinedAt: string;
}

/** Um convite do grupo. */
export interface FamilyInviteView {
  readonly id: string;
  readonly email: string;
  /** Código a partilhar com quem foi convidado. */
  readonly code: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'expired';
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Um benefício do plano (o que ainda não existe vem com `available: false`). */
export interface FamilyBenefitItemView {
  readonly labelKey: string;
  readonly value: string;
  readonly available: boolean;
}

/** Limites e benefícios do plano da conta. */
export interface FamilyPlanView {
  readonly id: string;
  readonly maxMembers: number | null;
  readonly remainingSlots: number | null;
  readonly benefits: readonly FamilyBenefitItemView[];
}

/** O grupo familiar da conta. */
export interface FamilyView {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly plan: {
    readonly id: string;
    readonly maxMembers: number | null;
    readonly remainingSlots: number | null;
    readonly benefits: readonly FamilyBenefitItemView[];
  };
  readonly members: readonly FamilyMemberView[];
  readonly invites: readonly FamilyInviteView[];
}

/** Um jogo na biblioteca partilhada. */
export interface FamilyGameView {
  readonly externalKey: string;
  readonly title: string;
  readonly owners: readonly { readonly userId: string; readonly displayName: string | null }[];
}

/** Resultado das operações da família. */
export interface FamilyResult {
  readonly ok: boolean;
  /** O grupo depois da operação (`null` quando a pessoa não tem grupo). */
  readonly group?: FamilyView | null;
  /** Limites do plano da conta (vêm sempre, com ou sem grupo). */
  readonly plan?: FamilyPlanView;
  /** Convite criado (o código é o que se partilha). */
  readonly code?: string;
  readonly email?: string;
  readonly expiresAt?: string;
  readonly message?: string;
}

/** Um amigo (vista do renderer). */
export interface FriendView {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly since: string;
}

/** Um pedido de amizade. */
export interface FriendRequestView {
  readonly id: string;
  /** O outro lado do pedido (quem enviou, ou para quem foi enviado). */
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly createdAt: string;
}

/** O que a rota de amigos devolve. */
export interface FriendsListView {
  readonly ok: boolean;
  readonly friends?: readonly FriendView[];
  readonly incoming?: readonly FriendRequestView[];
  readonly outgoing?: readonly FriendRequestView[];
  readonly message?: string;
}

/** O que a rota de presença devolve. */
export interface PresenceView {
  readonly ok: boolean;
  /** A minha presença (para a página mostrar o que estou a partilhar). */
  readonly self?: { readonly status: 'online' | 'offline'; readonly gameId: string | null };
  /** Amigos online — só amigos, com o jogo em curso quando estão a jogar. */
  readonly friends?: readonly { readonly userId: string; readonly displayName: string | null; readonly gameId: string | null; readonly at: string }[];
  readonly ttlSeconds?: number;
  readonly message?: string;
}

/** Resultado de uma escrita social. */
export interface SocialWriteResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly status?: string;
  readonly userId?: string;
  readonly code?: string;
}

/** Uma leitura de temperatura (vista do renderer). */
export interface TemperatureReadingView {
  /** Chip do sensor (`coretemp`, `dell_smm`…). */
  readonly chip: string;
  /** Rótulo do sensor, ou `null`. */
  readonly label: string | null;
  readonly celsius: number;
}

/** Uma amostra do sistema (CPU, memória, carga, temperaturas). */
export interface TelemetrySampleView {
  /** Uso da CPU desde a amostra anterior (`null` na primeira). */
  readonly cpuPercent: number | null;
  /** Percentagem de memória em uso. */
  readonly memoryPercent: number | null;
  /** Carga média de 1 minuto, ou `null`. */
  readonly loadAverage: number | null;
  /** Sensores de temperatura, do mais quente para o mais frio. */
  readonly temperatures: readonly TemperatureReadingView[];
  /** ISO-8601 UTC da leitura. */
  readonly at: string;
}

/** O que um alvo tem para limpar (vista do renderer). */
export interface OptimizerTargetScanView {
  readonly targetId: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/** Resultado de uma varredura. */
export interface OptimizerScanResult {
  readonly ok: boolean;
  readonly items?: readonly OptimizerTargetScanView[];
  readonly totalBytes?: number;
  readonly fileCount?: number;
  readonly message?: string;
}

/** Resultado de uma limpeza. */
export interface OptimizerRunResult {
  readonly ok: boolean;
  readonly freedBytes?: number;
  readonly removed?: number;
  readonly failures?: number;
  readonly runId?: string;
  readonly message?: string;
}

/** Uma execução no histórico. */
export interface OptimizerRunView {
  readonly id: string;
  readonly at: string;
  readonly freedBytes: number;
  readonly removed: number;
  readonly failures: number;
  readonly restored: boolean;
}

/** Resultado da leitura do histórico. */
export interface OptimizerHistoryResult {
  readonly ok: boolean;
  readonly runs?: readonly OptimizerRunView[];
  readonly message?: string;
}

/** Uma conversa directa (vista do renderer). */
export interface ChatConversationView {
  readonly id: string;
  /** O outro lado da conversa. */
  readonly other: {
    readonly userId: string;
    readonly displayName: string | null;
    readonly email: string | null;
  };
  /** ISO-8601 UTC da última mensagem, ou `null`. */
  readonly lastMessageAt: string | null;
  /** Excerto da última mensagem, ou `null`. */
  readonly lastMessageExcerpt: string | null;
  readonly createdAt: string;
}

/** Uma mensagem (vista do renderer). */
export interface ChatMessageView {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: string;
  /** `true` quando a mensagem é minha. */
  readonly mine: boolean;
}

/** Resultado da abertura de uma conversa. */
export interface ChatOpenResult {
  readonly ok: boolean;
  readonly id?: string;
  readonly message?: string;
}

/** O progresso de uma conquista (vista do renderer). */
export interface AchievementProgressView {
  readonly id: string;
  readonly labelKey: string;
  readonly hintKey: string;
  readonly target: number;
  readonly value: number;
  /** Progresso entre 0 e 1. */
  readonly progress: number;
  readonly unlocked: boolean;
  readonly points: number;
  /** Quantos jogadores têm a conquista. */
  readonly holders: number;
}

/** Uma entrada do livro de pontos. */
export interface PointEntryView {
  readonly id: string;
  readonly delta: number;
  /** Motivo (`achievement.<id>`). */
  readonly reason: string;
  readonly entityId: string | null;
  readonly createdAt: string;
}

/** O resultado de uma carga (vista do renderer). */
export interface BenchmarkResultView {
  readonly workloadId: string;
  /** Tempo medido, em milissegundos. */
  readonly elapsedMs: number;
  readonly score: number;
  /** `false` quando a carga não correu (nada de número fingido). */
  readonly measured: boolean;
}

/** Uma corrida do benchmark. */
export interface BenchmarkRunView {
  /** ISO-8601 UTC da corrida. */
  readonly at: string;
  /** Pontuação global, ou `null` quando nada foi medido. */
  readonly overall: number | null;
  readonly results: readonly BenchmarkResultView[];
}

/** Um modo detectado (vista do renderer). */
export interface ModView {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly loader: 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'unknown';
  readonly displayName: string | null;
  readonly version: string | null;
}

/** O que a varredura de modos devolve. */
export interface ModsScanView {
  /** A pasta de modos encontrada (`null` quando o jogo não tem). */
  readonly folder: string | null;
  readonly total: number;
  /** Quantidade por carregador. */
  readonly byLoader: readonly { readonly loader: string; readonly count: number }[];
  /** Arquivos sem marcador conhecido. */
  readonly unknown: number;
  readonly totalBytes: number;
  readonly mods: readonly ModView[];
}

/** Uma recomendação (vista do renderer). */
export interface RecommendationItemView {
  readonly gameId: string;
  readonly title: string;
  readonly tagline: string;
  readonly platforms: readonly string[];
  readonly adult: boolean;
  /** Pontuação da semelhança (0 a 1 nos parecidos; ponderada nos pessoais). */
  readonly score: number;
  /** As etiquetas partilhadas — a razão da recomendação. */
  readonly sharedTags: readonly string[];
}

/** O que a rota de recomendações devolve. */
export interface RecommendationsView {
  readonly ok: boolean;
  readonly items?: readonly RecommendationItemView[];
  /** A razão da recomendação (`library-tags`, `no-library`). */
  readonly reason?: string;
  readonly message?: string;
}

/** Os dados que o processo principal empurra para o overlay. */
export interface OverlayData {
  /** Uso da CPU desde a amostra anterior (`null` na primeira). */
  readonly cpuPercent: number | null;
  /** Percentagem de memória em uso. */
  readonly memoryPercent: number | null;
  /** Temperatura do sensor mais quente, ou `null`. */
  readonly temperatureCelsius: number | null;
  /** Chip do sensor mais quente (com o rótulo), ou `null`. */
  readonly temperatureChip: string | null;
  /** Jogo em curso, ou `null`. */
  readonly gameTitle: string | null;
  /** Segundos desde o início da sessão, ou `null`. */
  readonly elapsedSeconds: number | null;
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
  readonly steam: {
    /**
     * Abre um jogo no **cliente oficial** da Steam, pelo appid.
     *
     * É o handoff legítimo: o jogo corre pela loja, com a licença do
     * utilizador, o Proton escolhido por ela e os servidores oficiais.
     * `ok: false` quando o jogo não tem appid da Steam.
     */
    readonly open: (appId: string) => Promise<{ readonly ok: boolean }>;
    /** Sincroniza a biblioteca com o que a Steam tem agora. */
    readonly sync: () => Promise<{
      readonly ok: boolean;
      readonly updated?: number;
      readonly added?: number;
      readonly unchanged?: number;
      readonly titles?: readonly string[];
      readonly message?: string;
    }>;
    /** As imagens que a Steam guardou para um jogo (para escolher entre elas). */
    readonly coverOptions: (gameId: string) => Promise<{
      readonly ok: boolean;
      readonly options?: readonly { readonly path: string; readonly label: string }[];
      readonly message?: string;
    }>;
    /**
     * Os detalhes de um AppID na loja pública (nome, tipo, gratuito, DLCs).
     *
     * É a procura pelo AppID: o utilizador cola o número, a loja diz que jogo
     * é — e a entrada pode ser guardada na biblioteca local.
     */
    readonly lookup: (appId: string) => Promise<{
      readonly ok: boolean;
      readonly app?: SteamAppSummary;
      readonly message?: string;
    }>;
    /** A busca por nome na loja pública (para encontrar o AppID). */
    readonly search: (term: string) => Promise<{
      readonly ok: boolean;
      readonly items?: readonly SteamAppSummary[];
      readonly message?: string;
    }>;
    /**
     * As DLCs declaradas por um jogo da biblioteca.
     *
     * Os nomes vêm da loja; `installed` diz se a pasta do appid está no
     * disco. O resultado fica guardado — a página não volta a pedir.
     */
    readonly dlcs: (gameId: string) => Promise<{
      readonly ok: boolean;
      readonly items?: readonly DlcView[];
      readonly truncated?: number;
      readonly message?: string;
    }>;
  };
  readonly friends: {
    /** Amigos, pedidos recebidos e enviados (exige conta). */
    readonly list: (token: string) => Promise<FriendsListView>;
    /** Pede amizade a um email (a pessoa tem de ter conta). */
    readonly request: (email: string, token: string) => Promise<SocialWriteResult>;
    /** Aceita, recusa ou cancela um pedido. */
    readonly respond: (requestId: string, action: 'accept' | 'decline' | 'cancel', token: string) => Promise<SocialWriteResult>;
    /** Remove um amigo (nos dois sentidos). */
    readonly remove: (userId: string, token: string) => Promise<SocialWriteResult>;
    /** Presença minha e dos meus amigos (só amigos aparecem). */
    readonly presence: (token: string) => Promise<PresenceView>;
    /** Bate o coração da presença (o jogo em curso pode ser `null`). */
    readonly heartbeat: (gameId: string | null, token: string) => Promise<SocialWriteResult>;
  };
  readonly telemetry: {
    /** Uma amostra do sistema (CPU, memória, carga, temperaturas). */
    readonly sample: () => Promise<TelemetrySampleView>;
    /** Esquece a leitura anterior da CPU (a próxima não sabe o uso). */
    readonly reset: () => Promise<{ readonly ok: boolean }>;
  };
  readonly recommend: {
    /** Parecidos com um jogo do directório (público). */
    readonly similar: (gameId: string) => Promise<RecommendationsView>;
    /** Recomendado para si (exige conta). */
    readonly forYou: (token: string) => Promise<RecommendationsView>;
  };
  readonly overlay: {
    /** Assina os dados empurrados pelo processo principal. */
    readonly onData: (listener: (data: OverlayData) => void) => () => void;
    /** O último dado empurrado (`null` antes do primeiro). */
    readonly last: () => OverlayData | null;
    /** Abre ou fecha o overlay (o atalho Shift+Tab faz o mesmo). */
    readonly toggle: () => Promise<{ readonly ok: boolean; readonly visible: boolean }>;
  };
  readonly covers: {
    /**
     * Hidrata as capas com a cápsula pública da loja.
     *
     * Busca a arte vertical (`library_600x900`) pelo appid e guarda-a no
     * disco: a biblioteca fica com a mesma capa em qualquer máquina, e
     * offline a partir da segunda vez. Uma capa escolhida pelo utilizador
     * nunca é substituída.
     */
    readonly hydrate: () => Promise<{
      readonly ok: boolean;
      readonly updated?: number;
      readonly failed?: number;
      readonly skipped?: number;
    }>;
    /** Abre o selector de ficheiro de imagem. */
    readonly pick: () => Promise<{ readonly ok: boolean; readonly path?: string }>;
    /** Define a capa escolhida pelo utilizador. */
    readonly set: (gameId: string, path: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
    /** Volta à capa automática (a da Steam, se existir). */
    readonly reset: (gameId: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
  };
  readonly mods: {
    /** Procura os modos na pasta de instalação de um jogo. */
    readonly scan: (installPath: string) => Promise<ModsScanView>;
  };
  readonly benchmark: {
    /** Corre o benchmark completo e guarda a corrida. */
    readonly run: () => Promise<{ readonly ok: boolean; readonly run?: BenchmarkRunView }>;
    /** O histórico das corridas. */
    readonly history: () => Promise<{ readonly ok: boolean; readonly runs: readonly BenchmarkRunView[] }>;
  };
  readonly chat: {
    /** As minhas conversas, da mais recente para a mais antiga. */
    readonly list: (token: string) => Promise<{ readonly ok: boolean; readonly items?: readonly ChatConversationView[]; readonly message?: string }>;
    /** Abre (ou reutiliza) a conversa com alguém, por email. */
    readonly open: (email: string, token: string) => Promise<ChatOpenResult>;
    /** As mensagens de uma conversa. */
    readonly messages: (conversationId: string, token: string) => Promise<{ readonly ok: boolean; readonly items?: readonly ChatMessageView[]; readonly message?: string }>;
    /** Envia uma mensagem. */
    readonly send: (conversationId: string, body: string, token: string) => Promise<{ readonly ok: boolean; readonly item?: ChatMessageView; readonly message?: string }>;
  };
  readonly optimizer: {
    /** Varre os alvos (quanto espaço cada um tem). */
    readonly scan: (targetIds: readonly string[]) => Promise<OptimizerScanResult>;
    /** Limpa os alvos e guarda a execução no histórico. */
    readonly clean: (targetIds: readonly string[]) => Promise<OptimizerRunResult>;
    /** O histórico das execuções. */
    readonly history: () => Promise<OptimizerHistoryResult>;
    /** Aplica o ponto de restauro de uma execução. */
    readonly restore: (runId: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
    /** O GameMode está instalado? (tweak de arranque sem privilégios). */
    readonly gameMode: () => Promise<{ readonly available: boolean; readonly path: string | null }>;
  };
  readonly store: {
    /** Catálogo público (não exige conta — a API é pública). */
    readonly catalog: (query?: string, platform?: string, hideAdult?: boolean) => Promise<StoreCatalogResult>;
  };
  readonly wishlist: {
    /**
     * Lista de desejos (exige conta — o token da sessão viaja do renderer).
     *
     * O token é passado em cada chamada e nunca guardado no processo
     * principal: sem ele, o pedido é recusado antes de sair.
     */
    readonly list: (token: string) => Promise<{ readonly ok: boolean; readonly items?: readonly WishlistItemView[]; readonly message?: string }>;
    readonly add: (gameId: string, token: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
    readonly remove: (gameId: string, token: string) => Promise<{ readonly ok: boolean; readonly message?: string }>;
  };
  readonly family: {
    /**
     * O grupo da conta (ou `null` — a página explica o que falta).
     *
     * O token da sessão viaja do renderer em cada chamada e nunca é
     * guardado no processo principal.
     */
    readonly get: (token: string) => Promise<FamilyResult>;
    /** Cria o grupo com quem pede como dono. */
    readonly create: (name: string, token: string) => Promise<FamilyResult>;
    /** Convida um email (a pessoa tem de ter conta). */
    readonly invite: (email: string, token: string) => Promise<FamilyResult>;
    /** Aceita um convite pelo código. */
    readonly accept: (code: string, token: string) => Promise<FamilyResult>;
    /** Recusa um convite pelo código. */
    readonly decline: (code: string, token: string) => Promise<FamilyResult>;
    /** Remove um membro (ou sai do grupo, quando o membro é o próprio). */
    readonly remove: (userId: string, token: string) => Promise<FamilyResult>;
    /** Dissolve o grupo (só o dono). */
    readonly dissolve: (token: string) => Promise<FamilyResult>;
    /** Biblioteca partilhada do grupo. */
    readonly games: (token: string) => Promise<{ readonly ok: boolean; readonly items?: readonly FamilyGameView[]; readonly total?: number; readonly message?: string }>;
  };
  readonly shortcuts: {
    readonly create: (gameId: string) => Promise<ShortcutResultView>;
  };
  readonly scan: {
    readonly disks: () => Promise<ScanResultView>;
    /** Importa dos manifestos locais das lojas oficiais (Steam). */
    readonly official: () => Promise<OfficialImportResult>;
    /** `true` quando há manifestos de loja no sistema. */
    readonly officialAvailable: () => Promise<{ readonly available: boolean }>;
  };
  readonly library: {
    readonly list: () => Promise<readonly DesktopGameView[]>;
    readonly importFolder: () => Promise<ImportResultView>;
    readonly detectFolders: () => Promise<readonly DetectedFolderView[]>;
    readonly toggleFavorite: (id: string) => Promise<DesktopGameView | null>;
    readonly remove: (id: string) => Promise<boolean>;
    /**
     * Adiciona um jogo pelo AppID da Steam (catálogo público).
     *
     * A entrada nasce com metadados e sem caminho de instalação: o jogo não
     * está no disco. `duplicate: true` quando já estava na biblioteca — a
     * entrada que existe fica intocada (capa e tempo jogado são do
     * utilizador).
     */
    readonly addCatalog: (appId: string) => Promise<{
      readonly ok: boolean;
      readonly duplicate?: boolean;
      readonly gameId?: string;
      readonly title?: string;
      readonly message?: string;
    }>;
  };
  readonly runner: {
    /**
     * Lança um jogo. O token (opcional) liga a presença: com conta, os
     * amigos vêem o jogo a correr enquanto ele durar.
     */
    readonly launch: (id: string, token?: string) => Promise<LaunchResultView>;
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
    /**
     * Saves na nuvem — o progresso guardado com a conta.
     *
     * `cloudStatus` devolve as versões dos dois lados e a decisão de
     * conflito; `cloudUpload` envia um snapshot local (com a revisão e o
     * checksum dele); `cloudRestore` repõe uma versão da nuvem — criando um
     * snapshot local de segurança **antes** de tocar na pasta. Todas exigem
     * o token da sessão.
     */
    readonly cloudStatus: (gameKey: string, token: string) => Promise<{
      readonly ok: boolean;
      readonly local?: readonly { readonly id: string; readonly label: string; readonly revision: number; readonly createdAt: string }[];
      readonly remote?: readonly { readonly id: string; readonly label: string; readonly revision: number; readonly createdAt: string }[];
      readonly decision?: string;
      readonly message?: string;
    }>;
    readonly cloudUpload: (gameKey: string, snapshotId: string, token: string) => Promise<{
      readonly ok: boolean;
      readonly revision?: number;
      readonly message?: string;
    }>;
    readonly cloudRestore: (gameKey: string, cloudId: string, token: string) => Promise<{
      readonly ok: boolean;
      readonly revision?: number;
      readonly message?: string;
    }>;
    readonly cloudDelete: (cloudId: string, token: string) => Promise<{
      readonly ok: boolean;
      readonly message?: string;
    }>;
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
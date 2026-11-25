import type {
  AuthSessionRevokeReason,
  AuditAction,
  GameProvider,
  GameSessionState,
  UserRole,
} from '../db/types.js';
import type { FamilyInviteStatus, FamilyRole } from '@nexora/core';

/**
 * Interfaces dos repositórios.
 *
 * A API **não conhece o driver do banco**: depende apenas destas interfaces.
 * Existem duas implementações — PostgreSQL (Drizzle, com migrações
 * versionadas) e memória. A de memória serve os testes de integração e o
 * **modo degradado** (sem `DATABASE_URL`, ou com o Postgres inacessível), que
 * a API reporta de forma explícita em `/health`.
 *
 * É o mesmo desenho do Nexora Cloud, e pela mesma razão: as regras de negócio
 * são exercitadas uma única vez, contra as duas implementações.
 */

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly role: UserRole;
  readonly planId: string;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewUserRecord {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly role?: UserRole;
  readonly planId?: string;
}

export interface UserRepository {
  create: (input: NewUserRecord) => Promise<UserRecord>;
  findByEmail: (email: string) => Promise<UserRecord | null>;
  findById: (id: string) => Promise<UserRecord | null>;
  countAll: () => Promise<number>;
  /** Incremento **atómico** das tentativas falhadas (contagem em SQL). */
  incrementFailedAttempts: (userId: string) => Promise<number>;
  resetFailedAttempts: (userId: string) => Promise<void>;
  lockUntil: (userId: string, until: Date | null) => Promise<void>;
  setRole: (userId: string, role: UserRole) => Promise<void>;
  /** Muda o plano do utilizador (os limites passam a valer a partir daqui). */
  setPlan: (userId: string, planId: string) => Promise<void>;
  setDisplayName: (userId: string, displayName: string) => Promise<void>;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly rotatedToId: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokeReason: AuthSessionRevokeReason | null;
  readonly lastUsedAt: Date | null;
}

export interface NewAuthSessionRecord {
  readonly userId: string;
  readonly familyId?: string;
  readonly expiresAt: Date;
  readonly userAgent?: string | null;
}

export interface AuthSessionRepository {
  create: (input: NewAuthSessionRecord) => Promise<AuthSessionRecord>;
  findById: (id: string) => Promise<AuthSessionRecord | null>;
  /**
   * Rota **atomicamente**: marca a sessão como rodada e aponta o sucessor.
   *
   * Devolve `false` quando a sessão já estava revogada — é assim que dois
   * pedidos paralelos não criam dois sucessores válidos para a mesma família.
   */
  markRotated: (sessionId: string, successorId: string, now: Date) => Promise<boolean>;
  /** Revoga a família inteira (logout ou reutilização detectada). */
  revokeFamily: (familyId: string, reason: AuthSessionRevokeReason, now: Date) => Promise<number>;
  revokeById: (sessionId: string, reason: AuthSessionRevokeReason, now: Date) => Promise<void>;
  listActiveByUser: (userId: string) => Promise<readonly AuthSessionRecord[]>;
  deleteExpiredBefore: (before: Date) => Promise<number>;
}

export interface MfaSecretRecord {
  readonly userId: string;
  readonly secretCiphertext: string;
  readonly enabledAt: Date | null;
  readonly lastUsedStep: number | null;
}

export interface MfaRepository {
  /** Cria ou substitui um enrollment **pendente** (recusa MFA activo). */
  upsertPendingSecret: (userId: string, ciphertext: string) => Promise<MfaSecretRecord>;
  /** Confirma o enrollment com um código válido. */
  confirmSecret: (userId: string, now: Date) => Promise<boolean>;
  /**
   * Consome o passo TOTP de forma atómica.
   *
   * Devolve `false` quando o passo é igual ou anterior ao último aceite — a
   * defesa anti-replay.
   */
  consumeStep: (userId: string, step: number) => Promise<boolean>;
  findSecret: (userId: string) => Promise<MfaSecretRecord | null>;
  findEnabled: (userId: string) => Promise<MfaSecretRecord | null>;
  disable: (userId: string) => Promise<void>;
  /** Substitui os códigos de resgate pelos hashes novos. */
  replaceRecoveryCodes: (userId: string, codeHashes: readonly string[]) => Promise<void>;
  /**
   * Consome um código de resgate **do dono**.
   *
   * O código de outra conta nem sequer é marcado como usado: quem o
   * apresenta não o pode gastar.
   */
  consumeRecoveryCode: (userId: string, codeHash: string) => Promise<boolean>;
  countRecoveryCodes: (userId: string) => Promise<number>;
}

export interface LibraryEntryRecord {
  readonly id: string;
  readonly userId: string;
  readonly externalKey: string;
  readonly title: string;
  readonly cover: string | null;
  readonly provider: GameProvider;
  readonly installPath: string | null;
  readonly executablePath: string | null;
  readonly tags: readonly string[];
  readonly adult: boolean;
  readonly favorite: boolean;
  readonly collections: readonly string[];
  readonly lastPlayedAt: Date | null;
  readonly totalSeconds: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertLibraryEntryInput {
  readonly userId: string;
  readonly externalKey: string;
  readonly title: string;
  readonly cover?: string | null;
  readonly provider?: GameProvider;
  readonly installPath?: string | null;
  readonly executablePath?: string | null;
  readonly tags?: readonly string[];
  readonly adult?: boolean;
}

export interface LibraryRepository {
  /** Cria ou actualiza uma entrada (sincronizar duas vezes não duplica). */
  upsertEntry: (input: UpsertLibraryEntryInput) => Promise<LibraryEntryRecord>;
  list: (userId: string, query: { limit: number; offset: number }) => Promise<{
    items: readonly LibraryEntryRecord[];
    total: number;
  }>;
  findById: (userId: string, id: string) => Promise<LibraryEntryRecord | null>;
  /** Entrada pela chave estável local (a que as sessões de jogo referenciam). */
  findByExternalKey: (userId: string, externalKey: string) => Promise<LibraryEntryRecord | null>;
  setFavorite: (userId: string, id: string, favorite: boolean) => Promise<LibraryEntryRecord | null>;
  addCollection: (userId: string, id: string, collection: string) => Promise<LibraryEntryRecord | null>;
  remove: (userId: string, id: string) => Promise<boolean>;
  /** Soma o tempo jogado da sessão ao total da entrada. */
  addPlayedSeconds: (userId: string, gameId: string, seconds: number, playedAt: Date) => Promise<void>;
  totalsByGame: (userId: string) => Promise<ReadonlyMap<string, number>>;
  /** Todas as entradas da biblioteca do utilizador (para as estatísticas). */
  listByUser: (userId: string) => Promise<readonly LibraryEntryRecord[]>;
}

export interface PlaySessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly gameId: string;
  readonly state: GameSessionState;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationSeconds: number;
  readonly exitCode: number | null;
}

export interface PlaySessionRepository {
  start: (userId: string, gameId: string) => Promise<PlaySessionRecord>;
  /**
   * Segundos jogados num jogo (sessões terminadas).
   *
   * É o que a regra "reviewar depois de jogar" consulta: ninguém reviewia
   * um jogo que não experimentou — e a sessão em curso não conta (o tempo só
   * é real quando a sessão termina).
   */
  totalPlayedSeconds: (userId: string, gameId: string) => Promise<number>;
  /** Todas as sessões do utilizador (para a agregação de estatísticas). */
  listAllByUser: (userId: string) => Promise<readonly PlaySessionRecord[]>;
  /** Sessões terminadas do utilizador, das mais recentes. */
  listEndedByUser: (userId: string, limit: number) => Promise<readonly PlaySessionRecord[]>;
  findById: (userId: string, id: string) => Promise<PlaySessionRecord | null>;
  list: (
    userId: string,
    query: { limit: number; offset: number },
  ) => Promise<{ items: readonly PlaySessionRecord[]; total: number }>;
  /** Fecha a sessão com a duração e o código de saída. */
  end: (
    userId: string,
    id: string,
    input: { endedAt: Date; exitCode: number | null },
  ) => Promise<PlaySessionRecord | null>;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly entity: string;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly requestId: string | null;
  readonly createdAt: Date;
}

/** Entrada de uma escrita auditada. */
export interface AuditRecordInput {
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly entity: string;
  readonly entityId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

export interface AuditRepository {
  record: (input: AuditRecordInput) => Promise<AuditLogRecord>;
  list: (query: { limit: number; offset: number }) => Promise<{
    items: readonly AuditLogRecord[];
    total: number;
  }>;
}

/** Todas as dependências de persistência da API. */

/** Um grupo familiar (o dono é um membro com papel `owner`). */
export interface FamilyGroupRecord {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Um membro do grupo. */
export interface FamilyMemberRecord {
  readonly groupId: string;
  readonly userId: string;
  readonly role: FamilyRole;
  readonly joinedAt: Date;
}

/** Um convite para entrar no grupo. */
export interface FamilyInviteRecord {
  readonly id: string;
  readonly groupId: string;
  /** Código apresentado por quem aceita. */
  readonly code: string;
  readonly email: string;
  readonly invitedBy: string;
  readonly status: FamilyInviteStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Data da resposta (aceite/recusa), ou `null`. */
  readonly respondedAt: Date | null;
}

/** O grupo com os seus membros e convites (a vista que as rotas consomem). */
export interface FamilyGroupSnapshot {
  readonly group: FamilyGroupRecord;
  readonly members: readonly FamilyMemberRecord[];
  readonly invites: readonly FamilyInviteRecord[];
}

/** Entrada para adicionar um membro. */
export interface NewFamilyMemberInput {
  readonly groupId: string;
  readonly userId: string;
  readonly role: FamilyRole;
  readonly joinedAt: Date;
}

/** Entrada para criar um convite. */
export interface NewFamilyInviteInput {
  readonly id: string;
  readonly groupId: string;
  readonly code: string;
  readonly email: string;
  readonly invitedBy: string;
  readonly expiresAt: Date;
}

export interface FamilyRepository {
  /** Cria o grupo com o criador como dono (recusa duplicado pelo índice único). */
  readonly createGroup: (input: { id: string; name: string; ownerId: string }) => Promise<FamilyGroupRecord>;
  /** Grupo de um utilizador (por membro), ou `null` quando não tem. */
  readonly findGroupByUser: (userId: string) => Promise<FamilyGroupSnapshot | null>;
  /** Grupo por identificador, ou `null`. */
  readonly findGroupById: (groupId: string) => Promise<FamilyGroupSnapshot | null>;
  /** Acrescenta um membro (idempotente pelo par grupo/utilizador). */
  readonly addMember: (input: NewFamilyMemberInput) => Promise<void>;
  /** Remove um membro (devolve `false` quando não era membro). */
  readonly removeMember: (groupId: string, userId: string) => Promise<boolean>;
  /** Cria um convite pendente. */
  readonly createInvite: (input: NewFamilyInviteInput) => Promise<FamilyInviteRecord>;
  /** Convite pelo código, ou `null`. */
  readonly findInviteByCode: (code: string) => Promise<FamilyInviteRecord | null>;
  /** Marca a resposta de um convite (`null` quando não existe). */
  readonly respondInvite: (
    inviteId: string,
    status: 'accepted' | 'declined' | 'expired',
    now: Date,
  ) => Promise<FamilyInviteRecord | null>;
  /** Apaga o grupo, os membros e os convites. */
  readonly deleteGroup: (groupId: string) => Promise<boolean>;
}

/** Uma conversa directa. */
export interface ConversationRecord {
  readonly id: string;
  /** Os dois participantes (a ordem é a da base). */
  readonly userIdA: string;
  readonly userIdB: string;
  readonly createdAt: Date;
  readonly lastMessageAt: Date | null;
  /** Excerto da última mensagem, ou `null`. */
  readonly lastMessageExcerpt: string | null;
}

/** Uma mensagem. */
export interface ChatMessageRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface ChatRepository {
  /**
   * Abre (ou reutiliza) a conversa directa entre duas pessoas.
   *
   * O par é **normalizado** (o id menor primeiro), para que (ana, bruno) e
   * (bruno, ana) sejam a mesma conversa — e o índice único impede a
   * duplicação mesmo com dois pedidos em paralelo.
   */
  readonly openDirect: (userId: string, otherId: string) => Promise<ConversationRecord>;
  /** Conversas de um utilizador, da mais recente para a mais antiga. */
  readonly listForUser: (userId: string) => Promise<readonly ConversationRecord[]>;
  /** Conversa por identificador, ou `null`. */
  readonly findById: (conversationId: string) => Promise<ConversationRecord | null>;
  /** Mensagens de uma conversa, da mais antiga para a mais recente. */
  readonly listMessages: (conversationId: string, limit: number) => Promise<readonly ChatMessageRecord[]>;
  /** Grava uma mensagem e actualiza o excerto da conversa. */
  readonly addMessage: (input: {
    conversationId: string;
    authorId: string;
    body: string;
    excerpt: string;
    now: Date;
  }) => Promise<ChatMessageRecord>;
}

/** Uma entrada do livro de pontos. */
export interface PointEntryRecord {
  readonly id: string;
  readonly userId: string;
  readonly delta: number;
  /** Motivo declarado (`achievement.ten-hours`, …). */
  readonly reason: string;
  /** A entidade que deu os pontos (a conquista), ou `null`. */
  readonly entityId: string | null;
  readonly createdAt: Date;
}

export interface AchievementRepository {
  /** Conquistas desbloqueadas pelo utilizador, das mais recentes. */
  readonly listUnlocked: (userId: string) => Promise<readonly { achievementId: string; unlockedAt: Date }[]>;
  /**
   * Marca uma conquista como desbloqueada.
   *
   * Devolve `false` quando já estava — e é assim que os pontos não são
   * pagos duas vezes pela mesma conquista.
   */
  readonly unlock: (userId: string, achievementId: string, now: Date) => Promise<boolean>;
  /** Quantos utilizadores têm a conquista (contagem global, não estimativa). */
  readonly countUnlockedByAchievement: (achievementId: string) => Promise<number>;
  /** Acrescenta uma entrada ao livro de pontos. */
  readonly addPoints: (input: { userId: string; delta: number; reason: string; entityId: string | null }) => Promise<PointEntryRecord>;
  /** As últimas entradas do livro do utilizador. */
  readonly listPoints: (userId: string, limit: number) => Promise<readonly PointEntryRecord[]>;
  /** Saldo = a soma das entradas (nunca um campo guardado). */
  readonly balance: (userId: string) => Promise<number>;
}

/** Um item da lista de desejos. */
export interface WishlistRecord {
  readonly id: string;
  readonly userId: string;
  readonly gameId: string;
  readonly createdAt: Date;
}

/** Um pedido de amizade. */
export interface FriendRequestRecord {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  readonly createdAt: Date;
  readonly respondedAt: Date | null;
}

/** Uma amizade estabelecida (um lado do par). */
export interface FriendshipRecord {
  readonly userId: string;
  readonly friendId: string;
  readonly since: Date;
}

/** Um registo de presença. */
export interface PresenceRecord {
  readonly userId: string;
  readonly gameId: string | null;
  readonly at: Date;
  readonly expiresAt: Date;
}

/** Entrada para criar um pedido de amizade. */
export interface NewFriendRequestInput {
  readonly id: string;
  readonly fromUserId: string;
  readonly toUserId: string;
}

export interface FriendsRepository {
  /** Amigos de um utilizador, do mais recente ao mais antigo. */
  readonly listFriends: (userId: string) => Promise<readonly FriendshipRecord[]>;
  /** Pedidos recebidos ainda pendentes. */
  readonly listIncomingRequests: (userId: string) => Promise<readonly FriendRequestRecord[]>;
  /** Pedidos enviados ainda pendentes. */
  readonly listOutgoingRequests: (userId: string) => Promise<readonly FriendRequestRecord[]>;
  /**
   * Cria um pedido, ou devolve `null` quando já existe um pendente entre os
   * dois (em qualquer direcção).
   *
   * A verificação é da base, não só do domínio: dois pedidos em paralelo
   * passariam os dois pela regra pura e criariam dois pendentes para a
   * mesma amizade.
   */
  readonly createRequest: (input: NewFriendRequestInput) => Promise<FriendRequestRecord | null>;
  /** Marca a resposta de um pedido (`null` quando não existe). */
  readonly respondRequest: (
    requestId: string,
    status: 'accepted' | 'declined' | 'cancelled',
    now: Date,
  ) => Promise<FriendRequestRecord | null>;
  /** Grava a amizade nos dois sentidos (idempotente). */
  readonly addFriendship: (userId: string, friendId: string, now: Date) => Promise<void>;
  /** Apaga a amizade nos dois sentidos. */
  readonly removeFriendship: (userId: string, friendId: string) => Promise<boolean>;
}

export interface PresenceRepository {
  /** Grava (ou substitui) o coração de um utilizador. */
  readonly heartbeat: (input: { userId: string; gameId: string | null; at: Date; expiresAt: Date }) => Promise<void>;
  /** Registos de vários utilizadores (a origem filtra os expirados). */
  readonly list: (userIds: readonly string[]) => Promise<readonly PresenceRecord[]>;
  /** Apaga os registos já expirados. */
  readonly prune: (before: Date) => Promise<number>;
}

export interface WishlistRepository {
  /** Adiciona um jogo (idempotente pelo par utilizador/jogo). */
  readonly add: (userId: string, gameId: string, id: string) => Promise<WishlistRecord>;
  /** Remove um jogo da lista do utilizador. */
  readonly remove: (userId: string, gameId: string) => Promise<boolean>;
  /** Lista a lista de desejos do utilizador. */
  readonly listByUser: (userId: string) => Promise<readonly WishlistRecord[]>;
}

export interface Repositories {
  readonly comments: CommentRepository;
  readonly reviews: ReviewRepository;
  readonly forums: ForumRepository;
  readonly clans: ClanRepository;
  readonly events: EventRepository;
  readonly librarySync: SyncedLibraryRepository;
  readonly screenshots: ScreenshotRepository;
  readonly users: UserRepository;
  readonly authSessions: AuthSessionRepository;
  readonly mfa: MfaRepository;
  readonly library: LibraryRepository;
  readonly sessions: PlaySessionRepository;
  readonly audit: AuditRepository;
  readonly wishlist: WishlistRepository;
  readonly family: FamilyRepository;
  readonly friends: FriendsRepository;
  readonly presence: PresenceRepository;
  readonly chat: ChatRepository;
  readonly achievements: AchievementRepository;
  /** Modo efectivo de persistência (reportado em `/health`). */
  readonly mode: 'memory' | 'postgres';
  close: () => Promise<void>;
}

/** Um comentário num jogo. */
export interface CommentRecord {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly body: string;
  readonly createdAt: Date;
}

/** Entrada de um novo comentário. */
export interface NewCommentInput {
  readonly gameId: string;
  readonly userId: string;
  readonly body: string;
}

export interface CommentRepository {
  /** Cria um comentário (o dono é quem criou). */
  readonly create: (input: NewCommentInput) => Promise<CommentRecord>;
  /** Lista comentários de um jogo, do mais recente para o mais antigo. */
  readonly listByGame: (gameId: string, limit: number, offset: number) => Promise<readonly CommentRecord[]>;
  /** Comentários do utilizador, dos mais recentes (para a timeline). */
  readonly listByUser: (userId: string, limit: number) => Promise<readonly CommentRecord[]>;
  /** Apaga um comentário **do dono** (devolve `false` se não for dele). */
  readonly deleteOwned: (commentId: string, userId: string) => Promise<boolean>;
}

/** Um tópico de fórum (o que a lista mostra). */
export interface ForumThreadRecord {
  readonly id: string;
  readonly gameId: string;
  readonly authorId: string;
  readonly title: string;
  /** O corpo da primeira mensagem (a pergunta). */
  readonly body: string;
  readonly replyCount: number;
  /** Fechado pelo autor: só ele responde. */
  readonly locked: boolean;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
}

/** Uma resposta dentro de um tópico. */
export interface ForumPostRecord {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
}

/** Entrada para criar um tópico. */
export interface NewThreadInput {
  readonly gameId: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
}

/** Entrada para criar uma resposta. */
export interface NewPostInput {
  readonly threadId: string;
  readonly authorId: string;
  readonly body: string;
}

export interface ForumRepository {
  /** Cria um tópico (a primeira mensagem é o corpo). */
  readonly createThread: (input: NewThreadInput) => Promise<ForumThreadRecord>;
  /** Lista os tópicos de um jogo, do mais activo para o menos activo. */
  readonly listThreads: (gameId: string, limit: number, offset: number) => Promise<readonly ForumThreadRecord[]>;
  /** Procura um tópico pelo id. */
  readonly findThread: (threadId: string) => Promise<ForumThreadRecord | null>;
  /** Cria uma resposta e faz o tópico subir (actividade e contagem). */
  readonly createPost: (input: NewPostInput) => Promise<ForumPostRecord>;
  /** Lista as respostas de um tópico, da mais antiga para a mais recente. */
  readonly listPosts: (threadId: string, limit: number, offset: number) => Promise<readonly ForumPostRecord[]>;
  /** Fecha ou abre um tópico **do autor** (`false` se não for dele). */
  readonly setLocked: (threadId: string, authorId: string, locked: boolean) => Promise<boolean>;
  /** Apaga um tópico **do autor** (e as suas respostas). */
  readonly deleteOwnedThread: (threadId: string, authorId: string) => Promise<boolean>;
  /** Apaga uma resposta **do autor**. */
  readonly deleteOwnedPost: (postId: string, authorId: string) => Promise<boolean>;
}

/** Um clã. */
export interface ClanRecord {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly description: string;
  readonly ownerId: string;
  readonly memberCount: number;
  readonly createdAt: Date;
}

/** Uma pertença. */
export interface ClanMemberRecord {
  readonly clanId: string;
  readonly userId: string;
  /** `owner`, `officer` ou `member`. */
  readonly role: string;
  readonly joinedAt: Date;
}

/** Um convite (por email de quem foi convidado). */
export interface ClanInviteRecord {
  readonly id: string;
  readonly clanId: string;
  readonly inviterId: string;
  readonly inviteeEmail: string;
  /** `pending`, `accepted` ou `declined`. */
  readonly status: string;
  readonly createdAt: Date;
  readonly answeredAt: Date | null;
}

/** O que a criação de um clã devolve (ou o motivo da recusa). */
export type ClanCreation =
  | { readonly ok: true; readonly clan: ClanRecord; readonly membership: ClanMemberRecord }
  | { readonly ok: false; readonly reason: 'name-taken' | 'name-invalid' | 'tag-invalid' };

export interface ClanRepository {
  /** Cria um clã (o criador é o dono e primeiro membro). */
  readonly create: (input: { name: string; tag: string; description: string; ownerId: string }) => Promise<ClanCreation>;
  /** Procura um clã pelo id. */
  readonly findById: (clanId: string) => Promise<ClanRecord | null>;
  /** Procura um clã pelo nome (o nome é único). */
  readonly findByName: (name: string) => Promise<ClanRecord | null>;
  /** Lista os clãs de um utilizador (os que é membro). */
  readonly listByUser: (userId: string) => Promise<readonly { readonly clan: ClanRecord; readonly role: string }[]>;
  /** Os membros de um clã, dos mais antigos para os mais recentes. */
  readonly members: (clanId: string) => Promise<readonly ClanMemberRecord[]>;
  /** A pertença de um utilizador num clã (`null` se não for membro). */
  readonly membership: (clanId: string, userId: string) => Promise<ClanMemberRecord | null>;
  /** Convida por email (um convite pendente por convidado e clã). */
  readonly invite: (input: { clanId: string; inviterId: string; inviteeEmail: string }) => Promise<ClanInviteRecord>;
  /** Os convites pendentes para um email. */
  readonly pendingInvites: (email: string) => Promise<readonly ClanInviteRecord[]>;
  /** Procura um convite pelo id. */
  readonly findInvite: (inviteId: string) => Promise<ClanInviteRecord | null>;
  /** Responde a um convite (`accepted` ou `declined`). */
  readonly answerInvite: (inviteId: string, status: 'accepted' | 'declined') => Promise<ClanInviteRecord | null>;
  /** Junta um membro ao clã (a pertença e a contagem andam juntas). */
  readonly join: (clanId: string, userId: string) => Promise<ClanMemberRecord | null>;
  /** Muda o papel de um membro. */
  readonly setRole: (clanId: string, userId: string, role: string) => Promise<boolean>;
  /** Remove um membro (a pertença e a contagem andam juntas). */
  readonly removeMember: (clanId: string, userId: string) => Promise<boolean>;
  /** Apaga um clã e tudo o que é dele. */
  readonly dissolve: (clanId: string) => Promise<boolean>;
}

/** Um evento. */
export interface EventRecord {
  readonly id: string;
  readonly clanId: string | null;
  readonly title: string;
  readonly description: string;
  readonly startsAt: Date;
  readonly capacity: number;
  readonly hostId: string;
  readonly goingCount: number;
  readonly cancelled: boolean;
  readonly createdAt: Date;
}

/** Uma participação. */
export interface EventParticipantRecord {
  readonly eventId: string;
  readonly userId: string;
  /** `going`, `interested` ou `maybe`. */
  readonly status: string;
  readonly createdAt: Date;
}

/** O que a criação de um evento devolve. */
export type EventCreation =
  | { readonly ok: true; readonly event: EventRecord }
  | { readonly ok: false; readonly reason: 'capacity-invalid' | 'past-start' };

export interface EventRepository {
  /** Cria um evento (o criador é o anfitrião). */
  readonly create: (input: {
    clanId: string | null;
    title: string;
    description: string;
    startsAt: Date;
    capacity: number;
    hostId: string;
  }) => Promise<EventCreation>;
  /** Lista os eventos por vir (dos mais próximos para os mais distantes). */
  readonly listUpcoming: (limit: number, offset: number) => Promise<readonly EventRecord[]>;
  /** Procura um evento pelo id. */
  readonly findById: (eventId: string) => Promise<EventRecord | null>;
  /** Os participantes de um evento. */
  readonly participants: (eventId: string) => Promise<readonly EventParticipantRecord[]>;
  /** A participação de um utilizador num evento (`null` se não participar). */
  readonly participation: (eventId: string, userId: string) => Promise<EventParticipantRecord | null>;
  /**
   * Marca a participação (substitui a anterior) e ajusta os confirmados.
   *
   * `going` ocupa um lugar; `interested` e `maybe` não. Sair (`null`) liberta
   * o lugar. Devolve `false` quando o evento não aceita (cheio, começado,
   * cancelado) — a regra é do domínio, o repositório só recusa o que a rota
   * já verificou.
   */
  readonly setParticipation: (eventId: string, userId: string, status: 'going' | 'interested' | 'maybe' | null) => Promise<boolean>;
  /** Cancela um evento (só o anfitrião). */
  readonly cancel: (eventId: string, hostId: string) => Promise<boolean>;
}

/** Uma entrada da biblioteca sincronizada (o que a conta guarda). */
export interface SyncedEntryRecord {
  readonly id: string;
  readonly userId: string;
  /** A chave externa do jogo (caminho normalizado ou `steam-app:<id>`). */
  readonly externalKey: string;
  readonly title: string;
  readonly steamAppId: string | null;
  /** A capa **pública** (URL da loja); caminhos locais nunca sobem. */
  readonly coverUrl: string | null;
  readonly installed: boolean;
  readonly favorite: boolean;
  /** Segundos medidos pelo runner (tempo real de quem joga). */
  readonly totalSeconds: number;
  readonly updatedAt: Date;
}

/** Uma entrada para sincronizar (o que o launcher envia). */
export interface SyncedEntryInput {
  readonly externalKey: string;
  readonly title: string;
  readonly steamAppId?: string | null;
  /** Só URLs públicas: um caminho local é rejeitado pela rota. */
  readonly coverUrl?: string | null;
  readonly installed?: boolean;
  readonly favorite?: boolean;
  readonly totalSeconds?: number;
}

export interface SyncedLibraryRepository {
  /** Substitui (ou cria) as entradas do utilizador; devolve as contagens. */
  readonly sync: (userId: string, entries: readonly SyncedEntryInput[]) => Promise<{ updated: number; added: number }>;
  /** Lista a biblioteca do utilizador (para a web e outra máquina). */
  readonly list: (userId: string) => Promise<readonly SyncedEntryRecord[]>;
}

/** Uma captura na nuvem (o índice; o ficheiro vive no disco). */
export interface ScreenshotRecord {
  readonly id: string;
  readonly userId: string;
  readonly gameKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
}

export interface ScreenshotRepository {
  /** Guarda uma captura (o ficheiro no disco, o índice na memória). */
  readonly create: (input: { userId: string; gameKey: string; fileName: string; bytes: Buffer }) => Promise<ScreenshotRecord>;
  /** Lista as capturas do utilizador (de um jogo, quando pedido). */
  readonly list: (userId: string, gameKey?: string) => Promise<readonly ScreenshotRecord[]>;
  /** Procura uma captura (só do próprio utilizador). */
  readonly find: (userId: string, id: string) => Promise<ScreenshotRecord | null>;
  /** Os bytes de uma captura (`null` quando não existe). */
  readonly read: (userId: string, id: string) => Buffer | null;
  /** Apaga uma captura (só do dono). */
  readonly remove: (userId: string, id: string) => Promise<boolean>;
}

/** Uma review de um jogo (uma por utilizador). */
export interface ReviewRecord {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly rating: number;
  readonly story: number | null;
  readonly gameplay: number | null;
  readonly graphics: number | null;
  readonly sound: number | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Entrada/actualização de uma review (upsert pelo dono). */
export interface UpsertReviewInput {
  readonly gameId: string;
  readonly userId: string;
  readonly rating: number;
  readonly story: number | null;
  readonly gameplay: number | null;
  readonly graphics: number | null;
  readonly sound: number | null;
  readonly body: string;
}

export interface ReviewRepository {
  /** Cria ou actualiza a review do utilizador no jogo. */
  readonly upsert: (input: UpsertReviewInput) => Promise<ReviewRecord>;
  /** Lista reviews de um jogo, da mais recente para a mais antiga. */
  readonly listByGame: (gameId: string, limit: number, offset: number) => Promise<readonly ReviewRecord[]>;
  /** Reviews do utilizador, das mais recentes (para a timeline). */
  readonly listByUser: (userId: string, limit: number) => Promise<readonly ReviewRecord[]>;
  /** Agregado de notas de um jogo (médias e contagem). */
  readonly aggregate: (gameId: string) => Promise<ReviewAggregate>;
  /** Apaga a review do dono. */
  readonly deleteOwned: (reviewId: string, userId: string) => Promise<boolean>;
}

/** Agregado de reviews de um jogo. */
export interface ReviewAggregate {
  readonly count: number;
  /** Média da nota global (0 quando não há reviews). */
  readonly averageRating: number;
  /** Médias por categoria (`null` quando não há votos nessa categoria). */
  readonly averageStory: number | null;
  readonly averageGameplay: number | null;
  readonly averageGraphics: number | null;
  readonly averageSound: number | null;
}

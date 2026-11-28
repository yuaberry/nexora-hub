/**
 * Contrato do *runner* de jogos.
 *
 * O launcher **arranca** o executável local do utilizador e mede a sessão.
 * Não emula, não injeta, não contorna protecções: corre o que o utilizador
 * escolheu, no sistema dele, e regista o tempo e o código de saída.
 */

/** Pedido de arranque de um jogo local. */
export interface LaunchRequest {
  readonly gameId: string;
  /** Caminho absoluto do executável. */
  readonly executablePath: string;
  /**
   * Comando efectivo — quando existe uma camada de compatibilidade
   * (Wine/Proton), o comando é o *wrapper*, e o executável vai nos
   * argumentos. Por omissão, é o próprio executável.
   */
  readonly command?: string;
  /** Argumentos de linha de comandos. */
  readonly args?: readonly string[];
  /** Variáveis de ambiente a injectar (prefixo Wine, etc.). */
  readonly env?: Readonly<Record<string, string>>;
  /** Directório de trabalho. */
  readonly cwd?: string;
  /**
   * Texto a procurar na tabela de processos para saber se o jogo corre.
   *
   * O `wine` arranca o jogo por um `wineserver` persistente, que vive noutro
   * grupo de processos: seguir o grupo do processo arrancado não basta. Com
   * esta marca (o nome do executável do jogo), a sessão dura enquanto houver
   * um processo com esse nome — que é o que "o jogo está a correr" quer dizer.
   */
  readonly processMatch?: string;
}

/**
 * Pedido de observação — o jogo corre noutro processo.
 *
 * É o caminho **oficial**: o launcher pede ao cliente da loja que abra o jogo
 * (`steam://rungameid/<id>`) e limita-se a observar o processo real que
 * aparece na tabela. A sessão é medida por esse processo — tempo real, sem
 * fingir — mas o launcher não o possui: não o pode fechar, e a interface diz
 * que o jogo corre pelo cliente oficial.
 */
export interface ObserveRequest {
  readonly gameId: string;
  /** Texto que identifica o processo do jogo (o nome do executável). */
  readonly processMatch: string;
  /**
   * Quanto tempo esperar que o jogo apareça antes de desistir (ms).
   *
   * O cliente da loja pode demorar a arrancar (actualizações, o próprio
   * cliente). A espera é declarada — e quando passa, a sessão acaba com o
   * motivo honesto, em vez de ficar presa a sessão fantasma.
   */
  readonly waitMs?: number;
}

/** Motivo de recusa de arranque (chave de tradução + texto). */
export interface LaunchRefusal {
  readonly reasonKey: 'missing-executable' | 'no-runner' | 'already-running' | 'not-seen';
  readonly reason: string;
}

/** Resultado de um pedido de arranque. */
export type LaunchOutcome =
  | { readonly ok: true; readonly session: RunningSession }
  | { readonly ok: false } & LaunchRefusal;

/** Quem abriu o jogo. */
export type SessionOrigin =
  /** O launcher arrancou o executável (é dono do processo). */
  | 'local'
  /** O cliente oficial da loja abriu o jogo (o launcher só observa). */
  | 'official';

/** Uma sessão em curso. */
export interface RunningSession {
  readonly sessionId: string;
  readonly gameId: string;
  /** PID do processo observado (0 enquanto o jogo não apareceu). */
  readonly processId: number;
  /** ISO-8601 UTC do arranque. */
  readonly startedAt: string;
  /** Quem abriu o jogo — decide o que o launcher pode fazer com ele. */
  readonly origin: SessionOrigin;
}

/** Resumo de uma sessão (em curso ou terminada). */
export interface SessionSummary {
  readonly sessionId: string;
  readonly gameId: string;
  readonly processId: number;
  readonly startedAt: string;
  /** Quem abriu o jogo. */
  readonly origin: SessionOrigin;
  /** ISO-8601 UTC do fim, ou `null` enquanto corre. */
  readonly endedAt: string | null;
  /** Duração em segundos (arredondada por cima enquanto corre). */
  readonly durationSeconds: number;
  /** Código de saída, ou `null` enquanto corre. */
  readonly exitCode: number | null;
  /** `true` quando o código de saída não é zero (o jogo fechou em crash). */
  readonly crashed: boolean;
}

/** Interface do runner — a implementação local cumpre este contrato. */
export interface GameRunner {
  /** Arranca o executável e devolve a sessão em curso. */
  readonly launch: (request: LaunchRequest) => Promise<LaunchOutcome>;
  /**
   * Observa o processo de um jogo que outro programa abriu.
   *
   * Uma sessão observada não é fechada pelo `stop`: o processo não é do
   * launcher. Parar uma sessão observada pága a **medição**, e a interface
   * diz que o jogo continua a correr pelo cliente oficial.
   */
  readonly observe: (request: ObserveRequest) => Promise<LaunchOutcome>;
  /** Termina uma sessão (mata o processo) e devolve o resumo. */
  readonly stop: (sessionId: string) => SessionSummary | null;
  /** Resumo de uma sessão, ou `null` se não existir. */
  readonly status: (sessionId: string) => SessionSummary | null;
  /** Espera pelo fim natural do processo e devolve o resumo. */
  readonly wait: (sessionId: string) => Promise<SessionSummary | null>;
  /** Todas as sessões em curso. */
  readonly running: () => readonly SessionSummary[];
}

/**
 * Duração de uma sessão, em segundos.
 *
 * Arredondada **por defeito** para minutos não acontece aqui: o valor exacto
 * fica na sessão e o arredondamento para minutos é decidido na fronteira da
 * persistência (ver `apps/desktop`), onde a coluna é inteira.
 */
export function measureSeconds(startedAt: Date, endedAt: Date): number {
  const seconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  return Math.max(0, seconds);
}

/** `true` quando um código de saída indica *crash* (qualquer coisa != 0). */
export function isCrashExitCode(code: number | null): boolean {
  return code !== null && code !== 0;
}
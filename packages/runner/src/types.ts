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
}

/** Motivo de recusa de arranque (chave de tradução + texto). */
export interface LaunchRefusal {
  readonly reasonKey: 'missing-executable' | 'no-runner' | 'already-running';
  readonly reason: string;
}

/** Resultado de um pedido de arranque. */
export type LaunchOutcome =
  | { readonly ok: true; readonly session: RunningSession }
  | { readonly ok: false } & LaunchRefusal;

/** Uma sessão em curso. */
export interface RunningSession {
  readonly sessionId: string;
  readonly gameId: string;
  /** PID do processo filho. */
  readonly processId: number;
  /** ISO-8601 UTC do arranque. */
  readonly startedAt: string;
}

/** Resumo de uma sessão (em curso ou terminada). */
export interface SessionSummary {
  readonly sessionId: string;
  readonly gameId: string;
  readonly processId: number;
  readonly startedAt: string;
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
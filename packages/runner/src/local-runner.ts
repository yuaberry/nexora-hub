import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  isCrashExitCode,
  measureSeconds,
  type LaunchOutcome,
  type LaunchRequest,
  type ObserveRequest,
  type RunningSession,
  type SessionOrigin,
  type SessionSummary,
} from './types.js';

/**
 * Runner local — arranca o executável e mede a sessão.
 *
 * A medida é **real**, e por isso a sessão dura enquanto o jogo dura: o
 * processo arrancado pode sair e deixar o jogo a correr (o `wine` arranca o
 * jogo pelo `wineserver` e sai; o `gamemoderun` faz o mesmo). Contar só o
 * filho directo perderia a sessão a meio — e o tempo jogado com ela.
 *
 * É por isso que o arranque é feito num **grupo de processos** próprio
 * (`detached: true`): a sessão acaba quando o grupo inteiro esvazia, não
 * quando o filho directo sai. O código de saída guardado é o do filho.
 */

interface SessionRecord {
  readonly sessionId: string;
  readonly gameId: string;
  readonly processId: number;
  /** O início real: numa sessão observada, quando o jogo apareceu. */
  startedAt: Date;
  /** `null` numa sessão observada: o processo não é nosso. */
  readonly child: ChildProcess | null;
  /** Quem abriu o jogo. */
  readonly origin: SessionOrigin;
  endedAt: Date | null;
  exitCode: number | null;
}

/** Cria o runner local. */
export class LocalGameRunner {
  private readonly sessions = new Map<string, SessionRecord>();

  launch(request: LaunchRequest): Promise<LaunchOutcome> {
    if (!existsSync(request.executablePath)) {
      return Promise.resolve({
        ok: false,
        reasonKey: 'missing-executable',
        reason: `Executável não encontrado: ${request.executablePath}`,
      });
    }

    const alreadyRunning = [...this.sessions.values()].some(
      (session) => session.gameId === request.gameId && session.endedAt === null,
    );
    if (alreadyRunning) {
      return Promise.resolve({
        ok: false,
        reasonKey: 'already-running',
        reason: 'O jogo já está em execução.',
      });
    }

    const startedAt = new Date();
    const child = spawn(request.command ?? request.executablePath, [...(request.args ?? [])], {
      cwd: request.cwd,
      stdio: 'ignore',
      // Grupo próprio: o jogo (e os netos) vivem nele, e a sessão mede o
      // grupo — não o filho directo, que pode sair primeiro.
      detached: true,
      env: request.env === undefined ? process.env : { ...process.env, ...request.env },
    });

    const sessionId = randomUUID();
    const record: SessionRecord = {
      sessionId,
      gameId: request.gameId,
      processId: child.pid ?? 0,
      startedAt,
      child,
      origin: 'local',
      endedAt: null,
      exitCode: null,
    };

    child.on('exit', (code: number | null) => {
      record.exitCode = code;
      if (stillRunning(request)) {
        // O processo arrancado saiu mas o jogo corre (é o que o `wine` faz:
        // arranca o jogo por um `wineserver` persistente). A sessão só acaba
        // quando o jogo realmente sai — até lá, o tempo jogado é o do jogo.
        waitForProcessEnd(request.processMatch).then(() => {
          record.endedAt = new Date();
        });
        return;
      }
      record.endedAt = new Date();
    });
    child.on('error', () => {
      // Um erro de spawn (permissão negada, binário inválido) encerra a
      // sessão com código não-zero: é um *crash*, não um encerramento normal.
      record.endedAt = new Date();
      record.exitCode = 1;
    });

    this.sessions.set(sessionId, record);
    const session: RunningSession = {
      sessionId,
      gameId: request.gameId,
      processId: record.processId,
      startedAt: record.startedAt.toISOString(),
      origin: 'local',
    };
    return Promise.resolve({ ok: true, session });
  }

  /**
   * Observa o processo de um jogo que o cliente oficial abriu.
   *
   * A sessão nasce **pendente**: o pedido de arranque já foi feito (o
   * `steam://` foi aberto), e o jogo pode levar segundos a aparecer. Quando
   * aparece, a sessão começa a contar; quando sai, acaba. O launcher não é
   * dono do processo — não o fecha, e a medição é do processo real.
   */
  observe(request: ObserveRequest): Promise<LaunchOutcome> {
    const jaCorre = [...this.sessions.values()].some(
      (session) => session.gameId === request.gameId && session.endedAt === null,
    );
    if (jaCorre) {
      return Promise.resolve({
        ok: false,
        reasonKey: 'already-running',
        reason: 'O jogo já está em execução.',
      });
    }

    const record: SessionRecord = {
      sessionId: randomUUID(),
      gameId: request.gameId,
      processId: 0,
      startedAt: new Date(),
      child: null,
      origin: 'official',
      endedAt: null,
      exitCode: null,
    };
    this.sessions.set(record.sessionId, record);

    // Esperar o jogo aparecer; se não aparecer, a sessão acaba com o motivo.
    const espera = request.waitMs ?? 120_000;
    let esperado = 0;
    const esperar = (): void => {
      if (processTableHas(request.processMatch)) {
        record.startedAt = new Date();
        this.seguirObservado(record, request.processMatch);
        return;
      }
      esperado += 1_000;
      if (esperado >= espera) {
        record.endedAt = new Date();
        record.exitCode = 1;
        this.sessions.delete(record.sessionId);
        return;
      }
      setTimeout(esperar, 1_000);
    };
    setTimeout(esperar, 500);

    return Promise.resolve({
      ok: true,
      session: {
        sessionId: record.sessionId,
        gameId: record.gameId,
        processId: record.processId,
        startedAt: record.startedAt.toISOString(),
        origin: 'official',
      },
    });
  }

  /** A sessão observada acompanha o processo até ele sair. */
  private seguirObservado(record: SessionRecord, match: string): void {
    const poll = (): void => {
      if (!processTableHas(match)) {
        record.endedAt = new Date();
        record.exitCode = null;
        return;
      }
      setTimeout(poll, 2_000);
    };
    poll();
  }

  status(sessionId: string): SessionSummary | null {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return null;
    }
    return this.toSummary(record);
  }

  running(): readonly SessionSummary[] {
    return [...this.sessions.values()]
      .filter((record) => record.endedAt === null)
      .map((record) => this.toSummary(record));
  }

  stop(sessionId: string): SessionSummary | null {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return null;
    }
    if (record.endedAt === null) {
      if (record.child === null) {
        // Sessão observada: o processo é do cliente oficial. Parar pára a
        // **medição** — fechar o jogo seria fechar algo que não é nosso, e a
        // interface diz que o jogo continua a correr.
        record.endedAt = new Date();
        record.exitCode = 0;
        this.sessions.delete(record.sessionId);
        return this.toSummary(record);
      }
      record.endedAt = new Date();
      record.exitCode = 0;
      // O grupo inteiro: um jogo pode ter o filho directo já saído e os netos
      // a correr — parar só o filho deixaria o jogo ligado.
      if (record.processId > 0) {
        try {
          process.kill(-record.processId, 'SIGTERM');
        } catch {
          // grupo já vazio: cai para o filho directo
          record.child.kill('SIGTERM');
        }
      } else {
        record.child.kill('SIGTERM');
      }
    }
    return this.toSummary(record);
  }

  async wait(sessionId: string): Promise<SessionSummary | null> {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      return null;
    }
    if (record.endedAt === null) {
      const child = record.child;
      if (child === null) {
        // Sessão observada: o fim é visto pela observação do processo.
        await new Promise<void>((resolve) => {
          const poll = (): void => {
            if (record.endedAt !== null) {
              resolve();
              return;
            }
            setTimeout(poll, 1_000);
          };
          poll();
        });
        return this.toSummary(record);
      }
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
      });
    }
    return this.toSummary(record);
  }

  private toSummary(record: SessionRecord): SessionSummary {
    const endedAt = record.endedAt;
    const exitCode = record.exitCode;
    return {
      sessionId: record.sessionId,
      gameId: record.gameId,
      processId: record.processId,
      startedAt: record.startedAt.toISOString(),
      origin: record.origin,
      endedAt: endedAt === null ? null : endedAt.toISOString(),
      durationSeconds: measureSeconds(record.startedAt, endedAt ?? new Date()),
      exitCode,
      crashed: isCrashExitCode(exitCode),
    };
  }
}
/**
 * `true` quando ainda há um processo do jogo na tabela.
 *
 * Sem marca, a resposta é "não" — a sessão acompanha o filho directo, que é
 * o que se sabe ao certo.
 */
function stillRunning(request: LaunchRequest): boolean {
  if (request.processMatch === undefined || request.processMatch === '') {
    return false;
  }
  return processTableHas(request.processMatch);
}

/**
 * Espera que o jogo saia da tabela de processos (consultando a cada 2 s).
 *
 * A consulta é à tabela de processos: o `wineserver` persistente corre noutro
 * grupo, e o grupo do processo arrancado esvazia-se sozinho — segui-lo daria
 * uma sessão que acaba com o jogo ainda a correr.
 */
function waitForProcessEnd(match: string | undefined): Promise<void> {
  return new Promise((resolve) => {
    const poll = (): void => {
      if (match === undefined || match === '' || !processTableHas(match)) {
        resolve();
        return;
      }
      setTimeout(poll, 2_000);
    };
    poll();
  });
}

/**
 * `true` quando algum processo tem o texto na sua linha de comandos.
 *
 * A leitura é de `/proc/<pid>/cmdline` (Linux): cada processo tem a linha em
 * `\0`, e a marca é comparada como está — o caminho do jogo aparece aí, com
 * barras invertidas quando é um processo Windows.
 */
function processTableHas(match: string): boolean {
  let entries: readonly string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    try {
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
      if (cmdline.includes(match)) {
        return true;
      }
    } catch {
      // processo que desapareceu a meio da leitura: continua a varredura
    }
  }
  return false;
}

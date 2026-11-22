import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  isCrashExitCode,
  measureSeconds,
  type LaunchOutcome,
  type LaunchRequest,
  type RunningSession,
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
  readonly startedAt: Date;
  readonly child: ChildProcess;
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
    };
    return Promise.resolve({ ok: true, session });
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
      await new Promise<void>((resolve) => {
        record.child.once('exit', () => resolve());
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

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
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
 * Deliberadamente simples: `spawn` do executável, um mapa de sessões e a
 * recolha do código de saída. O que importa nesta fase é que a medida é
 * **real**: a sessão nasce no arranque e termina quando o processo termina,
 * com o código de saída guardado para que um *crash* seja visível.
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
    const child = spawn(request.executablePath, [...(request.args ?? [])], {
      cwd: request.cwd,
      stdio: 'ignore',
      detached: false,
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
      record.endedAt = new Date();
      record.exitCode = code;
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
      record.child.kill('SIGTERM');
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
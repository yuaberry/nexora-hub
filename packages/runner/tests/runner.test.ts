import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalGameRunner, isCrashExitCode, measureSeconds } from '../src/index.js';

/** Cria um executável de teste que termina com um código dado após um atraso. */
function makeExecutable(name: string, exitCode: number, delayMs: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexora-runner-'));
  const path = join(dir, name);
  const script = [
    '#!/bin/sh',
    `sleep ${delayMs / 1000}`,
    `exit ${exitCode}`,
  ].join('\n');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

describe('runner local', () => {
  it('arranca um executável e termina com código 0', async () => {
    const runner = new LocalGameRunner();
    const executable = makeExecutable('jogo-ok.sh', 0, 150);
    const outcome = await runner.launch({ gameId: 'terraria', executablePath: executable });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(runner.running()).toHaveLength(1);

    const summary = await runner.wait(outcome.session.sessionId);
    expect(summary?.exitCode).toBe(0);
    expect(summary?.crashed).toBe(false);
    expect(summary?.endedAt).not.toBeNull();
    expect(summary?.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(runner.running()).toHaveLength(0);
  });

  it('captura o código de saída de um crash', async () => {
    const runner = new LocalGameRunner();
    const executable = makeExecutable('jogo-crash.sh', 42, 80);
    const outcome = await runner.launch({ gameId: 'valorant', executablePath: executable });
    if (!outcome.ok) {
      throw new Error('arranque devia ter sucedido');
    }
    const summary = await runner.wait(outcome.session.sessionId);
    expect(summary?.exitCode).toBe(42);
    expect(summary?.crashed).toBe(true);
  });

  it('recusa um executável que não existe', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({
      gameId: 'minecraft',
      executablePath: '/caminheiro/que/nao/existe',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reasonKey).toBe('missing-executable');
  });

  it('recusa um segundo arranque do mesmo jogo', async () => {
    const runner = new LocalGameRunner();
    const executable = makeExecutable('jogo-longo.sh', 0, 600);
    const first = await runner.launch({ gameId: 'roblox', executablePath: executable });
    expect(first.ok).toBe(true);
    const second = await runner.launch({ gameId: 'roblox', executablePath: executable });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reasonKey).toBe('already-running');
  });

  it('stop encerra a sessão em curso', async () => {
    const runner = new LocalGameRunner();
    const executable = makeExecutable('jogo-parar.sh', 0, 5_000);
    const outcome = await runner.launch({ gameId: 'fortnite', executablePath: executable });
    if (!outcome.ok) {
      throw new Error('arranque devia ter sucedido');
    }
    const stopped = runner.stop(outcome.session.sessionId);
    expect(stopped?.exitCode).toBe(0);
    expect(stopped?.crashed).toBe(false);
    expect(runner.running()).toHaveLength(0);
  });

  it('devolve null para sessões desconhecidas', () => {
    const runner = new LocalGameRunner();
    expect(runner.status('sessao-inexistente')).toBeNull();
    expect(runner.stop('sessao-inexistente')).toBeNull();
  });
});

describe('medida de sessão', () => {
  it('mede segundos entre dois instantes', () => {
    expect(measureSeconds(new Date(0), new Date(90_000))).toBe(90);
  });

  it('nunca devolve negativo', () => {
    expect(measureSeconds(new Date(90_000), new Date(0))).toBe(0);
  });

  it('um código de saída não-zero é crash', () => {
    expect(isCrashExitCode(1)).toBe(true);
    expect(isCrashExitCode(0)).toBe(false);
    expect(isCrashExitCode(null)).toBe(false);
  });
});

describe('sessão e grupo de processos', () => {
  /**
   * O `wine` arranca o jogo pelo `wineserver` e **sai**: o jogo corre como
   * neto. Se a sessão medisse só o filho directo, o tempo jogado acabava
   * a meio — e a prova real apanhou isto (com GameMode, a sessão morria aos
   * 6 s e o jogo continuava).
   */
  it('a sessão sobrevive à saída do filho quando o jogo corre como neto', async () => {
    const runner = new LocalGameRunner();
    // O neto é um executável com nome único: a marca na tabela de processos
    // tem de ser única, ou um teste paralelo com a mesma marca manteria a
    // sessão viva (a tabela de processos é partilhada por toda a máquina).
    const neto = makeExecutable(`neto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 0, 5_000);
    const marca = neto.split('/').pop() ?? neto;
    // O filho directo sai em 1 s e deixa um neto de 5 s no mesmo grupo — é o
    // que o `wine` faz: arranca o jogo pelo `wineserver` e sai.
    const outcome = await runner.launch({
      gameId: 'jogo-com-netos',
      executablePath: '/bin/sh',
      args: ['-c', `${neto} & exec sleep 1`],
      // A marca do jogo na tabela de processos: é ela que diz se o jogo corre
      // (o `wine` arranca o jogo por outro grupo — a marca é que o encontra).
      processMatch: marca,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    // Passados 3 s, o filho já saiu — mas a sessão continua viva.
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
    expect(runner.running()).toHaveLength(1);
    // E o tempo medido já passa do filho directo (1 s): a medida é do grupo.
    const estado = runner.status(outcome.session.sessionId);
    expect(estado?.durationSeconds ?? 0).toBeGreaterThanOrEqual(2);
    // Parar fecha o grupo inteiro — e a sessão com ele.
    const parado = runner.stop(outcome.session.sessionId);
    expect(parado?.endedAt).not.toBeNull();
    expect(runner.running()).toHaveLength(0);
  }, 15_000);

  it('um processo sem netos termina a sessão quando sai', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({ gameId: 'jogo-simples', executablePath: '/bin/sh', args: ['-c', 'exit 0'] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const summary = await runner.wait(outcome.session.sessionId);
    expect(summary?.exitCode).toBe(0);
    expect(runner.running()).toHaveLength(0);
  });
});

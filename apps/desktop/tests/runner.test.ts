import { describe, expect, it } from 'vitest';
import { LocalGameRunner } from '@nexora/runner';

/**
 * Runner local — arranque e medição reais.
 *
 * Estes testes correm processos de verdade (`sleep`, `sh`): a medição do
 * launcher não pode ser fingida com números inventados. O ciclo completo —
 * lançar, esperar o fim, somar o tempo — é o que a biblioteca grava.
 */
describe('LocalGameRunner', () => {
  it('lança um processo e mede a sessão até ao fim natural', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({
      gameId: 'jogo-teste',
      executablePath: '/bin/sleep',
      args: ['1'],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.session.processId).toBeGreaterThan(0);

    const summary = await runner.wait(outcome.session.sessionId);
    expect(summary?.endedAt).not.toBeNull();
    expect(summary?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(summary?.exitCode).toBe(0);
    expect(summary?.crashed).toBe(false);
  });

  it('marca um código de saída diferente de zero como crash', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({
      gameId: 'jogo-crash',
      executablePath: '/bin/sh',
      args: ['-c', 'exit 3'],
    });
    if (!outcome.ok) {
      throw new Error('arranque falhou');
    }
    const summary = await runner.wait(outcome.session.sessionId);
    expect(summary?.exitCode).toBe(3);
    expect(summary?.crashed).toBe(true);
  });

  it('recusa um executável inexistente', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({
      gameId: 'jogo-fantasma',
      executablePath: '/bin/nao-existe-de-todo',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reasonKey).toBe('missing-executable');
  });

  it('recusa um segundo arranque do mesmo jogo em curso', async () => {
    const runner = new LocalGameRunner();
    const first = await runner.launch({
      gameId: 'jogo-duplo',
      executablePath: '/bin/sleep',
      args: ['2'],
    });
    expect(first.ok).toBe(true);
    const second = await runner.launch({
      gameId: 'jogo-duplo',
      executablePath: '/bin/sleep',
      args: ['2'],
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reasonKey).toBe('already-running');
    }
  });

  it('lista as sessões em curso', async () => {
    const runner = new LocalGameRunner();
    const outcome = await runner.launch({
      gameId: 'jogo-lista',
      executablePath: '/bin/sleep',
      args: ['1'],
    });
    if (!outcome.ok) {
      throw new Error('arranque falhou');
    }
    const running = runner.running();
    expect(running.some((session) => session.sessionId === outcome.session.sessionId)).toBe(true);
    await runner.wait(outcome.session.sessionId);
    expect(runner.running()).toHaveLength(0);
  });
});
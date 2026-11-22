import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Conquistas e pontos — a economia do launcher.
 *
 * O que estes testes travam: nada se desbloqueia sem sessões reais, os pontos
 * entram no livro **uma vez** por conquista (ler duas vezes não repete), e o
 * saldo é a soma das entradas — nunca um campo que possa divergir.
 */

/**
 * O relógio é congelado às 12:00 UTC.
 *
 * As sessões começam "agora" (o relógio do servidor) e a regra da coruja
 * dispara entre a meia-noite e as 5 da manhã: sem o relógio congelado, o
 * teste passava de dia e falhava de noite — e a prova correu às 01:30 UTC.
 */
beforeAll(() => {
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

/** App e repositórios partilhados. */
interface World {
  readonly app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  readonly repositories: Awaited<ReturnType<typeof buildTestApp>>['repositories'];
  readonly email: (label: string) => string;
}

async function world(): Promise<World> {
  const built = await buildTestApp();
  const stamp = Date.now();
  let counter = 0;
  return {
    ...built,
    email: (label: string) => `economia-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

/** Semeia uma sessão terminada com uma duração conhecida.
 *
 * A hora de início é o relógio do servidor — quem precisa de controlar a
 * hora testa a regra no domínio, com a data injectada.
 */
async function sessao(w: World, userId: string, gameId: string, minutos: number): Promise<void> {
  const started = await w.repositories.sessions.start(userId, gameId);
  const startedAt = new Date(started.startedAt);
  const endedAt = new Date(startedAt.getTime() + minutos * 60 * 1000);
  await w.repositories.sessions.end(userId, started.id, { endedAt, exitCode: 0 });
}

/** Lê as conquistas. */
async function conquistas(w: World, token: string): Promise<{
  items: { id: string; unlocked: boolean; progress: number; value: number; holders: number; points: number }[];
  balance: number;
}> {
  const response = await w.app.inject({ method: 'GET', url: '/api/v1/achievements', headers: authHeader(token) });
  return response.json() as never;
}

describe('conquistas', () => {
  it('exige sessão', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/achievements' })).statusCode).toBe(401);
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/points' })).statusCode).toBe(401);
  });

  it('sem sessões nada está desbloqueado e o saldo é zero', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('sem-sessoes'));
    const body = await conquistas(w, member.accessToken);
    expect(body.items.every((item) => !item.unlocked)).toBe(true);
    expect(body.items.every((item) => item.progress === 0)).toBe(true);
    expect(body.balance).toBe(0);
  });

  it('uma sessão desbloqueia a primeira conquista e paga os pontos', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('primeira'));
    await sessao(w, member.userId, 'hollow-knight', 30);

    const body = await conquistas(w, member.accessToken);
    const primeira = body.items.find((item) => item.id === 'first-session')!;
    expect(primeira.unlocked).toBe(true);
    expect(primeira.value).toBe(1);
    expect(body.balance).toBe(10);
  });

  it('ler duas vezes não repete os pontos (o livro é de acréscimos únicos)', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('idempotente'));
    await sessao(w, member.userId, 'hollow-knight', 30);

    await conquistas(w, member.accessToken);
    const segunda = await conquistas(w, member.accessToken);
    expect(segunda.balance).toBe(10);
    // A conquista continua desbloqueada — não houve segundo pagamento.
    expect(segunda.items.find((item) => item.id === 'first-session')?.unlocked).toBe(true);
  });

  it('dez horas desbloqueiam a conquista de dez horas', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('dez-horas'));
    await sessao(w, member.userId, 'hollow-knight', 300);
    await sessao(w, member.userId, 'repo', 300);

    const body = await conquistas(w, member.accessToken);
    expect(body.items.find((item) => item.id === 'ten-hours')?.unlocked).toBe(true);
    // Sessões de 5 h também são maratona: 10 (primeira) + 50 (dez horas) + 60
    // (maratona) = 120. O código está certo — a maratona é real.
    expect(body.balance).toBe(120);
  });

  it('a maratona olha para a duração real da sessão', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('maratona'));
    // Duas horas de sessão: a maratona cumpre-se.
    await sessao(w, member.userId, 'repo', 120);

    const body = await conquistas(w, member.accessToken);
    expect(body.items.find((item) => item.id === 'marathon')?.unlocked).toBe(true);
    // A coruja (sessão entre a meia-noite e as 5 h) não é testável por aqui: a
    // hora de início é o relógio do servidor, e uma sessão semeada começa
    // "agora". A regra está testada no domínio, com a hora controlada.
    expect(body.items.find((item) => item.id === 'night-owl')?.unlocked).toBe(false);
  });

  it('o progresso parcial é um número entre 0 e 1', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('parcial'));
    await sessao(w, member.userId, 'hollow-knight', 300); // 5 h de 10 h
    const body = await conquistas(w, member.accessToken);
    const dezHoras = body.items.find((item) => item.id === 'ten-hours')!;
    expect(dezHoras.unlocked).toBe(false);
    expect(dezHoras.progress).toBeCloseTo(0.5, 2);
  });

  it('a contagem global é o número real de jogadores', async () => {
    const w = await world();
    const primeira = await registerUser(w.app, w.email('global-1'));
    const segunda = await registerUser(w.app, w.email('global-2'));
    await sessao(w, primeira.userId, 'hollow-knight', 30);
    await conquistas(w, primeira.accessToken);

    const body = await conquistas(w, segunda.accessToken);
    expect(body.items.find((item) => item.id === 'first-session')?.holders).toBe(1);
  });
});

describe('livro de pontos', () => {
  it('devolve o saldo e as entradas de onde vieram', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('livro'));
    await sessao(w, member.userId, 'hollow-knight', 30);
    await conquistas(w, member.accessToken);

    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/points', headers: authHeader(member.accessToken) })).json() as {
      balance: number;
      ledger: { delta: number; reason: string }[];
    };
    expect(body.balance).toBe(10);
    expect(body.ledger).toHaveLength(1);
    expect(body.ledger[0]?.delta).toBe(10);
    expect(body.ledger[0]?.reason).toBe('achievement.first-session');
  });
});
import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Estatísticas e timeline — agregadas no servidor.
 *
 * O que estes testes travam: as contas vêm das **sessões reais** (nada de
 * soma no browser), a hora de pico vem do histograma, e a timeline junta
 * eventos de tipos diferentes ordenados pelo mais recente.
 */

/** Cria um utilizador com sessões de jogo semeadas. */
async function userWithSessions(hours: number): Promise<{ app: Awaited<ReturnType<typeof buildTestApp>>['app']; repositories: Awaited<ReturnType<typeof buildTestApp>>['repositories']; accessToken: string; userId: string }> {
  const built = await buildTestApp();
  const user = await registerUser(built.app, `stats-${Date.now()}-${hours}@nexora.local`);

  // Duas sessões de 90 min. A duração é fim menos início: como o start marca
  // o agora, o fim tem de ser 90 min no futuro — e é isso que dá as 3 h.
  const first = await built.repositories.sessions.start(user.userId, 'minecraft');
  await built.repositories.sessions.end(user.userId, first.id, {
    endedAt: new Date(first.startedAt.getTime() + 90 * 60 * 1000),
    exitCode: 0,
  });
  const second = await built.repositories.sessions.start(user.userId, 'minecraft');
  await built.repositories.sessions.end(user.userId, second.id, {
    endedAt: new Date(second.startedAt.getTime() + 90 * 60 * 1000),
    exitCode: 0,
  });
  void hours;
  return { app: built.app, repositories: built.repositories, accessToken: user.accessToken, userId: user.userId };
}

describe('GET /api/v1/stats/summary', () => {
  it('exige sessão', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/stats/summary' });
    expect(response.statusCode).toBe(401);
  });

  it('agrega o tempo real das sessões', async () => {
    const seeded = await userWithSessions(3);
    const response = await seeded.app.inject({
      method: 'GET',
      url: '/api/v1/stats/summary',
      headers: authHeader(seeded.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      totalHours: number;
      sessionCount: number;
      topGames: { gameId: string; hours: number }[];
    };
    // 2 sessões de 90 min = 180 min = 3 h.
    expect(body.totalHours).toBe(3);
    expect(body.sessionCount).toBe(2);
    expect(body.topGames[0]?.gameId).toBe('minecraft');
    expect(body.topGames[0]?.hours).toBe(3);
  });

  it('sem sessões, o resumo é zero', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'sem-sessoes@nexora.local');
    const response = await built.app.inject({
      method: 'GET',
      url: '/api/v1/stats/summary',
      headers: authHeader(user.accessToken),
    });
    const body = response.json() as { totalHours: number; peakHour: number | null; topGames: unknown[] };
    expect(body.totalHours).toBe(0);
    expect(body.peakHour).toBeNull();
    expect(body.topGames).toHaveLength(0);
  });
});

describe('GET /api/v1/timeline', () => {
  it('exige sessão', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/timeline' });
    expect(response.statusCode).toBe(401);
  });

  it('junta sessões do mais recente para o mais antigo', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'tl@nexora.local');
    const first = await built.repositories.sessions.start(user.userId, 'minecraft');
    await built.repositories.sessions.end(user.userId, first.id, {
      endedAt: new Date(Date.now() - 3600 * 1000),
      exitCode: 0,
    });

    const response = await built.app.inject({
      method: 'GET',
      url: '/api/v1/timeline',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: { type: string; at: string }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.type).toBe('session-ended');
    // Ordenada pelo mais recente.
    for (let index = 1; index < body.items.length; index += 1) {
      expect(body.items[index - 1]!.at >= body.items[index]!.at).toBe(true);
    }
  });

  it('limite inválido devolve 400', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'tl2@nexora.local');
    const response = await built.app.inject({
      method: 'GET',
      url: '/api/v1/timeline?limit=999',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(400);
  });

  it('um limite de 1 devolve no máximo um evento', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'tl3@nexora.local');
    await built.repositories.wishlist.add(user.userId, 'terraria', 'w1');
    await built.repositories.wishlist.add(user.userId, 'stardew-valley', 'w2');

    const response = await built.app.inject({
      method: 'GET',
      url: '/api/v1/timeline?limit=1',
      headers: authHeader(user.accessToken),
    });
    expect((response.json() as { items: unknown[] }).items).toHaveLength(1);
  });
});
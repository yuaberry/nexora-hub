import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Sessões de jogo — o tempo jogado.
 *
 * A sessão nasce no arranque e termina com o **código de saída** do
 * executável. Um código diferente de zero é um *crash*: fica registado e a
 * interface mostra-o.
 */
describe('sessões de jogo', () => {
  it('inicia e termina uma sessão, somando o tempo à biblioteca', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'sessao1@nexora.local');

    await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: {
        externalKey: 'terraria',
        title: 'Terraria',
        installPath: '/jogos/terraria',
        executablePath: '/jogos/terraria/terraria',
      },
    });

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeader(user.accessToken),
      payload: { gameId: 'terraria' },
    });
    expect(started.statusCode).toBe(201);
    const sessionId = (started.json() as { session: { id: string; state: string } }).session.id;
    expect((started.json() as { session: { state: string } }).session.state).toBe('running');

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const ended = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(user.accessToken),
      payload: { exitCode: 0 },
    });
    expect(ended.statusCode).toBe(200);
    const body = ended.json() as {
      session: { state: string; durationSeconds: number; exitCode: number; crashed: boolean };
      lastPlayedAt: string | null;
    };
    expect(body.session.state).toBe('ended');
    expect(body.session.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(body.session.crashed).toBe(false);
    expect(body.lastPlayedAt).not.toBeNull();

    const library = await app.inject({
      method: 'GET',
      url: '/api/v1/library',
      headers: authHeader(user.accessToken),
    });
    const entries = (library.json() as { items: Array<{ totalSeconds: number }> }).items;
    expect(entries[0]?.totalSeconds).toBe(body.session.durationSeconds);
    await app.close();
  });

  it('um código de saída diferente de zero marca a sessão como crash', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'sessao2@nexora.local');

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeader(user.accessToken),
      payload: { gameId: 'valorant' },
    });
    const sessionId = (started.json() as { session: { id: string } }).session.id;

    const ended = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(user.accessToken),
      payload: { exitCode: 42 },
    });
    const session = (ended.json() as { session: { crashed: boolean; exitCode: number } }).session;
    expect(session.crashed).toBe(true);
    expect(session.exitCode).toBe(42);
    await app.close();
  });

  it('terminar duas vezes a mesma sessão dá 404 na segunda', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'sessao3@nexora.local');

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeader(user.accessToken),
      payload: { gameId: 'fortnite' },
    });
    const sessionId = (started.json() as { session: { id: string } }).session.id;

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(user.accessToken),
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(user.accessToken),
      payload: {},
    });
    expect(second.statusCode).toBe(404);
    await app.close();
  });

  it('a sessão de outro utilizador dá 404, nunca 403', async () => {
    const { app } = await buildTestApp();
    const owner = await registerUser(app, 'dono-sessao@nexora.local');
    const stranger = await registerUser(app, 'estranho-sessao@nexora.local');

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeader(owner.accessToken),
      payload: { gameId: 'roblox' },
    });
    const sessionId = (started.json() as { session: { id: string } }).session.id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(stranger.accessToken),
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('as sessões são auditadas no início e no fim', async () => {
    const { app, repositories } = await buildTestApp();
    const user = await registerUser(app, 'sessao4@nexora.local');

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeader(user.accessToken),
      payload: { gameId: 'minecraft' },
    });
    const sessionId = (started.json() as { session: { id: string } }).session.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: authHeader(user.accessToken),
      payload: { exitCode: 0 },
    });

    const audit = await repositories.audit.list({ limit: 50, offset: 0 });
    const actions = audit.items.map((entry) => entry.action);
    expect(actions).toContain('session.start');
    expect(actions).toContain('session.end');
    await app.close();
  });
});
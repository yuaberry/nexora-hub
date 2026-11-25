import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Tarefas — medida real, prémio auditado, uma reclamação por período.
 *
 * As medidas são as sessões reais do utilizador. A tarefa de **minutos** é
 * coberta pelos testes puros do domínio (`evaluateTask`); aqui provam-se as
 * que dependem de lançamentos — que se medem sem esperar uma hora.
 */

/** Lança um jogo e termina a sessão (um lançamento real). */
async function lancar(
  app: Awaited<ReturnType<typeof buildTestApp>>['app'],
  token: string,
  gameId: string,
): Promise<void> {
  const started = await app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    headers: authHeader(token),
    payload: { gameId },
  });
  const id = started.json<{ session: { id: string } }>().session.id;
  await app.inject({
    method: 'POST',
    url: `/api/v1/sessions/${id}/end`,
    headers: authHeader(token),
    payload: {},
  });
}

describe('tarefas', () => {
  it('um lançamento completa a tarefa diária e paga os pontos', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `task-${Date.now()}@nexora.local`);
    const headers = { ...authHeader(created.accessToken) };

    const antes = await built.app.inject({ method: 'GET', url: '/api/v1/tasks', headers });
    const diariaAntes = antes.json<{ items: { id: string; value: number; complete: boolean }[] }>().items.find((t) => t.id === 'daily-launch');
    expect(diariaAntes?.value).toBe(0);
    expect(diariaAntes?.complete).toBe(false);

    // Um lançamento real.
    await lancar(built.app, created.accessToken, '/home/user/games/hollow-knight');

    const depois = await built.app.inject({ method: 'GET', url: '/api/v1/tasks', headers });
    const diariaDepois = depois.json<{ items: { id: string; value: number; complete: boolean }[] }>().items.find((t) => t.id === 'daily-launch');
    expect(diariaDepois?.value).toBe(1);
    expect(diariaDepois?.complete).toBe(true);

    // Reclamar paga.
    const claim = await built.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/daily-launch/claim',
      headers,
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json<{ awarded: number }>().awarded).toBe(5);

    // O saldo reflecte o prémio.
    const pontos = await built.app.inject({ method: 'GET', url: '/api/v1/points', headers });
    expect(pontos.json<{ balance: number }>().balance).toBe(5);

    // Reclamar outra vez no mesmo período é recusado.
    const repetido = await built.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/daily-launch/claim',
      headers,
    });
    expect(repetido.statusCode).toBe(409);
  });

  it('três jogos distintos completam a tarefa semanal', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `task-${Date.now()}@nexora.local`);
    const headers = { ...authHeader(created.accessToken) };

    for (const game of ['/games/a', '/games/b', '/games/c']) {
      await lancar(built.app, created.accessToken, game);
    }

    const depois = await built.app.inject({ method: 'GET', url: '/api/v1/tasks', headers });
    const semanal = depois.json<{ items: { id: string; value: number; complete: boolean }[] }>().items.find((t) => t.id === 'weekly-distinct');
    expect(semanal?.value).toBe(3);
    expect(semanal?.complete).toBe(true);

    const claim = await built.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/weekly-distinct/claim',
      headers,
    });
    expect(claim.json<{ awarded: number }>().awarded).toBe(25);
  });

  it('uma tarefa incompleta não paga', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `task-${Date.now()}@nexora.local`);
    const claim = await built.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/daily-launch/claim',
      headers: authHeader(created.accessToken),
    });
    expect(claim.statusCode).toBe(403);
  });

  it('uma tarefa inexistente devolve 404', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `task-${Date.now()}@nexora.local`);
    const claim = await built.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/nao-existe/claim',
      headers: authHeader(created.accessToken),
    });
    expect(claim.statusCode).toBe(404);
  });
});
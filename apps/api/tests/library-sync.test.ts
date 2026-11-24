import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Biblioteca sincronizada — a conta guarda metadado, não caminhos.
 *
 * O que estes testes travam: sincronizar substitui pela chave externa
 * (enviar duas vezes não duplica, e o relatório conta o que actualizou); um
 * caminho local como capa é **recusado** (só URLs públicas sobem); e a
 * biblioteca é do utilizador (outro não vê).
 */

/** Uma entrada de prova. */
function entrada(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalKey: '/home/user/games/hollow-knight',
    title: 'Hollow Knight',
    steamAppId: '367520',
    coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg',
    installed: true,
    favorite: false,
    totalSeconds: 3_600,
    ...overrides,
  };
}

describe('biblioteca sincronizada', () => {
  it('sincronizar conta o que entrou e o que actualizou (sem duplicar)', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `lib-${Date.now()}@nexora.local`);
    const headers = { ...authHeader(created.accessToken) };

    const primeira = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/library/sync',
      headers,
      payload: { entries: [entrada(), entrada({ externalKey: '/home/user/games/repo', title: 'R.E.P.O.' })] },
    });
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json<{ added: number; updated: number }>()).toEqual({ ok: true, added: 2, updated: 0 });

    const segunda = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/library/sync',
      headers,
      payload: { entries: [entrada({ title: 'Hollow Knight (actualizado)' })] },
    });
    expect(segunda.json<{ added: number; updated: number }>()).toEqual({ ok: true, added: 0, updated: 1 });

    const lista = await built.app.inject({ method: 'GET', url: '/api/v1/library/mine', headers });
    const items = lista.json<{ items: { title: string }[]; total: number }>();
    expect(items.total).toBe(2);
    expect(items.items.map((item) => item.title)).toContain('Hollow Knight (actualizado)');
  });

  it('um caminho local como capa é recusado (só URLs públicas sobem)', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `lib-${Date.now()}@nexora.local`);
    const recusado = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/library/sync',
      headers: authHeader(created.accessToken),
      payload: { entries: [entrada({ coverUrl: '/home/user/minha-capa.png' })] },
    });
    expect(recusado.statusCode).toBe(400);
  });

  it('a biblioteca é do utilizador (o de outro não aparece)', async () => {
    const built = await buildTestApp();
    const meu = await registerUser(built.app, `lib-${Date.now()}-eu@nexora.local`);
    const outro = await registerUser(built.app, `lib-${Date.now()}-outro@nexora.local`);
    await built.app.inject({
      method: 'PUT',
      url: '/api/v1/library/sync',
      headers: authHeader(meu.accessToken),
      payload: { entries: [entrada()] },
    });
    const vista = await built.app.inject({
      method: 'GET',
      url: '/api/v1/library/mine',
      headers: authHeader(outro.accessToken),
    });
    expect(vista.json<{ total: number }>().total).toBe(0);
  });

  it('sem sessão não sincroniza', async () => {
    const built = await buildTestApp();
    const resposta = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/library/sync',
      payload: { entries: [entrada()] },
    });
    expect(resposta.statusCode).toBe(401);
  });
});
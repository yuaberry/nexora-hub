import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Pesquisa de jogos por HTTP.
 *
 * O ranking vive no `@nexora/core` (`searchGames`): a API alimenta-o com o
 * contexto de posse e devolve o resultado. Um "l" encontra League of Legends
 * e "mncft" encontra Minecraft — o mesmo motor da barra de pesquisa do
 * desktop.
 */
describe('GET /api/v1/games/search', () => {
  it('"l" coloca League of Legends em primeiro', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'pesquisa1@nexora.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/games/search?q=l',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ game: { id: string }; match: string }> };
    expect(body.items[0]?.game.id).toBe('league-of-legends');
    expect(body.items[0]?.match).toBe('prefix');
    await app.close();
  });

  it('"mncft" encontra Minecraft', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'pesquisa2@nexora.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/games/search?q=mncft',
      headers: authHeader(user.accessToken),
    });
    const body = response.json() as { items: Array<{ game: { id: string } }> };
    expect(body.items.map((item) => item.game.id)).toContain('minecraft');
    await app.close();
  });

  it('limite inválido dá 400 com o caminho do campo', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'pesquisa3@nexora.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/games/search?q=lol&limit=999',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { details: Array<{ path: string }> } }).error.details[0]?.path).toBe('limit');
    await app.close();
  });

  it('sem termo de pesquisa dá 400', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'pesquisa4@nexora.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/games/search?q=',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
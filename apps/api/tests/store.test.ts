import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Loja — directório público e lista de desejos.
 *
 * O que estes testes travam: o directório é **público** (ver sem conta), o
 * filtro adulto esconde por omissão, uma plataforma inválida devolve `400`
 * (não `500`), e a lista de desejos é do utilizador — recurso alheio devolve
 * `404`, nunca `403`.
 */

describe('directório da loja', () => {
  it('é público: mostra jogos sem sessão', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/store' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: { id: string; links: { url: string }[] }[]; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.every((item) => item.links.length > 0)).toBe(true);
  });

  it('esconde conteúdo adulto por omissão', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/store?q=adulto' });
    expect((response.json() as { total: number }).total).toBe(0);
  });

  it('filtra por plataforma', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/store?platform=linux' });
    const body = response.json() as { items: { platforms: string[] }[] };
    expect(body.items.every((item) => item.platforms.includes('linux'))).toBe(true);
  });

  it('uma plataforma inválida devolve 400, não 500', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/store?platform=playstation' });
    expect(response.statusCode).toBe(400);
  });
});

describe('lista de desejos', () => {
  it('exige sessão', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/wishlist' });
    expect(response.statusCode).toBe(401);
  });

  it('adiciona, lista e remove', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'wish@nexora.local');

    const added = await built.app.inject({
      method: 'POST',
      url: '/api/v1/wishlist/cyberpunk-2077',
      headers: authHeader(user.accessToken),
    });
    expect(added.statusCode).toBe(201);

    const list = await built.app.inject({ method: 'GET', url: '/api/v1/wishlist', headers: authHeader(user.accessToken) });
    expect((list.json() as { items: { gameId: string }[] }).items.map((item) => item.gameId)).toContain('cyberpunk-2077');

    const removed = await built.app.inject({
      method: 'DELETE',
      url: '/api/v1/wishlist/cyberpunk-2077',
      headers: authHeader(user.accessToken),
    });
    expect(removed.statusCode).toBe(204);

    const after = await built.app.inject({ method: 'GET', url: '/api/v1/wishlist', headers: authHeader(user.accessToken) });
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('adicionar duas vezes não duplica', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'wish2@nexora.local');

    await built.app.inject({ method: 'POST', url: '/api/v1/wishlist/terraria', headers: authHeader(user.accessToken) });
    await built.app.inject({ method: 'POST', url: '/api/v1/wishlist/terraria', headers: authHeader(user.accessToken) });

    const list = await built.app.inject({ method: 'GET', url: '/api/v1/wishlist', headers: authHeader(user.accessToken) });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it('um jogo que não existe devolve 404', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'wish3@nexora.local');
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/v1/wishlist/jogo-inexistente',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('remover o que não está lá devolve 404', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'wish4@nexora.local');
    const response = await built.app.inject({
      method: 'DELETE',
      url: '/api/v1/wishlist/terraria',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(404);
  });
});
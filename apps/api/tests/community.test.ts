import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Comunidade — comentários e reviews.
 *
 * O que estes testes travam:
 *
 * - comentar exige sessão, e **apagar o de outro devolve 404** (não 403);
 * - a review é **uma por utilizador e jogo** (`PUT` substitui, não duplica);
 * - o agregado é honesto: média real, e `null` quando ninguém votou na
 *   categoria;
 * - nota fora de 1–10 é `400`, não `500`.
 */

describe('comentários', () => {
  it('exige sessão para comentar', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/v1/games/league-of-legends/comments',
      payload: { body: 'Muito bom!' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('cria, lista e apaga um comentário', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'com3@nexora.local');

    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/games/league-of-legends/comments',
      headers: authHeader(user.accessToken),
      payload: { body: 'Melhor jogo do mundo.' },
    });
    expect(created.statusCode).toBe(201);
    const comment = created.json() as { id: string; body: string };

    const list = await built.app.inject({ method: 'GET', url: '/api/v1/games/league-of-legends/comments' });
    expect((list.json() as { items: { id: string }[] }).items.some((item) => item.id === comment.id)).toBe(true);

    const removed = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/comments/${comment.id}`,
      headers: authHeader(user.accessToken),
    });
    expect(removed.statusCode).toBe(204);

    const after = await built.app.inject({ method: 'GET', url: '/api/v1/games/league-of-legends/comments' });
    expect((after.json() as { items: { id: string }[] }).items.some((item) => item.id === comment.id)).toBe(false);
  });

  it('apagar o comentário de outro devolve 404, não 403', async () => {
    const built = await buildTestApp();
    const owner = await registerUser(built.app, 'dono@nexora.local');
    const stranger = await registerUser(built.app, 'estranho@nexora.local');

    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/games/terraria/comments',
      headers: authHeader(owner.accessToken),
      payload: { body: 'Meu comentário.' },
    });
    const comment = created.json() as { id: string };

    const attempt = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/comments/${comment.id}`,
      headers: authHeader(stranger.accessToken),
    });
    expect(attempt.statusCode).toBe(404);
  });

  it('recusa um corpo vazio', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'com4@nexora.local');
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/v1/games/terraria/comments',
      headers: authHeader(user.accessToken),
      payload: { body: '' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('reviews', () => {
  it('uma review por utilizador e jogo: o PUT substitui', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'rev1@nexora.local');

    const first = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/league-of-legends/reviews/me',
      headers: authHeader(user.accessToken),
      payload: { rating: 6, body: 'Bom, mas o cliente…' },
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { rating: number }).rating).toBe(6);

    const second = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/league-of-legends/reviews/me',
      headers: authHeader(user.accessToken),
      payload: { rating: 9, story: 8, gameplay: 10 },
    });
    expect((second.json() as { rating: number }).rating).toBe(9);

    const list = await built.app.inject({ method: 'GET', url: '/api/v1/games/league-of-legends/reviews' });
    const body = list.json() as { items: { rating: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.rating).toBe(9);
  });

  it('o agregado médio é honesto (e null quando ninguém votou na categoria)', async () => {
    const built = await buildTestApp();
    const first = await registerUser(built.app, 'rev2@nexora.local');
    const second = await registerUser(built.app, 'rev3@nexora.local');

    await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/terraria/reviews/me',
      headers: authHeader(first.accessToken),
      payload: { rating: 8, story: 10, gameplay: 6 },
    });
    await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/terraria/reviews/me',
      headers: authHeader(second.accessToken),
      payload: { rating: 6, story: 8, gameplay: 8 },
    });

    const response = await built.app.inject({ method: 'GET', url: '/api/v1/games/terraria/reviews' });
    const body = response.json() as {
      aggregate: { count: number; averageRating: number; averageStory: number | null; averageSound: number | null };
    };
    expect(body.aggregate.count).toBe(2);
    expect(body.aggregate.averageRating).toBe(7);
    expect(body.aggregate.averageStory).toBe(9);
    // Ninguém votou em som: a média é `null`, não zero.
    expect(body.aggregate.averageSound).toBeNull();
  });

  it('nota fora de 1–10 devolve 400', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, 'rev4@nexora.local');
    const response = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/terraria/reviews/me',
      headers: authHeader(user.accessToken),
      payload: { rating: 11 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('apagar a review de outro devolve 404', async () => {
    const built = await buildTestApp();
    const owner = await registerUser(built.app, 'rev5@nexora.local');
    const stranger = await registerUser(built.app, 'rev6@nexora.local');

    const created = await built.app.inject({
      method: 'PUT',
      url: '/api/v1/games/terraria/reviews/me',
      headers: authHeader(owner.accessToken),
      payload: { rating: 7 },
    });
    const review = created.json() as { id: string };

    const attempt = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/reviews/${review.id}`,
      headers: authHeader(stranger.accessToken),
    });
    expect(attempt.statusCode).toBe(404);
  });
});
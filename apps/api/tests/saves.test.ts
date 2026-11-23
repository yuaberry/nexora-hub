import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Saves na nuvem — o progresso de quem joga, guardado com a conta.
 *
 * O que estes testes travam: enviar guarda uma **versão nova** (a revisão
 * sobe, nunca reutiliza); listar devolve só os meus saves; descarregar devolve
 * os bytes que enviei; e um save de outro utilizador devolve **404**, não 403
 * — a existência de um save que não é teu não é informação a dar.
 */

/** Um arquivo de save mínimo (o conteúdo é opaco para a API). */
function archive(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

/** Cabeçalhos do envio. */
function uploadHeaders(gameKey: string, checksum: string, label?: string): Record<string, string> {
  return {
    'content-type': 'application/gzip',
    'x-game-key': gameKey,
    'x-save-checksum': checksum,
    ...(label === undefined ? {} : { 'x-save-label': label }),
  };
}

describe('saves na nuvem', () => {
  it('envia, lista, descarrega e apaga', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, `saves-${Date.now()}-a@nexora.local`);
    const headers = { ...authHeader(user.accessToken) };
    const game = `/home/user/games/hollow-knight`;
    const content = archive([1, 2, 3, 4, 5]);

    const uploaded = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: { ...headers, ...uploadHeaders(game, 'checksum-abc123', 'antes do boss') },
      payload: content,
    });
    expect(uploaded.statusCode).toBe(201);
    const save = uploaded.json<{ save: { id: string; revision: number; gameKey: string } }>().save;
    expect(save.gameKey).toBe(game);

    const listed = await built.app.inject({
      method: 'GET',
      url: `/api/v1/saves?game=${encodeURIComponent(game)}`,
      headers,
    });
    expect(listed.statusCode).toBe(200);
    const items = listed.json<{ items: { id: string }[] }>().items;
    expect(items.map((item) => item.id)).toContain(save.id);

    const downloaded = await built.app.inject({
      method: 'GET',
      url: `/api/v1/saves/${save.id}`,
      headers,
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.rawPayload.equals(content)).toBe(true);
    expect(downloaded.headers['x-save-revision']).toBe(String(save.revision));

    const removed = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/saves/${save.id}`,
      headers,
    });
    expect(removed.statusCode).toBe(200);
    const again = await built.app.inject({
      method: 'GET',
      url: `/api/v1/saves/${save.id}`,
      headers,
    });
    expect(again.statusCode).toBe(404);
  });

  it('a revisão sobe a cada versão nova', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, `saves-${Date.now()}-b@nexora.local`);
    const headers = { ...authHeader(user.accessToken) };
    const game = `/home/user/games/repo`;

    const first = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: { ...headers, ...uploadHeaders(game, 'checksum-1') },
      payload: archive([1]),
    });
    const second = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: { ...headers, ...uploadHeaders(game, 'checksum-2') },
      payload: archive([2]),
    });
    const revisions = [
      first.json<{ save: { revision: number } }>().save.revision,
      second.json<{ save: { revision: number } }>().save.revision,
    ];
    expect(revisions[1]).toBe((revisions[0] ?? 0) + 1);
  });

  it('o save de outro utilizador devolve 404', async () => {
    const built = await buildTestApp();
    const owner = await registerUser(built.app, `saves-${Date.now()}-owner@nexora.local`);
    const stranger = await registerUser(built.app, `saves-${Date.now()}-stranger@nexora.local`);
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: { ...authHeader(owner.accessToken), ...uploadHeaders('/games/x', 'checksum-xyz') },
      payload: archive([9, 9, 9]),
    });
    const id = upload.json<{ save: { id: string } }>().save.id;

    const stolen = await built.app.inject({
      method: 'GET',
      url: `/api/v1/saves/${id}`,
      headers: authHeader(stranger.accessToken),
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('sem sessão não envia nem lista', async () => {
    const built = await buildTestApp();
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: uploadHeaders('/games/x', 'checksum-abc'),
      payload: archive([1]),
    });
    expect(upload.statusCode).toBe(401);
    const list = await built.app.inject({ method: 'GET', url: '/api/v1/saves' });
    expect(list.statusCode).toBe(401);
  });

  it('cabeçalhos em falta recusam com 400', async () => {
    const built = await buildTestApp();
    const user = await registerUser(built.app, `saves-${Date.now()}-c@nexora.local`);
    const bad = await built.app.inject({
      method: 'POST',
      url: '/api/v1/saves',
      headers: { ...authHeader(user.accessToken), 'content-type': 'application/gzip' },
      payload: archive([1]),
    });
    expect(bad.statusCode).toBe(400);
  });
});
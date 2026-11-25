import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Capturas na nuvem — o que sobe é do utilizador.
 *
 * O que estes testes travam: subir uma captura guarda o índice; listar
 * devolve as minhas (de um jogo quando pedido); descarregar devolve os bytes
 * que subiram; apagar é do dono; e a captura de outro utilizador devolve
 * **404**, nunca 403.
 */

/** Um PNG mínimo (assinatura `\x89PNG`). */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Cabeçalhos do envio. */
function headers(token: string, gameKey: string, fileName = 'jogo-1.png'): Record<string, string> {
  return { ...authHeader(token), 'content-type': 'image/png', 'x-game-key': gameKey, 'x-file-name': fileName };
}

describe('capturas na nuvem', () => {
  it('sobe, lista, descarrega e apaga', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `shot-${Date.now()}@nexora.local`);
    const token = created.accessToken;
    const game = `/games/hollow-knight`;

    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/v1/screenshots',
      headers: headers(token, game),
      payload: PNG,
    });
    expect(upload.statusCode).toBe(201);
    const id = upload.json<{ screenshot: { id: string } }>().screenshot.id;

    const list = await built.app.inject({
      method: 'GET',
      url: `/api/v1/screenshots?game=${encodeURIComponent(game)}`,
      headers: authHeader(token),
    });
    expect(list.json<{ total: number }>().total).toBe(1);

    const download = await built.app.inject({
      method: 'GET',
      url: `/api/v1/screenshots/${id}`,
      headers: authHeader(token),
    });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(PNG)).toBe(true);

    const removed = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/screenshots/${id}`,
      headers: authHeader(token),
    });
    expect(removed.statusCode).toBe(204);
  });

  it('a captura de outro utilizador devolve 404', async () => {
    const built = await buildTestApp();
    const dono = await registerUser(built.app, `shot-${Date.now()}-dono@nexora.local`);
    const estranho = await registerUser(built.app, `shot-${Date.now()}-estranho@nexora.local`);
    const upload = await built.app.inject({
      method: 'POST',
      url: '/api/v1/screenshots',
      headers: headers(dono.accessToken, '/games/x'),
      payload: PNG,
    });
    const id = upload.json<{ screenshot: { id: string } }>().screenshot.id;

    const tentativa = await built.app.inject({
      method: 'GET',
      url: `/api/v1/screenshots/${id}`,
      headers: authHeader(estranho.accessToken),
    });
    expect(tentativa.statusCode).toBe(404);
  });

  it('um nome que não é imagem é recusado', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `shot-${Date.now()}@nexora.local`);
    const recusado = await built.app.inject({
      method: 'POST',
      url: '/api/v1/screenshots',
      headers: { ...authHeader(created.accessToken), 'content-type': 'image/png', 'x-game-key': '/games/x', 'x-file-name': 'jogo.zip' },
      payload: PNG,
    });
    expect(recusado.statusCode).toBe(400);
  });

  it('sem sessão não sobe', async () => {
    const built = await buildTestApp();
    const resposta = await built.app.inject({
      method: 'POST',
      url: '/api/v1/screenshots',
      headers: { 'content-type': 'image/png', 'x-game-key': '/games/x', 'x-file-name': 'jogo-1.png' },
      payload: PNG,
    });
    expect(resposta.statusCode).toBe(401);
  });
});
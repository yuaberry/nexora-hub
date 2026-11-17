import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Biblioteca — metadados dos jogos, favoritos e colecções.
 *
 * Duas regras verificadas aqui:
 *
 * - **recurso de outro utilizador devolve `404`**, nunca `403` — o filtro é
 *   sempre pelo dono, e uma linha alheia é indistinguível de uma inexistente;
 * - sincronizar a mesma entrada duas vezes **não** duplica a linha.
 */

const ENTRY = {
  externalKey: 'minecraft',
  title: 'Minecraft',
  installPath: '/jogos/minecraft',
  executablePath: '/jogos/minecraft/minecraft',
  tags: ['sandbox'],
  adult: false,
};

describe('sincronização de entradas', () => {
  it('cria uma entrada e devolve-a no contrato', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'bib1@nexora.local');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: ENTRY,
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { entry: { id: string; title: string; totalSeconds: number; favorite: boolean } };
    expect(body.entry.title).toBe('Minecraft');
    expect(body.entry.totalSeconds).toBe(0);
    expect(body.entry.favorite).toBe(false);

    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: ENTRY,
    });
    expect(again.statusCode).toBe(201);
    expect((again.json() as { entry: { id: string } }).entry.id).toBe(body.entry.id);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/library',
      headers: authHeader(user.accessToken),
    });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);
    await app.close();
  });

  it('recusa caminho com travessia', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'bib2@nexora.local');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: { ...ENTRY, installPath: '/jogos/../../etc' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('favoritos e colecções', () => {
  it('marca um favorito e regista a escrita na auditoria', async () => {
    const { app, repositories } = await buildTestApp();
    const user = await registerUser(app, 'bib3@nexora.local');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: ENTRY,
    });
    const entryId = (created.json() as { entry: { id: string } }).entry.id;

    const favorite = await app.inject({
      method: 'PUT',
      url: `/api/v1/library/${entryId}/favorite`,
      headers: authHeader(user.accessToken),
      payload: { favorite: true },
    });
    expect(favorite.statusCode).toBe(200);
    expect((favorite.json() as { entry: { favorite: boolean } }).entry.favorite).toBe(true);

    const audit = await repositories.audit.list({ limit: 50, offset: 0 });
    const entries = audit.items.filter((entry) => entry.action === 'library.favorite.update');
    expect(entries).toHaveLength(1);

    // As leituras **não** são auditadas (D22): consultar a biblioteca não
    // acrescenta nada à trilha.
    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/library',
      headers: authHeader(user.accessToken),
    });
    expect(read.statusCode).toBe(200);
    const afterRead = await repositories.audit.list({ limit: 50, offset: 0 });
    expect(afterRead.items).toHaveLength(audit.items.length);
    await app.close();
  });

  it('acrescenta uma colecção', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'bib4@nexora.local');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(user.accessToken),
      payload: ENTRY,
    });
    const entryId = (created.json() as { entry: { id: string } }).entry.id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/library/${entryId}/collections`,
      headers: authHeader(user.accessToken),
      payload: { name: 'Favoritos da família' },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { entry: { collections: string[] } }).entry.collections).toContain(
      'Favoritos da família',
    );
    await app.close();
  });
});

describe('isolamento entre utilizadores', () => {
  it('a entrada de outro utilizador dá 404, nunca 403', async () => {
    const { app } = await buildTestApp();
    const owner = await registerUser(app, 'dono@nexora.local');
    const stranger = await registerUser(app, 'estranho@nexora.local');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/library/entries',
      headers: authHeader(owner.accessToken),
      payload: ENTRY,
    });
    const entryId = (created.json() as { entry: { id: string } }).entry.id;

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/library/${entryId}`,
      headers: authHeader(stranger.accessToken),
    });
    expect(read.statusCode).toBe(404);
    await app.close();
  });
});
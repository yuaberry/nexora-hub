import { describe, expect, it, beforeAll } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser, TEST_PASSWORD } from './fixtures.js';

/**
 * Fontes — instalação (admin), catálogo unificado e pesquisa.
 *
 * O que estes testes travam: **só admin instala** fontes, um manifesto sem
 * attestation legal é recusado com os motivos, e a pesquisa é a mesma da
 * biblioteca (alias e consoantes) — servida por HTTP.
 */

/** Manifesto mínimo válido para os testes. */
function manifest(id: string, title: string, aliases: readonly string[] = []): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name: `Fonte ${id}`,
    description: 'Fonte de teste.',
    legal: {
      basis: 'Conteúdo de teste do operador.',
      attestedBy: 'Yua Devs',
      attestedAt: '2026-11-18T00:00:00.000Z',
    },
    games: [
      {
        id: 'jogo-1',
        title,
        aliases,
        files: [{ url: 'http://127.0.0.1:8080/f.bin', path: 'f.bin', transport: 'http' }],
        executables: ['f.bin'],
      },
    ],
  };
}

/** Invalida a attestation removendo a base legal. */
function withoutLegal(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...raw } as Record<string, unknown>;
  delete copy['legal'];
  return copy;
}

describe('fontes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    const admin = await registerUser(app, 'admin-src@nexora.local');
    // O primeiro utilizador nunca é admin: a elevação é explícita (regra do
    // Nexora Cloud) — e é o que estes testes usam para instalar fontes.
    await built.repositories.users.setRole(admin.userId, 'admin');
    // O papel viaja no token: depois de elevado, o utilizador entra de novo.
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password: TEST_PASSWORD },
    });
    adminToken = (adminLogin.json() as { tokens: { accessToken: string } }).tokens.accessToken;
    const user = await registerUser(app, 'user-src@nexora.local');
    userToken = user.accessToken;
  });

  it('recusa instalação sem sessão', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/sources', payload: manifest('op/uma', 'X') });
    expect(response.statusCode).toBe(401);
  });

  it('recusa instalação por um utilizador sem papel de admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sources',
      headers: authHeader(userToken),
      payload: manifest('op/uma', 'X'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('instala um manifesto com attestation (admin)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sources',
      headers: { ...authHeader(adminToken), 'x-source-origin': 'teste' },
      payload: manifest('op/uma', 'League Of Legends', ['lol']),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; legal: { attestedBy: string } };
    expect(body.id).toBe('op/uma');
    expect(body.legal.attestedBy).toBe('Yua Devs');
  });

  it('recusa um manifesto sem base legal e não instala', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sources',
      headers: authHeader(adminToken),
      payload: withoutLegal(manifest('op/sem-legal', 'X')),
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { message: string; details: { message: string }[] } };
    expect(body.error.message).toContain('recusado');
    const list = await app.inject({ method: 'GET', url: '/api/v1/sources', headers: { authorization: `Bearer ${userToken}` } });
    const sources = (list.json() as { items: { id: string }[] }).items;
    expect(sources.some((source) => source.id === 'op/sem-legal')).toBe(false);
  });

  it('recusa uma fonte com id repetido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sources',
      headers: authHeader(adminToken),
      payload: manifest('op/uma', 'Outro'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('pesquisa o catálogo unificado por alias e consoantes', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/sources',
      headers: authHeader(adminToken),
      payload: manifest('op/duas', 'Minecraft Java', ['mc']),
    });
    const byAlias = await app.inject({
      method: 'GET',
      url: '/api/v1/sources/search?q=lol',
      headers: authHeader(userToken),
    });
    expect((byAlias.json() as { items: { title: string }[] }).items[0]?.title).toBe('League Of Legends');

    const byConsonants = await app.inject({
      method: 'GET',
      url: '/api/v1/sources/search?q=mncft',
      headers: authHeader(userToken),
    });
    expect((byConsonants.json() as { items: { title: string }[] }).items[0]?.title).toBe('Minecraft Java');
  });

  it('lista as fontes com a attestation', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/sources', headers: { authorization: `Bearer ${userToken}` } });
    const body = response.json() as { items: { id: string; legal: { basis: string } }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items.every((item) => item.legal.basis.length > 0)).toBe(true);
  });
});
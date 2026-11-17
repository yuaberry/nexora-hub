import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { loginUser, registerUser, TEST_PASSWORD } from './fixtures.js';

/**
 * Autenticação — registo, login e `/me`.
 *
 * O login **não é um oráculo** sobre que e-mails existem: um e-mail
 * desconhecido e uma senha errada dão a mesma resposta, com a mesma mensagem.
 */
describe('registo', () => {
  it('cria uma conta e devolve tokens', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ana@nexora.local', password: TEST_PASSWORD, displayName: 'Ana' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      user: { id: string; email: string; planId: string; mfaEnabled: boolean };
      tokens: { accessToken: string; refreshToken: string; tokenType: string };
    };
    expect(body.user.email).toBe('ana@nexora.local');
    expect(body.user.planId).toBe('free');
    expect(body.user.mfaEnabled).toBe(false);
    expect(body.tokens.tokenType).toBe('Bearer');
    await app.close();
  });

  it('recusa um e-mail repetido com 409', async () => {
    const { app } = await buildTestApp();
    await registerUser(app, 'repetido@nexora.local');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'repetido@nexora.local', password: TEST_PASSWORD, displayName: 'Outro' },
    });
    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });

  it('recusa senha curta com 400 e o caminho do campo', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'curta@nexora.local', password: '123', displayName: 'Curta' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { details: Array<{ path: string }> } };
    expect(body.error.details[0]?.path).toContain('password');
    await app.close();
  });
});

describe('login', () => {
  it('entra com as credenciais certas', async () => {
    const { app } = await buildTestApp();
    await registerUser(app, 'login@nexora.local');
    const result = await loginUser(app, 'login@nexora.local');
    expect('accessToken' in result).toBe(true);
    await app.close();
  });

  it('senha errada dá 401 — mesmo para e-mail inexistente', async () => {
    const { app } = await buildTestApp();
    await registerUser(app, 'existe@nexora.local');

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'existe@nexora.local', password: 'senha-errada-999' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'naoexiste@nexora.local', password: 'senha-errada-999' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    // A mensagem é a mesma; só o `requestId` difere (é o que permite relatar
    // o problema sem expor o estado da conta).
    const toMessage = (body: unknown) => {
      const record = body as { error: { code: string; message: string } };
      return { code: record.error.code, message: record.error.message };
    };
    expect(toMessage(wrongPassword.json())).toEqual(toMessage(unknownEmail.json()));
    await app.close();
  });
});

describe('/me', () => {
  it('devolve o utilizador autenticado', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'me@nexora.local');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { user: { email: string; id: string } };
    expect(body.user.email).toBe('me@nexora.local');
    await app.close();
  });

  it('sem token dá 401', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('token inválido dá 401 com o envelope do contrato', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeader('token.invalido.aqui'),
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
    await app.close();
  });
});
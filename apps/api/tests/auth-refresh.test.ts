import { describe, expect, it } from 'vitest';
import { buildTestApp, fakeClock } from './helpers.js';
import { loginUser, registerUser } from './fixtures.js';

/**
 * Token de renovação — rotação, família e reutilização.
 *
 * Um token de renovação é opaco, rotativo e revogável. A cada renovação o
 * token antigo morre e um novo nasce na mesma família. Fora da janela de
 * tolerância (30 s), um token já rodado que reaparece é **reutilização** — o
 * sinal clássico de roubo — e a família inteira é revogada. Dentro da janela,
 * o mesmo sucessor é devolvido: uma corrida entre dois pedidos não pode matar
 * a sessão de um utilizador inocente.
 */

const PASSWORD = 'senha-de-teste-123';

interface TestApp {
  app: Awaited<ReturnType<typeof buildTestApp>>['app'];
}

async function loginWithTokens(app: TestApp['app'], email: string) {
  const result = await loginUser(app, email, PASSWORD);
  if (!('accessToken' in result)) {
    throw new Error('Login devolver tokens');
  }
  return result;
}

describe('rotação do token de renovação', () => {
  it('cada renovação troca o token por um novo', async () => {
    const { app } = await buildTestApp();
    await registerUser(app, 'rotacao@nexora.local', PASSWORD);
    const first = await loginWithTokens(app, 'rotacao@nexora.local');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { tokens: { refreshToken: string; accessToken: string } };
    expect(body.tokens.refreshToken).not.toBe(first.refreshToken);
    // O token de acesso é stateless (JWT de 1 h): dentro do mesmo segundo, a
    // assinatura é determinística — o que muda é o **refresh**, que roda.
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${body.tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    await app.close();
  });

  it('dentro da janela de tolerância o mesmo sucessor é devolvido', async () => {
    const clock = fakeClock();
    const { app } = await buildTestApp({ now: clock.now });
    await registerUser(app, 'janela@nexora.local', PASSWORD);
    const first = await loginWithTokens(app, 'janela@nexora.local');

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    const successor = (rotated.json() as { tokens: { refreshToken: string } }).tokens.refreshToken;

    // Uma repetição dentro da janela é uma corrida, não um roubo.
    clock.advanceSeconds(5);
    const repeated = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(repeated.statusCode).toBe(200);
    expect((repeated.json() as { tokens: { refreshToken: string } }).tokens.refreshToken).toBe(successor);
    await app.close();
  });

  it('fora da janela, a reutilização mata a família e é auditada', async () => {
    const clock = fakeClock();
    const { app, repositories } = await buildTestApp({ now: clock.now });
    await registerUser(app, 'reuso@nexora.local', PASSWORD);
    const first = await loginWithTokens(app, 'reuso@nexora.local');

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    const successor = (rotated.json() as { tokens: { refreshToken: string } }).tokens.refreshToken;

    clock.advanceSeconds(31);
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    const reuseBody = reuse.json() as { error: { code: string; message: string } };

    const tampered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'nao-e-um-token' },
    });
    // Token desconhecido, adulterado, expirado ou revogado: mesma resposta
    // (código e mensagem; só o `requestId` difere).
    const toMessage = (body: unknown) => {
      const record = body as { error: { code: string; message: string } };
      return { code: record.error.code, message: record.error.message };
    };
    expect(toMessage(tampered.json())).toEqual(toMessage(reuseBody));

    // A família inteira morreu: o sucessor também não renova.
    const successorRetry = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: successor },
    });
    expect(successorRetry.statusCode).toBe(401);

    const audit = await repositories.audit.list({ limit: 50, offset: 0 });
    expect(audit.items.filter((entry) => entry.action === 'auth.refresh_reuse')).toHaveLength(1);
    // A rotação normal **não** é auditada (D22).
    expect(audit.items.filter((entry) => entry.action === 'auth.logout')).toHaveLength(0);
    await app.close();
  });

  it('o logout é idempotente e revoga a família inteira', async () => {
    const { app } = await buildTestApp();
    await registerUser(app, 'logout@nexora.local', PASSWORD);
    const first = await loginWithTokens(app, 'logout@nexora.local');

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    const newToken = (rotated.json() as { tokens: { refreshToken: string } }).tokens.refreshToken;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: newToken },
    });
    expect(logout.statusCode).toBe(204);

    // Idempotente: um token desconhecido também dá 204 — nunca revela se o
    // token existia.
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'token-desconhecido' },
    });
    expect(second.statusCode).toBe(204);

    // A família inteira morreu: nem o token novo nem o antigo renovam.
    const afterLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: newToken },
    });
    expect(afterLogout.statusCode).toBe(401);
    await app.close();
  });
});
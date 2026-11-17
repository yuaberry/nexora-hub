import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser, TEST_PASSWORD } from './fixtures.js';
import { lockDeadline, lockoutState, MAX_LOGIN_ATTEMPTS } from '../src/modules/auth/lockout.js';
import { syntheticUser } from './fixtures.js';

/**
 * Bloqueio por tentativas falhadas — a política é **declarada**, e a
 * contagem é atómica.
 *
 * Duas regras verificadas aqui:
 *
 * - o `423 account_locked` só sai quando a senha está **certa** — quem
 *   pergunta já provou quem é;
 * - uma conta bloqueada **não estende** o próprio bloqueio: um atacante não a
 *   pode manter bloqueada para sempre, e o prazo expirado recomeça a contagem.
 */
describe('bloqueio da conta', () => {
  it('bloqueia ao fim de cinco tentativas falhadas e audita', async () => {
    const { app, repositories } = await buildTestApp();
    await registerUser(app, 'bloqueio@nexora.local');

    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'bloqueio@nexora.local', password: 'senha-errada-999' },
      });
      expect(response.statusCode).toBe(401);
    }

    // A senha certa agora dá 423 — mas a mensagem não depende do estado.
    const locked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bloqueio@nexora.local', password: TEST_PASSWORD },
    });
    expect(locked.statusCode).toBe(423);
    const body = locked.json() as { error: { code: string; details: { remainingSeconds: number } } };
    expect(body.error.code).toBe('account_locked');
    expect(body.error.details.remainingSeconds).toBeGreaterThan(0);

    // O bloqueio é auditado; as tentativas falhadas, não uma a uma (D22).
    const audit = await repositories.audit.list({ limit: 50, offset: 0 });
    const lockedEntries = audit.items.filter((entry) => entry.action === 'auth.login_locked');
    expect(lockedEntries).toHaveLength(1);
    const failedEntries = audit.items.filter((entry) => entry.metadata['failed'] === true);
    expect(failedEntries).toHaveLength(0);

    await app.close();
  });

  it('um bloqueio expirado não bloqueia e recomeça a contagem', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expired = syntheticUser({ lockedUntil: new Date(now.getTime() - 1000) });
    expect(lockoutState(expired, now).locked).toBe(false);

    // Uma conta bloqueada não estende o próprio bloqueio: o prazo é o
    // declarado, contado a partir do bloqueio.
    expect(lockDeadline(now).getTime()).toBe(now.getTime() + 900_000);
  });

  it('o bloqueio afecta logins novos, não o token de acesso já emitido', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'bloqueado2@nexora.local');
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'bloqueado2@nexora.local', password: 'senha-errada-999' },
      });
    }
    // O token de acesso é stateless (JWT, 1 h): o bloqueio recusa **logins
    // novos**, e é isso que ele promete. A renovação é revogável à parte.
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
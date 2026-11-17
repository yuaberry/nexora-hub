import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Painel administrativo — a guarda é do **servidor**.
 *
 * Esconder a entrada na navegação é conveniência, não segurança: a rota
 * exige o papel `admin` e devolve `403` sem ele. As leituras **não** são
 * auditadas (D22) — o que o administrador consultou continua rastreável pelo
 * `requestId` de cada resposta.
 */
describe('rotas administrativas', () => {
  it('sem o papel de administrador dá 403', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'comum@nexora.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: authHeader(user.accessToken),
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('forbidden');
    await app.close();
  });

  it('sem autenticação dá 401', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/overview' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('o primeiro utilizador nunca é admin', async () => {
    const { app, repositories } = await buildTestApp();
    const user = await registerUser(app, 'primeiro@nexora.local');
    const record = await repositories.users.findById(user.userId);
    expect(record?.role).toBe('user');
    await app.close();
  });
});
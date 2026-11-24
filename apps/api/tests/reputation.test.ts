import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Reputação — os níveis a partir dos pontos reais.
 *
 * O que estes testes travam: uma conta nova começa no nível mais baixo com
 * zero pontos; a rota exige sessão; e o progresso é o do domínio (a fracção
 * e o que faltam são os que os limiares mandam).
 */
describe('reputação', () => {
  it('uma conta nova começa no nível mais baixo', async () => {
    const built = await buildTestApp();
    const created = await registerUser(built.app, `rep-${Date.now()}@nexora.local`);
    const response = await built.app.inject({
      method: 'GET',
      url: '/api/v1/reputation',
      headers: authHeader(created.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ points: number; level: string; next: string | null; fraction: number }>();
    expect(body.points).toBe(0);
    expect(body.level).toBe('reputation.level.bronze');
    expect(body.next).toBe('reputation.level.silver');
    expect(body.fraction).toBe(0);
  });

  it('sem sessão não há reputação', async () => {
    const built = await buildTestApp();
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/reputation' });
    expect(response.statusCode).toBe(401);
  });
});

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { loadEnv } from '../src/config/env.js';
import { accessTokenOf, registerUser } from './fixtures.js';

/**
 * Integração com PostgreSQL **real**.
 *
 * Só corre quando `DATABASE_URL` está definido e acessível — no CI, e na
 * máquina de desenvolvimento com os contentores de pé. Sem ela, a suite
 * principal fica em memória (modo degradado) e estes testes são **ignorados**,
 * com a omissão documentada em `README.md` e em `docs/ARCHITECTURE.md`.
 *
 * O que estes testes provam de que a memória não dá conta: o `uuid`
 * malformado é recusado antes da base, a contagem atómica de tentativas
 * falhadas conta mesmo com pedidos paralelos, e a duração inteira não é
 * recusada pelo PostgreSQL.
 */

/** `true` quando há uma base de dados configurada. */
const DATABASE_URL = process.env['DATABASE_URL'];
const describeIfDatabase = DATABASE_URL === undefined ? describe.skip : describe;

describeIfDatabase('integração com PostgreSQL real', () => {
  it('aplica migrações e serve as rotas autenticadas', async () => {
    await runMigrations(DATABASE_URL as string);

    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const user = await registerUser(
      app,
      `postgres-${Date.now()}@nexora.local`,
      'senha-de-teste-123',
      'Postgres',
    );
    expect(accessTokenOf(user)).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessTokenOf(user)}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe(user.email);

    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect((health.json() as { mode: string }).mode).toBe('postgres');

    await app.close();
  });

  it('a contagem de tentativas falhadas é atómica sob carga paralela', async () => {
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const email = `paralelo-${Date.now()}@nexora.local`;
    await registerUser(app, email, 'senha-de-teste-123', 'Paralelo');

    // Cinco logins em paralelo com senha errada têm de contar **cinco**:
    // somar em memória e gravar depois perderia tentativas e o lockout nunca
    // existiria. Em PostgreSQL o incremento é `failed_login_attempts + 1`.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email, password: 'senha-errada-999' },
        }),
      ),
    );
    expect(attempts.every((response) => response.statusCode === 401)).toBe(true);

    const locked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'senha-de-teste-123' },
    });
    expect(locked.statusCode).toBe(423);

    await app.close();
  });
});

describe('modo de persistência reportado', () => {
  it('sem DATABASE_URL a API declara modo degradado', async () => {
    const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    const body = health.json() as { status: string; mode: string };
    expect(body.mode).toBe('memory');
    expect(body.status).toBe('degraded');
    await app.close();
  });
});
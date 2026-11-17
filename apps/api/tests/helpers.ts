import { buildApp } from '../src/app.js';
import { createMemoryRepositories } from '../src/repositories/index.js';
import type { Env } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Repositories } from '../src/repositories/types.js';

/**
 * Apoio comum aos testes.
 *
 * Os testes de integração correm contra os **repositórios em memória** — as
 * mesmas regras de negócio que correm contra PostgreSQL. Os testes que exigem
 * a base de dados real vivem em `postgres-integration.test.ts` e só correm
 * quando `DATABASE_URL` está definido (ver README e `docs/ARCHITECTURE.md`).
 */

/** Segredo de teste (nunca um segredo real). */
export const TEST_SECRET = 'test-secret-nexora-hub';

/** Constrói a aplicação com repositórios em memória. */
export async function buildTestApp(options: { repositories?: Repositories; now?: () => Date } = {}) {
  const repositories = options.repositories ?? createMemoryRepositories();
  // `loadEnv` aplica a regra "vazio ≡ ausente" — o ambiente de teste é
  // montado pela mesma porta que o de produção.
  const env: Env = loadEnv({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET } as NodeJS.ProcessEnv);
  const app = await buildApp({
    repositories,
    secret: TEST_SECRET,
    env,
    logger: false,
    now: options.now,
  });
  return { app, repositories };
}

/**
 * Relógio controlável — o tempo é injectável.
 *
 * Sem temporizadores reais, a janela de tolerância da rotação é testada com o
 * relógio avançado à mão: um teste que espera 30 s pelo tempo real seria lento
 * e instável.
 */
export function fakeClock(startAt = new Date('2026-01-01T00:00:00.000Z')) {
  let current = new Date(startAt.getTime());
  return {
    now: () => new Date(current.getTime()),
    advanceSeconds: (seconds: number) => {
      current = new Date(current.getTime() + seconds * 1000);
    },
    set: (date: Date) => {
      current = new Date(date.getTime());
    },
  };
}

/** Cabeçalho de autorização com o token de acesso. */
export function authHeader(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}
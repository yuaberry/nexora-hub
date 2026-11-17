import type { FastifyInstance } from 'fastify';
import type { UserRecord } from '../src/repositories/types.js';

/**
 * Fixtures — criação de utilizadores e leitura de tokens.
 *
 * Separa das *helpers* para que os testes de integração com PostgreSQL possam
 * reutilizar as mesmas funções sem depender do modo degradado.
 */

/** Credenciais de teste (a senha cumpre a política declarada). */
export const TEST_PASSWORD = 'senha-de-teste-123';

/** Regista um utilizador pela API e devolve os tokens. */
export async function registerUser(
  app: FastifyInstance,
  email: string,
  password: string = TEST_PASSWORD,
  displayName = 'Utilizador de Teste',
): Promise<{ userId: string; accessToken: string; refreshToken: string; email: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, displayName },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Registo falhou (${response.statusCode}): ${response.body}`);
  }

  const body = response.json() as {
    user: { id: string };
    tokens: { accessToken: string; refreshToken: string };
  };
  return {
    userId: body.user.id,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    email,
  };
}

/** Faz login e devolve os tokens. */
export async function loginUser(
  app: FastifyInstance,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string } | { challengeToken: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  const body = response.json() as {
    kind: string;
    tokens?: { accessToken: string; refreshToken: string };
    challenge?: { challengeToken: string };
  };
  if (body.kind === 'authenticated' && body.tokens !== undefined) {
    return { accessToken: body.tokens.accessToken, refreshToken: body.tokens.refreshToken };
  }
  if (body.challenge?.challengeToken !== undefined) {
    return { challengeToken: body.challenge.challengeToken };
  }
  throw new Error(`Login falhou (${response.statusCode}): ${response.body}`);
}

/** Token de acesso de um registo. */
export function accessTokenOf(user: { accessToken: string }): string {
  return user.accessToken;
}

/** Utilizador sintético (para testes de lockout sem HTTP). */
export function syntheticUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'sintetico@nexora.local',
    displayName: 'Sintético',
    passwordHash: 'ab'.repeat(32),
    passwordSalt: 'cd'.repeat(8),
    role: 'user',
    planId: 'free',
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}
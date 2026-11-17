import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PORT,
  ACCESS_TOKEN_TTL_SECONDS,
  isTestEnv,
  loadEnv,
  requireAuthSecret,
} from '../src/config/env.js';

/**
 * Variáveis de ambiente — **vazio equivale a ausente**.
 *
 * Um `.env` por preencher, um `docker run -e VAR=` ou um serviço de CI que
 * exporte a variável vazia não podem impedir o arranque. É um defeito que só
 * aparece com uma variável vazia — por isso tem teste de regressão.
 */
describe('ambiente', () => {
  it('uma variável vazia equivale a ausente', () => {
    const env = loadEnv({
      DATABASE_URL: '',
      HOST: '',
      PORT: '',
      CORS_ORIGIN: '',
      AUTH_SECRET: '',
      REDIS_URL: '',
      NODE_ENV: '',
    } as NodeJS.ProcessEnv);

    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.HOST).toBeUndefined();
    expect(env.PORT).toBeUndefined();
    expect(env.CORS_ORIGIN).toBeUndefined();
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
  });

  it('um valor preenchido é lido', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://nexora:x@127.0.0.1:54340/nexora_hub',
      PORT: '3101',
      AUTH_SECRET: 'segredo-de-teste',
    } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe('postgresql://nexora:x@127.0.0.1:54340/nexora_hub');
    expect(env.PORT).toBe(3101);
    expect(isTestEnv({ ...env, NODE_ENV: 'test' })).toBe(true);
  });

  it('um valor não numérico em PORT é tratado como ausente', () => {
    const env = loadEnv({ PORT: 'nao-e-numero' } as NodeJS.ProcessEnv);
    expect(env.PORT).toBeUndefined();
  });

  it('fora de teste, AUTH_SECRET ausente é um erro explícito', () => {
    expect(() => requireAuthSecret(loadEnv({} as NodeJS.ProcessEnv))).toThrow('AUTH_SECRET ausente');
  });

  it('em teste, há um segredo de desenvolvimento — nunca em produção', () => {
    const secret = requireAuthSecret(loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv));
    expect(secret).toBeTruthy();
    expect(secret).not.toBe('');
  });

  it('as constantes declaradas são as do contrato', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
    expect(DEFAULT_PORT).toBe(3100);
  });
});
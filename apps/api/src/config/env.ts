import { z } from 'zod';

/**
 * Configuração da API por variáveis de ambiente.
 *
 * **Uma variável vazia equivale a ausente** — um `.env` por preencher ou um
 * `docker run -e VAR=` não podem impedir o arranque. É por isso que o
 * `.optional()` e o `.default()` vivem **dentro** do `preprocess`: postos por
 * fora, o Zod decide a opcionalidade antes da conversão e a variável vazia dá
 * `ZodError` em vez do comportamento documentado.
 *
 * `AUTH_SECRET` continua obrigatório fora de teste: a ausência é um erro
 * explícito («AUTH_SECRET ausente»), não um `ZodError`.
 */

/** Lê uma string de ambiente tratando vazio como ausente. */
function envString(): z.ZodType<string | undefined> {
  return z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }, z.string().optional());
}

/** Lê um inteiro de ambiente tratando vazio como ausente. */
function envInt(): z.ZodType<number | undefined> {
  return z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }, z.number().int().optional());
}

const envSchema = z.object({
  DATABASE_URL: envString(),
  REDIS_URL: envString(),
  HOST: envString(),
  PORT: envInt(),
  CORS_ORIGIN: envString(),
  AUTH_SECRET: envString(),
  NODE_ENV: envString(),
});

/** Ambiente já validado (vazio ≡ ausente). */
export type Env = z.infer<typeof envSchema>;

/** Valida o ambiente e devolve os valores normalizados. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse({
    DATABASE_URL: source['DATABASE_URL'],
    REDIS_URL: source['REDIS_URL'],
    HOST: source['HOST'],
    PORT: source['PORT'],
    CORS_ORIGIN: source['CORS_ORIGIN'],
    AUTH_SECRET: source['AUTH_SECRET'],
    NODE_ENV: source['NODE_ENV'],
  });
}

/** `true` quando o processo está em modo de teste. */
export function isTestEnv(env: Env): boolean {
  return env.NODE_ENV === 'test';
}

/**
 * Segredo da plataforma.
 *
 * Fora de teste, a ausência é um **erro explícito** — nunca um segredo por
 * omissão: um valor padrão silencioso seria uma aplicação a assinar tokens
 * com uma chave que está no repositório.
 */
export function requireAuthSecret(env: Env, testSecret = 'test-secret-nexora-hub'): string {
  if (env.AUTH_SECRET !== undefined) {
    return env.AUTH_SECRET;
  }
  if (isTestEnv(env)) {
    return testSecret;
  }
  throw new Error('AUTH_SECRET ausente.');
}

/** Porta do servidor HTTP (omissão 3100). */
export const DEFAULT_PORT = 3100;

/** Host do servidor HTTP (omissão 127.0.0.1). */
export const DEFAULT_HOST = '127.0.0.1';

/** Validade do token de acesso, em segundos (1 h). */
export const ACCESS_TOKEN_TTL_SECONDS = 3600;

/** Janela de tolerância da rotação do token de renovação, em segundos. */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

/** Validade do token de renovação, em segundos (30 dias). */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
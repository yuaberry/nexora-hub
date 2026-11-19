import { createDatabase } from '../db/client.js';
import type { Env } from '../config/env.js';
import {
  MemoryAuditRepository,
  MemoryUserRepository,
} from './memory-users.js';
import { MemoryAuthSessionRepository, MemoryMfaRepository } from './memory-auth.js';
import { MemoryCommentRepository, MemoryReviewRepository } from './memory-community.js';
import { MemoryLibraryRepository, MemoryPlaySessionRepository } from './memory-game.js';
import { PostgresAuditRepository, PostgresUserRepository } from './postgres-users.js';
import { PostgresAuthSessionRepository, PostgresMfaRepository } from './postgres-auth.js';
import { PostgresCommentRepository, PostgresReviewRepository } from './postgres-community.js';
import { PostgresLibraryRepository, PostgresPlaySessionRepository } from './postgres-game.js';
import type { Repositories } from './types.js';

/**
 * Fábrica de repositórios.
 *
 * A escolha é **declarada**, não escondida: com `DATABASE_URL` a API usa
 * PostgreSQL; sem ela (ou com a base inacessível) arranca em **modo
 * degradado**, em memória, e diz-o em `/health` (`mode: 'memory'`,
 * `status: 'degraded'`). Nunca um fallback silencioso — o operador tem de
 * saber onde estão os dados.
 */

/** Cria os repositórios em memória (testes e modo degradado). */
export function createMemoryRepositories(): Repositories {
  return {
    users: new MemoryUserRepository(),
    authSessions: new MemoryAuthSessionRepository(),
    mfa: new MemoryMfaRepository(),
    comments: new MemoryCommentRepository(),
    reviews: new MemoryReviewRepository(),
    library: new MemoryLibraryRepository(),
    sessions: new MemoryPlaySessionRepository(),
    audit: new MemoryAuditRepository(),
    mode: 'memory',
    close: async () => {
      /* nada a fechar */
    },
  };
}

/**
 * Cria os repositórios efectivos.
 *
 * `env.DATABASE_URL` vazio equivale a ausente — um `.env` por preencher não
 * pode impedir o arranque.
 */
export function createRepositories(env: Env): { repositories: Repositories; close: () => Promise<void> } {
  if (env.DATABASE_URL === undefined) {
    return { repositories: createMemoryRepositories(), close: async () => {} };
  }

  const database = createDatabase(env.DATABASE_URL);
  const repositories: Repositories = {
    users: new PostgresUserRepository(database.db),
    authSessions: new PostgresAuthSessionRepository(database.db),
    mfa: new PostgresMfaRepository(database.db),
    comments: new PostgresCommentRepository(database.db),
    reviews: new PostgresReviewRepository(database.db),
    library: new PostgresLibraryRepository(database.db),
    sessions: new PostgresPlaySessionRepository(database.db),
    audit: new PostgresAuditRepository(database.db),
    mode: 'postgres',
    close: async () => {
      await database.close();
    },
  };

  return { repositories, close: database.close };
}
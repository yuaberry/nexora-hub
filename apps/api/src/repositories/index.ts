import { createDatabase } from '../db/client.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.js';
import {
  MemoryAuditRepository,
  MemoryUserRepository,
} from './memory-users.js';
import { MemoryAuthSessionRepository, MemoryMfaRepository } from './memory-auth.js';
import { MemoryWishlistRepository } from './memory-wishlist.js';
import { PostgresWishlistRepository } from './postgres-wishlist.js';
import { MemoryFamilyRepository } from './memory-family.js';
import { MemoryFriendsRepository, MemoryPresenceRepository } from './memory-friends.js';
import { PostgresFamilyRepository } from './postgres-family.js';
import { PostgresFriendsRepository, PostgresPresenceRepository } from './postgres-friends.js';
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
    wishlist: new MemoryWishlistRepository(),
    family: new MemoryFamilyRepository(),
    friends: new MemoryFriendsRepository(),
    presence: new MemoryPresenceRepository(),
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
    wishlist: new PostgresWishlistRepository(database.db as unknown as NodePgDatabase<Record<string, unknown>>),
    family: new PostgresFamilyRepository(database.db as unknown as NodePgDatabase<Record<string, unknown>>),
    friends: new PostgresFriendsRepository(database.db as unknown as NodePgDatabase<Record<string, unknown>>),
    presence: new PostgresPresenceRepository(database.db as unknown as NodePgDatabase<Record<string, unknown>>),
    mode: 'postgres',
    close: async () => {
      await database.close();
    },
  };

  return { repositories, close: database.close };
}
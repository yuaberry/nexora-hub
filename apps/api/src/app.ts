import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  loadEnv,
  requireAuthSecret,
  savesDirectory,
  type Env,
} from './config/env.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { registerAuth } from './plugins/auth.js';
import { registerRateLimit } from './plugins/rateLimit.js';
import { createMemoryRepositories, createRepositories } from './repositories/index.js';
import type { Repositories } from './repositories/types.js';
import { createAuthService } from './modules/auth/service.js';
import { createMfaService } from './modules/auth/mfa-service.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerLibraryRoutes } from './modules/library/routes.js';
import { registerGameRoutes } from './modules/games/routes.js';
import { registerSourceRoutes } from './modules/sources/routes.js';
import { registerCommunityRoutes } from './modules/community/routes.js';
import { registerStoreRoutes } from './modules/store/routes.js';
import { registerStatsRoutes } from './modules/stats/routes.js';
import { registerFamilyRoutes } from './modules/family/routes.js';
import { registerFamilyInviteRoutes } from './modules/family/invites.js';
import { registerFriendsRoutes } from './modules/friends/routes.js';
import { registerChatRoutes } from './modules/chat/routes.js';
import { registerAchievementRoutes } from './modules/achievements/routes.js';
import { registerRecommendRoutes } from './modules/recommend/routes.js';
import { registerSessionRoutes } from './modules/sessions/routes.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { SaveStore } from './modules/saves/save-store.js';
import { registerSaveRoutes } from './modules/saves/routes.js';
import { registerGatewayRoutes } from './gateway/socket.js';

/**
 * Composição da aplicação.
 *
 * A API depende dos **repositórios** (interfaces), nunca do driver: sem
 * `DATABASE_URL` arranca em modo degradado, em memória, e diz-o em
 * `/health`. Os testes constroem a aplicação com os repositórios que
 * quiserem — memória, ou PostgreSQL real quando existe.
 */

/** Opções de construção (usadas pelos testes). */
export interface BuildAppOptions {
  readonly env?: Env;
  readonly repositories?: Repositories;
  readonly secret?: string;
  readonly now?: () => Date;
  readonly logger?: boolean;
}

/** Constrói a aplicação Fastify completa. */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const secret = options.secret ?? requireAuthSecret(env);

  let repositories: Repositories;
  let close: () => Promise<void>;
  if (options.repositories !== undefined) {
    repositories = options.repositories;
    close = async () => {
      await repositories.close();
    };
  } else {
    const created = createRepositories(env);
    repositories = created.repositories;
    close = created.close;
  }

  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: () => randomUUID(),
    bodyLimit: 256 * 1024,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? 'http://127.0.0.1:5173',
    credentials: true,
  });

  registerErrorHandler(app);
  registerAuth(app, { secret, ttlSeconds: ACCESS_TOKEN_TTL_SECONDS, now: options.now });
  registerRateLimit(app, {
    enabled: env.NODE_ENV !== 'test',
    max: 300,
    windowMs: 60_000,
    overrides: {
      '/api/v1/auth/login': { max: 10, windowMs: 60_000 },
      '/api/v1/auth/register': { max: 5, windowMs: 60_000 },
    },
  });

  registerGatewayRoutes(app);

  const auth = createAuthService({ repositories, secret, now: options.now });
  const mfa = createMfaService({
    repositories,
    secret,
    now: options.now,
    openSession: (userId, userAgent) => auth.openSession(userId, userAgent),
  });

  registerAuthRoutes(app, { auth, mfa });
  registerLibraryRoutes(app, repositories);
  registerGameRoutes(app, repositories);
  registerSourceRoutes(app);
  registerCommunityRoutes(app, repositories);
  registerStoreRoutes(app, repositories);
  registerStatsRoutes(app, repositories);
  registerFamilyRoutes(app, repositories);
  registerFamilyInviteRoutes(app, repositories);
  registerFriendsRoutes(app, repositories);
  registerChatRoutes(app, repositories);
  registerAchievementRoutes(app, repositories);
  registerRecommendRoutes(app, repositories);
  registerSessionRoutes(app, repositories);
  registerAdminRoutes(app, repositories);

  // Saves na nuvem: o arquivo vive no disco (binário opaco), ao lado da base.
  registerSaveRoutes(app, new SaveStore(savesDirectory(env)), repositories.audit);

  app.get('/api/v1/health', async () => ({
    status: repositories.mode === 'memory' ? 'degraded' : 'ok',
    mode: repositories.mode,
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/v1/version', async () => ({
    name: 'NEXORA HUB',
    product: 'nexora-hub-api',
    version: '0.1.0',
  }));

  app.addHook('onClose', async () => {
    await close();
  });

  return app;
}

/** Repositórios em memória (atalho para os testes). */
export { createMemoryRepositories };
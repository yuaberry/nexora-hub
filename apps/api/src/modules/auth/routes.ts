import type { FastifyInstance } from 'fastify';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import type { AuthService } from './service.js';
import type { MfaService } from './mfa-service.js';
import {
  loginRequestSchema,
  logoutRequestSchema,
  mfaConfirmRequestSchema,
  mfaDisableRequestSchema,
  mfaVerifyRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from './schemas.js';

/**
 * Rotas de autenticação da conta NEXORA.
 *
 * O envelope das respostas é o do contrato (`@nexora/protocol`): tokens,
 * desafio de segundo factor, e o utilizador público — nunca a linha da base
 * de dados.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  options: { auth: AuthService; mfa: MfaService },
): void {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = registerRequestSchema.parse(request.body);
    const result = await options.auth.register(input, request.id);
    return reply.code(201).send(result);
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);
    const userAgent = request.headers['user-agent'] ?? null;
    const result = await options.auth.login(input, { userAgent, requestId: request.id });
    return reply.code(result.kind === 'authenticated' ? 200 : 202).send(result);
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const input = refreshRequestSchema.parse(request.body);
    const result = await options.auth.refresh(input.refreshToken, request.id);
    return reply.code(200).send(result);
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const input = logoutRequestSchema.parse(request.body);
    await options.auth.logout(input.refreshToken, request.id);
    return reply.code(204).send();
  });

  /** Pública: quem pede ainda não tem sessão — tem um desafio. */
  app.post('/api/v1/auth/mfa/verify', async (request, reply) => {
    const input = mfaVerifyRequestSchema.parse(request.body);
    const userAgent = request.headers['user-agent'] ?? null;
    const result = await options.mfa.verifyChallenge(input.challengeToken, input.code, userAgent);
    return reply.code(200).send(result);
  });

  app.get('/api/v1/me', async (request, reply) => {
    const user = requireAuth(request);
    const record = await options.auth.repositories.users.findById(user.id);
    if (record === null) {
      throw errors.unauthenticated();
    }
    const mfa = await options.auth.repositories.mfa.findEnabled(user.id);
    return reply.code(200).send({
      user: {
        id: record.id,
        email: record.email,
        displayName: record.displayName,
        role: record.role,
        planId: record.planId,
        mfaEnabled: mfa !== null,
        createdAt: record.createdAt.toISOString(),
      },
    });
  });

  app.post('/api/v1/auth/mfa/enroll', async (request, reply) => {
    const user = requireAuth(request);
    const enrollment = await options.mfa.startEnrollment(user.id);
    return reply.code(200).send(enrollment);
  });

  app.post('/api/v1/auth/mfa/confirm', async (request, reply) => {
    const user = requireAuth(request);
    const input = mfaConfirmRequestSchema.parse(request.body);
    const recoveryCodes = await options.mfa.confirmEnrollment(user.id, input.code);
    return reply.code(200).send({ recoveryCodes });
  });

  app.post('/api/v1/auth/mfa/disable', async (request, reply) => {
    const user = requireAuth(request);
    const input = mfaDisableRequestSchema.parse(request.body);
    await options.mfa.disable(user.id, input.code);
    return reply.code(204).send();
  });

  app.post('/api/v1/auth/mfa/recovery-codes', async (request, reply) => {
    const user = requireAuth(request);
    const input = mfaDisableRequestSchema.parse(request.body);
    const recoveryCodes = await options.mfa.regenerateRecoveryCodes(user.id, input.code);
    return reply.code(200).send({ recoveryCodes });
  });
}
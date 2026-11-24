import type { FastifyInstance } from 'fastify';
import { reputationProgress } from '@nexora/core';
import { requireAuth } from '../../plugins/errorHandler.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Reputação — os níveis a partir dos pontos reais.
 *
 * Não há tabela nova: a reputação lê o **saldo de pontos** que já existe
 * (conquistas e participação) e aplica os limiares do domínio. O número é o
 * que o utilizador tem — não uma estimativa, não um contador próprio.
 */

/** Regista a rota da reputação. */
export function registerReputationRoute(app: FastifyInstance, repositories: Repositories): void {
  app.get('/api/v1/reputation', async (request) => {
    const actor = requireAuth(request);
    const balance = await repositories.achievements.balance(actor.id);
    const progress = reputationProgress(balance);
    return {
      points: progress.points,
      level: progress.current.key,
      next: progress.next?.key ?? null,
      fraction: progress.fraction,
      remaining: progress.remaining,
    };
  });
}

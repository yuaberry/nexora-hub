import type { FastifyInstance } from 'fastify';
import {
  evaluateAchievements,
  pointsOf,
  summarizeSessions,
  totalPointsAvailable,
} from '@nexora/core';
import { requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Conquistas e pontos — a economia do launcher.
 *
 * Duas regras que estas rotas impõem:
 *
 * 1. **Nada se desbloqueia sem dados**: a avaliação corre sobre as sessões
 *    reais do utilizador (as mesmas que as estatísticas), e uma conquista
 *    nova é desbloqueada **uma vez** — desbloquear duas vezes não repete os
 *    pontos.
 * 2. **O saldo é derivado**: a soma das entradas do livro, nunca um campo
 *    guardado. Um saldo que pudesse ser editado não seria um saldo.
 */

/** Quantas entradas do livro mostrar. */
const MAX_LEDGER = 50;

/** Regista as rotas de conquistas e pontos. */
export function registerAchievementRoutes(app: FastifyInstance, repositories: Repositories): void {
  // O meu progresso, com o que ainda falta para cada conquista.
  app.get('/api/v1/achievements', async (request) => {
    const actor = requireAuth(request);

    const sessions = await repositories.sessions.listAllByUser(actor.id);
    const library = await repositories.library.listByUser(actor.id);
    const tagsByGame = new Map<string, readonly string[]>();
    for (const entry of library) {
      tagsByGame.set(entry.externalKey, entry.tags);
    }
    const samples = sessions.map((session) => ({
      gameId: session.gameId,
      startedAt: session.startedAt.toISOString(),
      durationSeconds: session.durationSeconds,
    }));
    const summary = summarizeSessions(samples, tagsByGame);

    const avaliadas = evaluateAchievements({ summary, sessions: samples });
    const desbloqueadasAntes = new Set(
      (await repositories.achievements.listUnlocked(actor.id)).map((row) => row.achievementId),
    );

    const items = [];
    for (const avaliada of avaliadas) {
      // A conquista que acabou de se cumprir é desbloqueada agora — e os
      // pontos entram no livro uma única vez.
      const nova = avaliada.unlocked && !desbloqueadasAntes.has(avaliada.achievement.id);
      if (nova) {
        await repositories.achievements.unlock(actor.id, avaliada.achievement.id, new Date());
        await repositories.achievements.addPoints({
          userId: actor.id,
          delta: pointsOf(avaliada.achievement.id),
          reason: `achievement.${avaliada.achievement.id}`,
          entityId: avaliada.achievement.id,
        });
        await audit(repositories.audit, {
          actorId: actor.id,
          action: 'achievement.unlocked',
          entity: 'achievement',
          entityId: avaliada.achievement.id,
          requestId: request.id,
        });
      }
      items.push({
        id: avaliada.achievement.id,
        labelKey: avaliada.achievement.labelKey,
        hintKey: avaliada.achievement.hintKey,
        target: avaliada.achievement.target,
        value: avaliada.value,
        progress: avaliada.progress,
        unlocked: avaliada.unlocked,
        points: avaliada.achievement.points,
        // A contagem global é um número real de jogadores, não uma estimativa.
        holders: await repositories.achievements.countUnlockedByAchievement(avaliada.achievement.id),
      });
    }

    const saldo = await repositories.achievements.balance(actor.id);
    return { items, balance: saldo, totalAvailable: totalPointsAvailable() };
  });

  // O saldo e o livro de pontos (a trilha de onde vieram).
  app.get('/api/v1/points', async (request) => {
    const actor = requireAuth(request);
    const [balance, entries] = await Promise.all([
      repositories.achievements.balance(actor.id),
      repositories.achievements.listPoints(actor.id, MAX_LEDGER),
    ]);
    return {
      balance,
      totalAvailable: totalPointsAvailable(),
      ledger: entries.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        reason: entry.reason,
        entityId: entry.entityId,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });
}
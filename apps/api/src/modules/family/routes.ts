import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createFamily,
  dissolveFamily,
  familyBenefits,
  maxFamilyMembers,
  mergeSharedLibraries,
  remainingFamilySlots,
  removeMember,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';
import {
  currentFamily,
  familyView,
  nowIso,
  planOf,
  refusalError,
  stateOfUser,
} from './views.js';

/**
 * Família — grupo de até ao limite do plano, com biblioteca partilhada.
 *
 * Regras que estas rotas impõem (todas exercitadas pelo domínio puro em
 * `@nexora/core/family`):
 *
 * - uma pessoa está em **no máximo um** grupo — a criação e a aceitação
 *   recusam quem já tem grupo;
 * - convites pendentes **ocupam lugar**: o limite do plano é respeitado
 *   antes de alguém aceitar, não só depois;
 * - quem aceita entra com a conta que já tem — o convite não cria conta, e
 *   convidar um email sem conta é recusado com `404`;
 * - o dono não sai nem é removido: ou fica, ou dissolve o grupo;
 * - um convite com sete dias não entra por ninguém.
 */

/** Corpo da criação do grupo. */
const CreateFamilyBody = z.object({ name: z.string().min(1).max(80) });

/** Regista as rotas da Família. */
export function registerFamilyRoutes(app: FastifyInstance, repositories: Repositories): void {
  // O grupo da pessoa (ou `null` — a página explica o que falta). O plano
  // vem sempre: os limites são do utilizador, não do grupo — assim a página
  // mostra quantos membros cabem antes de criar o grupo.
  app.get('/api/v1/family', async (request) => {
    const user = requireAuth(request);
    const ownPlan = await planOf(repositories, user.id);
    const { snapshot, plan } = await currentFamily(repositories, user.id);
    const effectivePlan = plan ?? ownPlan;
    const planView = {
      id: effectivePlan.id,
      maxMembers: maxFamilyMembers(effectivePlan),
      remainingSlots: remainingFamilySlots(effectivePlan, snapshot?.members.length ?? 0),
      benefits: familyBenefits(effectivePlan),
    };
    if (snapshot === null || plan === null) {
      return { group: null, plan: planView };
    }
    return { group: await familyView(repositories, snapshot, plan), plan: planView };
  });

  // Cria o grupo com quem pede como dono.
  app.post('/api/v1/family', async (request, reply) => {
    const user = requireAuth(request);
    const parsed = CreateFamilyBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'name', message: 'Nome entre 2 e 40 caracteres.', code: 'invalid_value' },
      ]);
    }
    const plan = await planOf(repositories, user.id);
    // O estado vem da base: quem já tem grupo é recusado pelo domínio com
    // `already-in-family` — nunca um segundo grupo por dono.
    const { state } = await stateOfUser(repositories, user.id);
    const outcome = createFamily(state, {
      groupId: randomUUID(),
      name: parsed.data.name,
      ownerId: user.id,
      now: nowIso(),
      plan,
    });
    if (!outcome.ok) {
      throw refusalError(outcome.reason, 'Não foi possível criar o grupo.');
    }
    await repositories.family.createGroup({
      id: outcome.state.groupId ?? randomUUID(),
      name: outcome.state.name ?? '',
      ownerId: user.id,
    });
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.create',
      entity: 'family_group',
      entityId: outcome.state.groupId,
      metadata: { name: outcome.state.name },
      requestId: request.id,
    });
    const fresh = await repositories.family.findGroupByUser(user.id);
    if (fresh === null) {
      throw errors.internal();
    }
    reply.status(201);
    return { group: await familyView(repositories, fresh, plan) };
  });

  // Remove um membro (ou sai do grupo, quando o membro é o próprio).
  app.delete('/api/v1/family/members/:userId', async (request, reply) => {
    const user = requireAuth(request);
    const targetId = (request.params as { userId: string }).userId;
    const { snapshot, state } = await stateOfUser(repositories, user.id);
    if (snapshot === null) {
      throw errors.notFound('Ainda não tens um grupo familiar.');
    }
    const outcome = removeMember(state, { actorId: user.id, userId: targetId });
    if (!outcome.ok) {
      throw refusalError(outcome.reason, 'Não foi possível remover o membro.');
    }
    await repositories.family.removeMember(snapshot.group.id, targetId);
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.member.remove',
      entity: 'family_group',
      entityId: snapshot.group.id,
      metadata: { memberId: targetId },
      requestId: request.id,
    });
    reply.status(204);
    return null;
  });

  // Dissolve o grupo (só o dono).
  app.delete('/api/v1/family', async (request, reply) => {
    const user = requireAuth(request);
    const { snapshot, state } = await stateOfUser(repositories, user.id);
    if (snapshot === null) {
      throw errors.notFound('Ainda não tens um grupo familiar.');
    }
    const outcome = dissolveFamily(state, { actorId: user.id });
    if (!outcome.ok) {
      throw refusalError(outcome.reason, 'Não foi possível dissolver o grupo.');
    }
    await repositories.family.deleteGroup(snapshot.group.id);
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.dissolve',
      entity: 'family_group',
      entityId: snapshot.group.id,
      requestId: request.id,
    });
    reply.status(204);
    return null;
  });

  // Biblioteca partilhada: a junção das bibliotecas dos membros, sem
  // duplicados — o mesmo jogo de duas pessoas aparece uma vez.
  app.get('/api/v1/family/games', async (request) => {
    const user = requireAuth(request);
    const snapshot = await repositories.family.findGroupByUser(user.id);
    if (snapshot === null) {
      return { items: [], total: 0 };
    }
    const entries = (
      await Promise.all(
        snapshot.members.map(async (member) =>
          (await repositories.library.listByUser(member.userId)).map((entry) => ({
            userId: member.userId,
            externalKey: entry.externalKey,
            title: entry.title,
          })),
        ),
      )
    ).flat();
    const merged = mergeSharedLibraries(entries);
    const owners = new Map<string, { displayName: string | null }>();
    for (const member of snapshot.members) {
      const owner = await repositories.users.findById(member.userId);
      owners.set(member.userId, { displayName: owner?.displayName ?? null });
    }
    return {
      items: merged.map((game) => ({
        externalKey: game.externalKey,
        title: game.title,
        owners: game.owners.map((userId) => ({
          userId,
          displayName: owners.get(userId)?.displayName ?? null,
        })),
      })),
      total: merged.length,
    };
  });
}
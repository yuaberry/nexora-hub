import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { acceptInvite, declineInvite, inviteMember } from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';
import {
  currentFamily,
  familyView,
  inviteCode,
  nowIso,
  persistExpired,
  planOf,
  refusalError,
  stateOf,
} from './views.js';

/**
 * Convites da Família — convidar, aceitar e recusar.
 *
 * Separado das rotas do grupo para que cada ficheiro fique pequeno: aqui
 * vive o ciclo de vida do convite (código único, validade de sete dias,
 * lugar ocupado enquanto está pendente).
 */

/** Corpo do convite. */
const InviteBody = z.object({ email: z.string().min(3).max(254) });

/** Corpo do aceite/recusa. */
const CodeBody = z.object({ code: z.string().min(4).max(32) });

/** Regista as rotas de convite. */
export function registerFamilyInviteRoutes(app: FastifyInstance, repositories: Repositories): void {
  // Convida um email (a pessoa tem de ter conta).
  app.post('/api/v1/family/invites', async (request, reply) => {
    const user = requireAuth(request);
    const parsed = InviteBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'email', message: 'Email inválido.', code: 'invalid_value' },
      ]);
    }
    const { snapshot, state, plan } = await currentFamily(repositories, user.id);
    if (snapshot === null || plan === null) {
      throw errors.notFound('Ainda não tens um grupo familiar.');
    }
    const invited = await repositories.users.findByEmail(parsed.data.email.toLowerCase());
    if (invited === null) {
      // Honestidade: o convite não cria conta — quem não tem conta entra
      // depois de criar uma, com o mesmo código.
      throw errors.notFound('Nenhuma conta com esse email.');
    }
    const invitedGroup = await repositories.family.findGroupByUser(invited.id);
    if (invitedGroup !== null) {
      throw errors.conflict('Essa pessoa já está num grupo.', { reason: 'already-member' });
    }
    const outcome = inviteMember(state, {
      inviteId: randomUUID(),
      code: inviteCode(),
      email: parsed.data.email.toLowerCase(),
      actorId: user.id,
      actorEmail: user.email,
      now: nowIso(),
      plan,
    });
    if (!outcome.ok) {
      throw refusalError(outcome.reason, 'Não foi possível convidar.');
    }
    const invite = outcome.state.invites[outcome.state.invites.length - 1];
    if (invite === undefined) {
      throw errors.internal();
    }
    await repositories.family.createInvite({
      id: invite.id,
      groupId: snapshot.group.id,
      code: invite.code,
      email: invite.email,
      invitedBy: user.id,
      expiresAt: new Date(invite.expiresAt),
    });
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.invite',
      entity: 'family_group',
      entityId: snapshot.group.id,
      metadata: { email: invite.email },
      requestId: request.id,
    });
    reply.status(201);
    return { code: invite.code, email: invite.email, expiresAt: invite.expiresAt };
  });

  // Aceita um convite pelo código.
  app.post('/api/v1/family/invites/accept', async (request, reply) => {
    const user = requireAuth(request);
    const parsed = CodeBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'code', message: 'Código inválido.', code: 'invalid_value' },
      ]);
    }
    const row = await repositories.family.findInviteByCode(parsed.data.code.trim().toUpperCase());
    if (row === null) {
      throw errors.notFound('Convite não encontrado.');
    }
    const existing = await repositories.family.findGroupByUser(user.id);
    if (existing !== null) {
      throw errors.conflict('Já estás num grupo familiar.', { reason: 'already-in-family' });
    }
    const snapshot = await repositories.family.findGroupById(row.groupId);
    if (snapshot === null) {
      throw errors.notFound('Convite não encontrado.');
    }
    const plan = await planOf(repositories, snapshot.group.ownerId);
    // A expiração é verificada pelo próprio domínio (a razão
    // `invite-expired` existe para isso); a marca na base é persistida na
    // recusa — um convite velho não fica pendente para sempre.
    const outcome = acceptInvite(stateOf(snapshot), {
      code: row.code,
      userId: user.id,
      now: nowIso(),
      plan,
    });
    if (!outcome.ok) {
      if (outcome.state !== undefined) {
        await persistExpired(repositories, snapshot, outcome.state);
      }
      throw refusalError(outcome.reason, 'Não foi possível aceitar o convite.');
    }
    await repositories.family.addMember({
      groupId: snapshot.group.id,
      userId: user.id,
      role: 'member',
      joinedAt: new Date(),
    });
    await repositories.family.respondInvite(row.id, 'accepted', new Date());
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.invite.accept',
      entity: 'family_group',
      entityId: snapshot.group.id,
      requestId: request.id,
    });
    const fresh = await repositories.family.findGroupByUser(user.id);
    if (fresh === null) {
      throw errors.internal();
    }
    reply.status(200);
    return { group: await familyView(repositories, fresh, plan) };
  });

  // Recusa um convite (quem foi convidado pode dizer que não).
  app.post('/api/v1/family/invites/decline', async (request) => {
    const user = requireAuth(request);
    const parsed = CodeBody.safeParse(request.body);
    if (!parsed.success) {
      throw errors.invalidRequest('Payload inválido.', [
        { path: 'code', message: 'Código inválido.', code: 'invalid_value' },
      ]);
    }
    const row = await repositories.family.findInviteByCode(parsed.data.code.trim().toUpperCase());
    if (row === null) {
      throw errors.notFound('Convite não encontrado.');
    }
    const invited = await repositories.users.findByEmail(row.email);
    if (invited === null || invited.id !== user.id) {
      // O convite de outra pessoa é indistinguível de um inexistente.
      throw errors.notFound('Convite não encontrado.');
    }
    const snapshot = await repositories.family.findGroupById(row.groupId);
    if (snapshot !== null) {
      const outcome = declineInvite(stateOf(snapshot), { code: row.code, now: nowIso() });
      if (!outcome.ok) {
        throw refusalError(outcome.reason, 'Não foi possível recusar o convite.');
      }
    }
    await repositories.family.respondInvite(row.id, 'declined', new Date());
    await audit(repositories.audit, {
      actorId: user.id,
      action: 'family.invite.decline',
      entity: 'family_group',
      entityId: row.groupId,
      requestId: request.id,
    });
    return { status: 'declined' };
  });
}
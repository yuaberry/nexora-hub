import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  canChangeRole,
  canKick,
  canLeave,
  canManage,
  isFull,
  MAX_CLAN_MEMBERS,
  MAX_CLAN_NAME_LENGTH,
  MAX_CLAN_TAG_LENGTH,
} from '@nexora/core';
import { errors, requireAuth } from '../../plugins/errorHandler.js';
import type { Clan, ClanMembership, ClanRole } from '@nexora/core';
import type { ClanMemberRecord, ClanRecord, ClanRepository, Repositories } from '../../repositories/types.js';

/**
 * Clãs — grupos de jogadores.
 *
 * As regras vivem no domínio (`@nexora/core/community/clans`), testadas sem
 * rede: quem gere, quem muda papéis, quem sai e quem é expulso. A API só
 * carrega o estado, aplica a regra e persiste — o mesmo desenho dos amigos e
 * da família.
 *
 * Um recurso de outro utilizador devolve **404**, nunca `403`.
 */

/** Corpo da criação de um clã. */
const CreateClanBody = z.object({
  name: z.string().min(3).max(MAX_CLAN_NAME_LENGTH),
  tag: z.string().min(1).max(MAX_CLAN_TAG_LENGTH),
  description: z.string().max(500).optional(),
});

/** Corpo de um convite. */
const InviteBody = z.object({ email: z.string().email().max(254) });

/** Corpo da mudança de papel. */
const RoleBody = z.object({ role: z.enum(['officer', 'member']) });

/** Parâmetro do clã. */
const ClanParams = z.object({ clanId: z.string().uuid() });

/** Parâmetro do membro. */
const MemberParams = z.object({ clanId: z.string().uuid(), userId: z.string().uuid() });

/** Parâmetro do convite. */
const InviteParams = z.object({ inviteId: z.string().uuid() });

/** Vista de um clã. */
function clanView(clan: ClanRecord): Record<string, unknown> {
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    ownerId: clan.ownerId,
    memberCount: clan.memberCount,
    full: isFull(toDomainClan(clan)),
    createdAt: clan.createdAt.toISOString(),
  };
}

/** O registo do banco na forma que o domínio espera (datas em ISO). */
function toDomainClan(clan: ClanRecord): Clan {
  return { ...clan, createdAt: clan.createdAt.toISOString() };
}

/** A pertença do banco na forma do domínio. */
function toDomainMembership(member: ClanMemberRecord | null): ClanMembership | null {
  return member === null ? null : { ...member, role: member.role as ClanRole, joinedAt: member.joinedAt.toISOString() };
}

/** Regista as rotas dos clãs. */
export function registerClanRoutes(app: FastifyInstance, repositories: Repositories): void {
  const clans: ClanRepository = repositories.clans;

  /** O membro do clã, ou `null` (quem não é membro não tem poderes). */
  async function membershipOf(clanId: string, userId: string) {
    return clans.membership(clanId, userId);
  }

  // ---- Criar e listar -----------------------------------------------

  app.post('/api/v1/clans', async (request, reply) => {
    const actor = requireAuth(request);
    const body = CreateClanBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Nome (3–24), etiqueta (1–5) e descrição opcional.');
    }
    const created = await clans.create({
      name: body.data.name,
      tag: body.data.tag,
      description: body.data.description ?? '',
      ownerId: actor.id,
    });
    if (!created.ok) {
      if (created.reason === 'name-taken') {
        throw errors.conflict('Já existe um clã com esse nome.');
      }
      throw errors.invalidRequest('Nome inválido.');
    }
    reply.status(201);
    return { clan: clanView(created.clan), role: created.membership.role };
  });

  app.get('/api/v1/clans/mine', async (request) => {
    const actor = requireAuth(request);
    const mine = await clans.listByUser(actor.id);
    return {
      items: mine.map((entry) => ({ clan: clanView(entry.clan), role: entry.role })),
    };
  });

  app.get<{ Params: { clanId: string } }>('/api/v1/clans/:clanId', async (request) => {
    const actor = requireAuth(request);
    const params = ClanParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Clã inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null) {
      throw errors.notFound('Clã não encontrado.');
    }
    const [members, mine] = await Promise.all([
      clans.members(clan.id),
      membershipOf(clan.id, actor.id),
    ]);
    return {
      clan: clanView(clan),
      myRole: mine?.role ?? null,
      members: members.map((member) => ({
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  });

  // ---- Convites ------------------------------------------------------

  app.post<{ Params: { clanId: string } }>('/api/v1/clans/:clanId/invites', async (request, reply) => {
    const actor = requireAuth(request);
    const params = ClanParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Clã inválido.');
    }
    const body = InviteBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Email inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null) {
      throw errors.notFound('Clã não encontrado.');
    }
    const mine = await membershipOf(clan.id, actor.id);
    if (!canManage(toDomainClan(clan), toDomainMembership(mine))) {
      throw errors.notFound('Clã não encontrado.');
    }
    if (isFull(toDomainClan(clan))) {
      throw errors.forbidden(`O clã está cheio (${MAX_CLAN_MEMBERS} membros).`);
    }
    const invite = await clans.invite({ clanId: clan.id, inviterId: actor.id, inviteeEmail: body.data.email });
    reply.status(201);
    return { invite: { id: invite.id, email: invite.inviteeEmail, status: invite.status } };
  });

  app.get('/api/v1/clans/invites/mine', async (request) => {
    const actor = requireAuth(request);
    // Os convites são por **email** (quem foi convidado pode não ter conta
    // ainda): os meus são os do meu email, lido do repositório de users.
    const user = await repositories.users.findById(actor.id);
    if (user === null || user.email === '') {
      return { items: [] };
    }
    const invites = await clans.pendingInvites(user.email);
    return {
      items: await Promise.all(
        invites.map(async (invite) => {
          const clan = await clans.findById(invite.clanId);
          return {
            id: invite.id,
            clan: clan === null ? null : { id: clan.id, name: clan.name, tag: clan.tag },
            createdAt: invite.createdAt.toISOString(),
          };
        }),
      ),
    };
  });

  app.post<{ Params: { inviteId: string } }>('/api/v1/clans/invites/:inviteId/answer', async (request) => {
    const actor = requireAuth(request);
    const params = InviteParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Convite inválido.');
    }
    const body = z.object({ accept: z.boolean() }).safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Resposta inválida.');
    }
    const invite = await clans.findInvite(params.data.inviteId);
    if (invite === null || invite.status !== 'pending') {
      throw errors.notFound('Convite não encontrado.');
    }
    // O convite é **daquele email**: aceitar com outra conta é um convite
    // que não é teu — e a resposta não distingue (404, nunca 403).
    const user = await repositories.users.findById(actor.id);
    if (user === null || user.email.toLowerCase() !== invite.inviteeEmail.toLowerCase()) {
      throw errors.notFound('Convite não encontrado.');
    }
    const answered = await clans.answerInvite(invite.id, body.data.accept ? 'accepted' : 'declined');
    if (answered === null) {
      throw errors.notFound('Convite não encontrado.');
    }
    if (body.data.accept) {
      const clan = await clans.findById(invite.clanId);
      // Um clã cheio ou dissolvido recusa a entrada com honestidade.
      if (clan === null) {
        throw errors.notFound('O clã já não existe.');
      }
      if (isFull(toDomainClan(clan))) {
        throw errors.forbidden(`O clã encheu enquanto pensavas (${MAX_CLAN_MEMBERS} membros).`);
      }
      await clans.join(clan.id, actor.id);
    }
    return { ok: true, status: answered.status };
  });

  // ---- Membros --------------------------------------------------------

  app.post<{ Params: { clanId: string; userId: string } }>('/api/v1/clans/:clanId/members/:userId/role', async (request) => {
    const actor = requireAuth(request);
    const params = MemberParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Membro inválido.');
    }
    const body = RoleBody.safeParse(request.body);
    if (!body.success) {
      throw errors.invalidRequest('Papel inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null) {
      throw errors.notFound('Clã não encontrado.');
    }
    const mine = await membershipOf(clan.id, actor.id);
    if (!canChangeRole(toDomainClan(clan), toDomainMembership(mine), params.data.userId)) {
      throw errors.notFound('Clã não encontrado.');
    }
    const target = await membershipOf(clan.id, params.data.userId);
    if (target === null) {
      throw errors.notFound('Membro não encontrado.');
    }
    await clans.setRole(clan.id, params.data.userId, body.data.role);
    return { ok: true, role: body.data.role };
  });

  app.post<{ Params: { clanId: string; userId: string } }>('/api/v1/clans/:clanId/members/:userId/kick', async (request) => {
    const actor = requireAuth(request);
    const params = MemberParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Membro inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null) {
      throw errors.notFound('Clã não encontrado.');
    }
    const [mine, target] = await Promise.all([
      membershipOf(clan.id, actor.id),
      membershipOf(clan.id, params.data.userId),
    ]);
    if (target === null || !canKick(toDomainClan(clan), toDomainMembership(mine), toDomainMembership(target))) {
      throw errors.notFound('Membro não encontrado.');
    }
    await clans.removeMember(clan.id, params.data.userId);
    return { ok: true };
  });

  app.post<{ Params: { clanId: string } }>('/api/v1/clans/:clanId/leave', async (request) => {
    const actor = requireAuth(request);
    const params = ClanParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Clã inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null) {
      throw errors.notFound('Clã não encontrado.');
    }
    const mine = await membershipOf(clan.id, actor.id);
    if (!canLeave(toDomainClan(clan), toDomainMembership(mine))) {
      throw errors.forbidden('O dono não sai sem dissolver o clã ou passar o cargo.');
    }
    await clans.removeMember(clan.id, actor.id);
    return { ok: true };
  });

  app.delete<{ Params: { clanId: string } }>('/api/v1/clans/:clanId', async (request, reply) => {
    const actor = requireAuth(request);
    const params = ClanParams.safeParse(request.params);
    if (!params.success) {
      throw errors.invalidRequest('Clã inválido.');
    }
    const clan = await clans.findById(params.data.clanId);
    if (clan === null || clan.ownerId !== actor.id) {
      // 404, não 403: um clã que não é teu não existe para ti.
      throw errors.notFound('Clã não encontrado.');
    }
    await clans.dissolve(clan.id);
    reply.status(204);
    return null;
  });
}
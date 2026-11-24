/**
 * Clãs — grupos de jogadores, com regras puras.
 *
 * Um clã tem dono, oficiais e membros. As quatro regras que governam quem
 * pode o quê vivem aqui, testadas sem rede nem base de dados:
 *
 * - **gerir** (convidar, expulsar, promover) é do dono e dos oficiais;
 * - **promover e despromover** é só do **dono** — um oficial não cria outro
 *   oficial (é o que impede a escalada de privilégios);
 * - o **dono não sai** sem primeiro passar o clã a outro membro ou dissolvê-lo
 *   — um clã sem dono não tem quem responda por ele;
 * - expulsar o **dono** não é possível: sai-secasto dissolvendo.
 */

/** O maior nome de um clã. */
export const MAX_CLAN_NAME_LENGTH = 24;

/** A maior etiqueta de um clã (o que aparece ao lado do nome). */
export const MAX_CLAN_TAG_LENGTH = 5;

/** O maior número de membros de um clã (limite declarado e aplicado). */
export const MAX_CLAN_MEMBERS = 50;

/** Papéis dentro de um clã, do mais alto ao mais baixo. */
export type ClanRole = 'owner' | 'officer' | 'member';

/** Um clã. */
export interface Clan {
  readonly id: string;
  readonly name: string;
  /** A etiqueta curta (ex.: `NX`). */
  readonly tag: string;
  readonly description: string;
  readonly ownerId: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

/** A pertença de um utilizador num clã. */
export interface ClanMembership {
  readonly clanId: string;
  readonly userId: string;
  readonly role: ClanRole;
  readonly joinedAt: string;
}

/**
 * Quem gere o clã.
 *
 * Dono e oficiais gerem; um membro comum não. A pertença é conhecida — sem
 * ela, ninguém gere.
 */
export function canManage(clan: Clan, membership: ClanMembership | null): boolean {
  if (membership === null || membership.clanId !== clan.id) {
    return false;
  }
  return membership.role === 'owner' || membership.role === 'officer';
}

/**
 * Quem muda papéis.
 *
 * Só o dono — e nunca a si próprio (promover-se a dono não faz sentido: já o
 * é; despromover-se deixaria o clã sem dono).
 */
export function canChangeRole(clan: Clan, actor: ClanMembership | null, targetId: string): boolean {
  if (actor === null || actor.clanId !== clan.id || actor.userId === targetId) {
    return false;
  }
  return actor.role === 'owner';
}

/**
 * Quem pode sair.
 *
 * Todos menos o dono: quem criou o clã dissolve-o ou passa-o a outro —
 * abandoná-lo deixaria o grupo sem responsável.
 */
export function canLeave(clan: Clan, membership: ClanMembership | null): boolean {
  if (membership === null || membership.clanId !== clan.id) {
    return false;
  }
  return membership.role !== 'owner';
}

/**
 * Quem pode expulsar quem.
 *
 * O dono expulsa qualquer membro (menos a si próprio — sai é dissolver). Um
 * oficial expulsa apenas **membros comuns**: um desentendimento entre
 * oficiais é assunto do dono, não de um deles.
 */
export function canKick(clan: Clan, actor: ClanMembership | null, target: ClanMembership | null): boolean {
  // Um alvo que não é membro (ou já saiu) não se expulsa.
  if (target === null || actor === null || !canManage(clan, actor) || target.userId === clan.ownerId) {
    return false;
  }
  if (actor.role === 'owner') {
    return true;
  }
  // oficial: só membros comuns, e nunca a si próprio
  return target.role === 'member' && actor.userId !== target.userId;
}

/** O clã está cheio? (o limite é aplicado, não é texto). */
export function isFull(clan: Clan): boolean {
  return clan.memberCount >= MAX_CLAN_MEMBERS;
}
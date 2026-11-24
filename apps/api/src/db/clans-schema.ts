import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema dos clãs — grupos, pertenças e convites.
 *
 * Três regras que o esquema impõe:
 *
 * - o nome de um clã é **único** (dois clãs com o mesmo nome seriam dois
 *   grupos a responder pelo mesmo nome);
 * - a pertença é **uma por clã e utilizador** (chave primária composta) —
 *   entrar duas vezes não faz sentido;
 * - um convite guarda o **email** de quem foi convidado (pode não ter conta
 *   ainda) e o seu estado — aceitar transforma-o em pertença.
 */

/** Clãs. */
export const clans = pgTable('clans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tag: text('tag').notNull(),
  description: text('description').notNull().default(''),
  ownerId: uuid('owner_id').notNull(),
  memberCount: integer('member_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Pertenças (uma por clã e utilizador). */
export const clanMembers = pgTable('clan_members', {
  clanId: uuid('clan_id').notNull(),
  userId: uuid('user_id').notNull(),
  /** `owner`, `officer` ou `member`. */
  role: text('role').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Convites para um clã (por email de quem foi convidado). */
export const clanInvites = pgTable('clan_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  clanId: uuid('clan_id').notNull(),
  inviterId: uuid('inviter_id').notNull(),
  inviteeEmail: text('invitee_email').notNull(),
  /** `pending`, `accepted` ou `declined`. */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
});

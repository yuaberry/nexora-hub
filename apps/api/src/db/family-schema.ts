import { pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema do grupo familiar.
 *
 * Duas regras que o esquema impõe:
 *
 * - uma pessoa está em **no máximo um** grupo: a chave primária de
 *   `family_members` é (grupo, utilizador) e o dono tem um grupo único —
 *   estar em dois seria conviver com duas bibliotecas partilhadas;
 * - um convite tem **código único**: aceitar duas vezes o mesmo código
 *   não pode criar dois membros.
 */

/** Um grupo familiar (o dono é um membro com papel `owner`). */
export const familyGroups = pgTable('family_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Um grupo por dono: criar um segundo é recusado pela regra, e o índice
  // único garante que nem uma corrida de dois pedidos o fura.
  uniqueIndex('family_groups_owner_unique').on(table.ownerId),
]);

/** Membros do grupo (o dono entra como `owner`). */
export const familyMembers = pgTable('family_members', {
  groupId: uuid('group_id').notNull(),
  userId: uuid('user_id').notNull(),
  /** Papel no grupo: `owner`, `adult` ou `member`. */
  role: text('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
]);

/** Convites para entrar no grupo. */
export const familyInvites = pgTable('family_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull(),
  /** Código apresentado por quem aceita (único). */
  code: text('code').notNull(),
  /** Email convidado. */
  email: text('email').notNull(),
  /** Quem convidou. */
  invitedBy: uuid('invited_by').notNull(),
  /** `pending`, `accepted`, `declined` ou `expired`. */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Data da resposta (aceite/recusa), ou `null`. */
  respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('family_invites_code_unique').on(table.code),
]);
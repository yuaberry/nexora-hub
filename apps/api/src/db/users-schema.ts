import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { UserRole } from './types.js';

/**
 * Utilizadores da plataforma.
 *
 * A senha nunca é guardada em claro: `passwordHash` + `passwordSalt` vêm de
 * scrypt, e a verificação é em tempo constante
 * (`modules/auth/password.ts`).
 *
 * O bloqueio por tentativas falhadas vive **na linha do utilizador**
 * (`failedLoginAttempts`, `lockedUntil`) porque a contagem tem de ser
 * **atómica na base de dados**: cinco logins em paralelo têm de contar cinco.
 * Somar em memória e gravar depois perderia tentativas e o lockout nunca
 * existiria.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    role: text('role').$type<UserRole>().notNull().default('user'),
    planId: text('plan_id').notNull().default('free'),
    /** Tentativas de login falhadas desde o último sucesso. */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    /** Instante até ao qual a conta está bloqueada (`null` = desbloqueada). */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    index('users_created_at_idx').on(table.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
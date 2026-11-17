import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users-schema.js';

/**
 * MFA (TOTP) — o segundo factor das contas.
 *
 * Espelha o Nexora Cloud, incluindo o formato da cifra do segredo
 * (`v1.<iv>.<tag>.<ciphertext>`, AES-256-GCM com chave derivada por HKDF de
 * `AUTH_SECRET`, contexto próprio). O segredo é uma **credencial**: quem o
 * tem gera códigos válidos.
 *
 * - `mfa_secrets` fica com `enabled_at = null` enquanto o utilizador não
 *   confirmar o primeiro código: ninguém activa o MFA sem provar que sabe
 *   gerar códigos;
 * - `mfa_recovery_codes` guarda apenas o **hash** (SHA-256) — um dump da base
 *   não permite resgatar uma conta.
 */
export const mfaSecrets = pgTable(
  'mfa_secrets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    secretCiphertext: text('secret_ciphertext').notNull(),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    /**
     * Último passo TOTP aceite — protecção **anti-replay**.
     *
     * Um passo igual ou anterior a este é recusado: sem isso, um código
     * interceptado valeria várias vezes dentro da mesma janela de 30 s.
     */
    lastUsedStep: integer('last_used_step'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('mfa_secrets_enabled_at_idx').on(table.enabledAt)],
);

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('mfa_recovery_codes_hash_idx').on(table.codeHash),
    index('mfa_recovery_codes_user_id_idx').on(table.userId),
  ],
);

export type MfaSecretRow = typeof mfaSecrets.$inferSelect;
export type MfaRecoveryCodeRow = typeof mfaRecoveryCodes.$inferSelect;
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users-schema.js';
import type { AuthSessionRevokeReason } from './types.js';

/**
 * Sessões de autenticação — o **token de renovação**.
 *
 * O token é opaco (`id.hmac`): o `id` identifica a sessão e o `hmac` prova
 * que foi emitido pelo servidor. **Nenhum segredo é guardado na base de
 * dados** — um dump não dá acesso a nenhuma sessão — e o servidor consegue
 * reemitir o token a partir do `id`, que é o que a janela de tolerância da
 * rotação precisa.
 *
 * Duas regras:
 *
 * - a **família** (`family_id`) é a linhagem: cada renovação cria o sucessor
 *   na mesma família, e o logout revoga a família inteira;
 * - o sucessor fica apontado em `rotated_to_id`: é o que permite devolver o
 *   **mesmo** token quando o cliente repete um pedido dentro da janela —
 *   uma corrida entre dois pedidos não pode matar a sessão de quem não
 *   reutilizou nada.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    rotatedToId: uuid('rotated_to_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason').$type<AuthSessionRevokeReason>(),
    /** Agente do cliente (diagnóstico; não é credencial). */
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_family_id_idx').on(table.familyId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
    uniqueIndex('auth_sessions_rotated_to_id_idx').on(table.rotatedToId),
  ],
);

export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSessionRow = typeof authSessions.$inferInsert;
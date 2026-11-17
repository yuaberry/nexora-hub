import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users-schema.js';
import type { AuditAction } from './types.js';

/**
 * Trilha de auditoria — **escritas**, nunca leituras.
 *
 * Auditar leituras transformaria o registo em ruído: cada actualização de
 * painel escreveria uma entrada, e o ruído esconde exactamente os eventos que
 * o registo existe para preservar (`auth.login_locked`, uma sessão terminada,
 * uma biblioteca alterada). O que foi *consultado* continua rastreável pelo
 * `requestId` que a resposta devolve.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Autor da escrita (`null` = sistema). */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').$type<AuditAction>().notNull(),
    /** Entidade afectada (`user`, `library_entry`, `game_session`…). */
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    /** Metadados mínimos (nunca senhas, segredos ou tokens). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_id_idx').on(table.actorId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
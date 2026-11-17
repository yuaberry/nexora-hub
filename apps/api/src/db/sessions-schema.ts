import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users-schema.js';
import type { GameSessionState } from './types.js';

/**
 * Sessões de jogo — o tempo jogado.
 *
 * Nasce quando o utilizador carrega em **Jogar** e termina quando o
 * executável sai. `exit_code` guarda o código de saída: um código diferente
 * de zero é um *crash*, e a interface mostra-o em vez de o esconder.
 *
 * `duration_seconds` é inteiro porque a coluna é inteira: o arredondamento
 * acontece num único ponto, no fecho da sessão — a duração registada e o
 * tempo mostrado nunca discordam.
 */
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Identificador estável do jogo (catálogo ou chave local). */
    gameId: text('game_id').notNull(),
    state: text('state').$type<GameSessionState>().notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    exitCode: integer('exit_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('game_sessions_user_id_idx').on(table.userId),
    index('game_sessions_game_id_idx').on(table.gameId),
    index('game_sessions_state_idx').on(table.state),
  ],
);

export type GameSessionRow = typeof gameSessions.$inferSelect;
export type NewGameSessionRow = typeof gameSessions.$inferInsert;
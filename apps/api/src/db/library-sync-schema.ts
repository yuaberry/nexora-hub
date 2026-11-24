import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Esquema da biblioteca sincronizada — o que a conta guarda do utilizador.
 *
 * A entrada é **uma por utilizador e jogo** (chave primária composta): sincron
 *izar duas vezes não duplica, e o que é local (caminhos, executáveis) nunca
 * sobe — só o que a conta precisa de saber (título, appid, capa pública,
 * favorito, tempo medido).
 */

/** Entradas de biblioteca por conta. */
export const syncedLibrary = pgTable('library_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  /** A chave externa do jogo (o caminho normalizado, ou `steam-app:<id>`). */
  externalKey: text('external_key').notNull(),
  title: text('title').notNull(),
  steamAppId: text('steam_app_id'),
  /** A capa **pública** (a URL da loja) — caminhos locais não sobem. */
  coverUrl: text('cover_url'),
  installed: boolean('installed').notNull().default(false),
  favorite: boolean('favorite').notNull().default(false),
  /** Segundos medidos pelo runner (o tempo real de quem joga). */
  totalSeconds: integer('total_seconds').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

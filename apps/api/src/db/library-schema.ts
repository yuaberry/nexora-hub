import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users-schema.js';
import type { GameProvider } from './types.js';

/**
 * Biblioteca — metadados dos jogos do utilizador.
 *
 * Os **ficheiros** ficam no computador do utilizador: o que vive aqui é o
 * metadado (título, pasta, executável, etiquetas), para que a web possa ler
 * a mesma biblioteca. A NEXORA não hospeda nem redistribui conteúdo de jogos
 * (`docs/LEGAL.md`), por isso não existe nenhuma coluna de download, licença
 * ou compra.
 *
 * `externalKey` é a identidade estável da entrada local (o id do catálogo ou
 * um slug derivado da pasta): sincronizar duas vezes não duplica a entrada.
 */
export const libraryEntries = pgTable(
  'library_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    externalKey: text('external_key').notNull(),
    title: text('title').notNull(),
    /** Caminho local da capa ou `null` (a interface desenha o placeholder). */
    cover: text('cover'),
    provider: text('provider').$type<GameProvider>().notNull().default('local'),
    installPath: text('install_path'),
    executablePath: text('executable_path'),
    /** Etiquetas (género, modo, motor…). */
    tags: text('tags').array().notNull().default([]),
    adult: boolean('adult').notNull().default(false),
    favorite: boolean('favorite').notNull().default(false),
    /** Colecções a que a entrada pertence (nomes, não uma tabela própria). */
    collections: text('collections').array().notNull().default([]),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
    /** Tempo jogado total, em segundos. */
    totalSeconds: integer('total_seconds').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('library_entries_user_key_unique').on(table.userId, table.externalKey),
    index('library_entries_user_id_idx').on(table.userId),
  ],
);

export type LibraryEntryRow = typeof libraryEntries.$inferSelect;
export type NewLibraryEntryRow = typeof libraryEntries.$inferInsert;
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

/**
 * Aplica as migrações do Drizzle.
 *
 * A pasta de migrações é `apps/api/drizzle` (configurada em
 * `drizzle.config.ts`). O caminho é resolvido a partir do ficheiro para
 * funcionar tanto em `tsx src/db/migrate.ts` quanto em `node dist/db/migrate.js`.
 */

const here = dirname(fileURLToPath(import.meta.url));

async function findMigrationsFolder(): Promise<string> {
  const candidates = [
    join(here, '..', 'drizzle'),
    join(here, '..', '..', 'drizzle'),
    join(process.cwd(), 'drizzle'),
  ];

  for (const candidate of candidates) {
    try {
      await readFile(join(candidate, 'meta', '_journal.json'), 'utf8');
      return candidate;
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new Error(`Pasta de migrações não encontrada. Candidatos: ${candidates.join(', ')}`);
}

/** Aplica as migrações na base de dados indicada. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationsFolder = await findMigrationsFolder();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const db = drizzle(pool, { schema });

  try {
    await migrate(db, { migrationsFolder });
    console.log(`[nexora-hub] migrações aplicadas a partir de ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

/** CLI: `pnpm --filter @nexora/api db:migrate`. */
async function main(): Promise<void> {
  const databaseUrl =
    process.env['DATABASE_URL'] ?? 'postgresql://nexora:nexora_dev@127.0.0.1:54340/nexora_hub';
  await runMigrations(databaseUrl);
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error('[nexora-hub] falha ao aplicar migrações', error);
    process.exit(1);
  });
}
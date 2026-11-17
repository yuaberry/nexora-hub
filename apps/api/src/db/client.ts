import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

/**
 * Cliente PostgreSQL (Drizzle).
 *
 * A conexão é preguiçosa: o pool não falha na criação, apenas ao executar
 * queries. Um erro em conexão ociosa **não** derruba o processo — o estado
 * reportado em `/health` é `degraded` e a API continua a servir.
 */

export interface DatabaseHandle {
  pool: Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => Promise<void>;
}

/** Cria o pool e a instância Drizzle. */
export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', () => {
    // Tratado pelo health check; o pool segue tentando reconectar.
  });

  const db = drizzle(pool, { schema });

  return {
    pool,
    db,
    close: async () => {
      await pool.end();
    },
  };
}

/** Verifica a conectividade com a base de dados. */
export async function pingDatabase(pool: Pool): Promise<{ ok: boolean; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    await pool.query('select 1');
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: Date.now() - startedAt };
  }
}
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const operationalDb = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      max: 6,
      ssl: { rejectUnauthorized: false }
    })
  : null;

export const researchDb = config.researchDatabaseUrl
  ? new Pool({
      connectionString: config.researchDatabaseUrl,
      max: 6,
      ssl: { rejectUnauthorized: false }
    })
  : null;

export async function databaseHealth() {
  const check = async (pool: pg.Pool | null) => {
    if (!pool) return { configured: false, ok: false };
    const started = Date.now();
    try {
      await pool.query('select 1');
      return { configured: true, ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        configured: true,
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  };

  const [operational, research] = await Promise.all([
    check(operationalDb),
    check(researchDb)
  ]);

  return { operational, research };
}

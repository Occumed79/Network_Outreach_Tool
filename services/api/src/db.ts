import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const operationalDb = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      ssl: { rejectUnauthorized: false }
    })
  : null;

export async function databaseHealth() {
  if (!operationalDb) return { configured: false, ok: false };

  const started = Date.now();
  try {
    await operationalDb.query('select 1');
    return {
      configured: true,
      ok: true,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

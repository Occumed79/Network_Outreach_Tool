import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error('DATABASE_URL is not configured.');
}

const directory = path.join(repoRoot, 'db', 'operational');
function sslOptions(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1'
      ? false
      : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: sslOptions(connectionString)
});

try {
  await pool.query(`
    create table if not exists _network_outreach_migrations (
      file_name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await fs.readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const fileName of files) {
    const existing = await pool.query(
      'select 1 from _network_outreach_migrations where file_name = $1',
      [fileName]
    );
    if (existing.rowCount) continue;

    const sql = await fs.readFile(path.join(directory, fileName), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into _network_outreach_migrations (file_name) values ($1)',
        [fileName]
      );
      await client.query('commit');
      console.log(`[migrate] operational: applied ${fileName}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

console.log('[migrate] Network Outreach operational migrations are applied.');

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

type Target = {
  name: 'operational' | 'research';
  connectionString?: string;
  directory: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');

const targets: Target[] = [
  {
    name: 'operational',
    connectionString: process.env.DATABASE_URL?.trim(),
    directory: path.join(repoRoot, 'db', 'operational')
  },
  {
    name: 'research',
    connectionString: process.env.DATABASE_URL_2?.trim(),
    directory: path.join(repoRoot, 'db', 'research')
  }
];

async function migrateTarget(target: Target) {
  if (!target.connectionString) {
    throw new Error(`${target.name} database connection string is not configured.`);
  }

  const pool = new Pool({
    connectionString: target.connectionString,
    max: 1,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(`
      create table if not exists _network_outreach_migrations (
        file_name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await fs.readdir(target.directory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const fileName of files) {
      const existing = await pool.query(
        'select 1 from _network_outreach_migrations where file_name = $1',
        [fileName]
      );
      if (existing.rowCount) continue;

      const sql = await fs.readFile(path.join(target.directory, fileName), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into _network_outreach_migrations (file_name) values ($1)',
          [fileName]
        );
        await client.query('commit');
        console.log(`[migrate] ${target.name}: applied ${fileName}`);
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
}

for (const target of targets) {
  await migrateTarget(target);
}

console.log('[migrate] all configured Network Outreach migrations are applied.');

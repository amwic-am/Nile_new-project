import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from '../config.js';
import { getMigrationDatabase, type Database } from './index.js';
import { logger } from '../lib/logger.js';

const migrationsDir = path.join(repoRoot, 'server', 'migrations');

export async function runMigrations(db: Database): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);

  const applied = new Set(
    (await db.query<{ version: string }>('select version from schema_migrations')).rows.map(
      (row) => row.version,
    ),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [file]);
    });
    newlyApplied.push(file);
    logger.info(`Applied migration ${file}`);
  }

  if (!newlyApplied.length) logger.info('Database schema is up to date');
  return newlyApplied;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const db = await getMigrationDatabase();
  try {
    await runMigrations(db);
  } finally {
    await db.close();
  }
}

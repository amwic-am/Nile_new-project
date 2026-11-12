/**
 * Destroys the development database and rebuilds it from migrations plus demo
 * seed data. Only works with throw-away local data (NODE_ENV must not be
 * production) and refuses to run against an external DATABASE_URL unless
 * ALLOW_DB_RESET=1 is set explicitly.
 */
import { config } from '../config.js';
import { closeDatabase, getDatabase } from './index.js';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';
import { logger } from '../lib/logger.js';

if (config.isProd) {
  logger.error('Refusing to reset the database in production');
  process.exit(1);
}

if (config.databaseUrl && process.env.ALLOW_DB_RESET !== '1') {
  logger.error(
    'DATABASE_URL is configured. Set ALLOW_DB_RESET=1 if you really want to erase that database.',
  );
  process.exit(1);
}

const db = await getDatabase();
try {
  logger.warn('Dropping app and public schemas for a clean development reset');
  await db.exec('drop schema if exists app cascade');
  await db.exec('drop schema if exists public cascade');
  await db.exec('create schema public');
  await runMigrations(db);
  await seedDatabase(db);
  logger.info('Development database reset complete');
} catch (error) {
  logger.error('Database reset failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

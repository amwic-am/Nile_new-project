import fs from 'node:fs';
import { closeDatabase, getDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';

export default async function setup() {
  const dataDir = process.env.PGLITE_DATA_DIR;
  if (!dataDir) throw new Error('PGLITE_DATA_DIR is required for the test database');

  const db = await getDatabase();
  try {
    await runMigrations(db);
    const seeded = await seedDatabase(db);
    if (!seeded) throw new Error('Demo seed did not run for the test database');
  } finally {
    await closeDatabase();
  }

  return async () => {
    await closeDatabase();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}

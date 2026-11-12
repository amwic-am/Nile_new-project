import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nilemart-test-'));

const testEnv = {
  NODE_ENV: 'test',
  PGLITE_DATA_DIR: dataDir,
  DATABASE_URL: '',
  DATABASE_SSL: 'disable',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:4000',
  AUTH_PROVIDER: 'local',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SEED_DEMO_DATA: 'true',
  SEED_ADMIN_PASSWORD: 'NileMart#2026',
  SESSION_COOKIE_NAME: 'nm_session',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  CHAPA_SECRET_KEY: '',
  CHAPA_WEBHOOK_SECRET: '',
  PAYMENTS_COD_ENABLED: 'true',
};

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    env: testEnv,
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});

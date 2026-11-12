import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');

dotenv.config({ path: path.join(repoRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
dotenv.config({ path: path.join(repoRoot, 'server', '.env'), quiet: true });

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined, fallback = ''): string {
  return value && value.trim() ? value.trim() : fallback;
}

const env = str(process.env.NODE_ENV, 'development');
const isProd = env === 'production';
const appUrl = str(process.env.APP_URL, 'http://localhost:5173').replace(/\/+$/, '');
const apiUrl = str(process.env.API_URL, 'http://localhost:4000').replace(/\/+$/, '');
const databaseUrl = str(process.env.DATABASE_URL);
const directDatabaseUrl = str(process.env.DIRECT_URL);
const databaseSsl = str(process.env.DATABASE_SSL, databaseUrl ? 'require' : 'disable');
const databaseSslCa = str(process.env.DATABASE_SSL_CA);
const supabaseUrl = str(process.env.SUPABASE_URL).replace(/\/+$/, '');
const supabaseAnonKey = str(process.env.SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = str(process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const authProvider = str(process.env.AUTH_PROVIDER, supabaseEnvConfigured ? 'supabase' : 'local');

if (authProvider !== 'local' && authProvider !== 'supabase') {
  throw new Error('AUTH_PROVIDER must be "local" or "supabase".');
}
if (authProvider === 'supabase' && !supabaseEnvConfigured) {
  throw new Error('AUTH_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY.');
}
if (isProd && authProvider === 'local') {
  throw new Error('Supabase Auth is required in production. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
}

export const config = {
  env,
  isProd,
  isDev: !isProd,
  port: num(process.env.PORT, 4000),
  appUrl,
  apiUrl,
  databaseUrl,
  directDatabaseUrl,
  databaseSsl,
  databaseSslRejectUnauthorized: databaseSsl !== 'no-verify',
  databaseSslCa: databaseSslCa ? path.resolve(repoRoot, databaseSslCa) : '',
  authProvider,
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    storageBucket: str(process.env.SUPABASE_STORAGE_BUCKET, 'product-images'),
  },
  pgliteDataDir: path.resolve(repoRoot, 'server', str(process.env.PGLITE_DATA_DIR, './data')),
  sessionCookieName: str(process.env.SESSION_COOKIE_NAME, 'nm_session'),
  cartCookieName: 'nm_cart',
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 30),
  requireVerifiedEmail: bool(process.env.REQUIRE_VERIFIED_EMAIL, false),
  reservationMinutes: num(process.env.RESERVATION_MINUTES, 120),
  rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  uploadsDir: path.resolve(repoRoot, str(process.env.UPLOADS_DIR, 'server/uploads')),
  clientDist: path.resolve(repoRoot, 'frontend', 'dist'),
  maxUploadBytes: 5 * 1024 * 1024,
  seedDemoData: bool(process.env.SEED_DEMO_DATA, !isProd),
  seedAdminPassword: str(process.env.SEED_ADMIN_PASSWORD, 'NileMart#2026'),
  smtp: {
    host: str(process.env.SMTP_HOST),
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: str(process.env.SMTP_USER),
    pass: str(process.env.SMTP_PASS, ''),
    from: str(process.env.MAIL_FROM, 'Nile Mart <no-reply@nilemart.et>'),
    orderInbox: str(process.env.ORDER_NOTIFICATION_EMAIL, 'orders@nilemart.et'),
  },
  chapa: {
    secretKey: str(process.env.CHAPA_SECRET_KEY),
    webhookSecret: str(process.env.CHAPA_WEBHOOK_SECRET),
    baseUrl: str(process.env.CHAPA_BASE_URL, 'https://api.chapa.co/v1'),
  },
  telebirr: {
    appId: str(process.env.TELEBIRR_APP_ID),
    appKey: str(process.env.TELEBIRR_APP_KEY),
  },
  mpesa: {
    consumerKey: str(process.env.MPESA_CONSUMER_KEY),
    consumerSecret: str(process.env.MPESA_CONSUMER_SECRET),
    shortcode: str(process.env.MPESA_SHORTCODE),
    passkey: str(process.env.MPESA_PASSKEY),
  },
  paypal: {
    clientId: str(process.env.PAYPAL_CLIENT_ID),
    clientSecret: str(process.env.PAYPAL_CLIENT_SECRET),
    mode: str(process.env.PAYPAL_MODE, 'sandbox'),
  },
  eps: {
    merchantId: str(process.env.EPS_MERCHANT_ID),
    merchantKey: str(process.env.EPS_MERCHANT_KEY),
  },
  payments: {
    codEnabled: bool(process.env.PAYMENTS_COD_ENABLED, true),
  },
} as const;

export const smtpConfigured = Boolean(config.smtp.host && config.smtp.from);
export const chapaConfigured = Boolean(config.chapa.secretKey);
export const supabaseConfigured = config.authProvider === 'supabase';
export const supabaseAdminConfigured = Boolean(config.supabase.url && config.supabase.serviceRoleKey);

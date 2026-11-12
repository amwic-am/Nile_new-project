/**
 * Creates or promotes the first super administrator.
 *
 * Demo seeding is refused in production, so this is the supported way to get
 * the first admin account into a fresh deployment (or to reset a locked-out
 * admin password).
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='...' npm run db:create-admin
 *
 * With Supabase Auth the account is created (or updated) through the Admin API
 * and the application profile is linked to `auth.users.id`. The local provider
 * hashes the password with scrypt. Neither path logs or stores plain text.
 * Safe to re-run: an existing profile is promoted and its password reset.
 */
import { config, supabaseAdminConfigured } from '../config.js';
import { hashPassword } from '../lib/password.js';
import { logger } from '../lib/logger.js';
import { adminCreateUser, adminFindUserByEmail, adminUpdateUser } from '../lib/supabase.js';
import { closeDatabase, getDatabase, type Database } from './index.js';
import { runMigrations } from './migrate.js';

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const fullName = (process.env.ADMIN_NAME ?? 'Store administrator').trim();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  logger.error('Set ADMIN_EMAIL to a valid email address');
  process.exit(1);
}
if (password.length < 12) {
  logger.error('Set ADMIN_PASSWORD to at least 12 characters');
  process.exit(1);
}
if (config.isProd && password === 'NileMart#2026') {
  logger.error('Refusing to create a production admin with the development seed password');
  process.exit(1);
}

async function createSupabaseAdmin(db: Database) {
  if (!supabaseAdminConfigured) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to create an admin with Supabase Auth.');
  }

  const existingUser = await adminFindUserByEmail(email);
  const user = existingUser
    ? await adminUpdateUser(existingUser.id, { password, emailConfirm: true })
    : await adminCreateUser({
        email,
        password,
        emailConfirm: true,
        metadata: { full_name: fullName },
      });

  if (!user?.id) throw new Error('Supabase did not return the admin account.');

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>('select id from profiles where id = $1', [
      user.id,
    ]);
    if (existing.rows[0]) {
      await tx.query(
        `update profiles
            set email = $2,
                full_name = case when $3 <> '' then $3 else full_name end,
                status = 'active',
                email_verified_at = coalesce(email_verified_at, now()),
                updated_at = now()
          where id = $1`,
        [user.id, email, fullName],
      );
    } else {
      const byEmail = await tx.query<{ id: string }>(
        'select id from profiles where lower(email) = $1',
        [email],
      );
      if (byEmail.rows[0]) {
        throw new Error(
          'A profile with this email is linked to a different sign-in identity. Remove or migrate it first.',
        );
      }
      await tx.query(
        `insert into profiles (id, email, full_name, status, email_verified_at)
         values ($1, $2, $3, 'active', now())`,
        [user.id, email, fullName],
      );
    }
    await tx.query(
      `insert into user_roles (profile_id, role_key)
       values ($1, 'super_admin')
       on conflict do nothing`,
      [user.id],
    );
    return { profileId: user.id, created: !existing.rows[0] };
  });

  logger.info(result.created ? 'Super administrator created' : 'Super administrator updated', {
    email,
    profileId: result.profileId,
    provider: 'supabase',
  });
}

async function createLocalAdmin(db: Database) {
  const passwordHash = await hashPassword(password);
  const result = await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      'select id from profiles where lower(email) = $1',
      [email],
    );
    let profileId = existing.rows[0]?.id;
    if (profileId) {
      await tx.query(
        `update profiles
            set full_name = case when $2 <> '' then $2 else full_name end,
                status = 'active',
                updated_at = now()
          where id = $1`,
        [profileId, fullName],
      );
    } else {
      const inserted = await tx.query<{ id: string }>(
        `insert into profiles (email, full_name, status)
         values ($1, $2, 'active')
         returning id`,
        [email, fullName],
      );
      profileId = inserted.rows[0].id;
    }
    await tx.query(
      `insert into auth_credentials (profile_id, password_hash, email_verified_at)
       values ($1, $2, now())
       on conflict (profile_id) do update
         set password_hash = excluded.password_hash,
             email_verified_at = now(),
             failed_attempts = 0,
             locked_until = null`,
      [profileId, passwordHash],
    );
    await tx.query(
      `insert into user_roles (profile_id, role_key)
       values ($1, 'super_admin')
       on conflict do nothing`,
      [profileId],
    );
    return { profileId, created: !existing.rows[0] };
  });
  logger.info(result.created ? 'Super administrator created' : 'Super administrator updated', {
    email,
    profileId: result.profileId,
    provider: 'local',
  });
}

try {
  const db = await getDatabase();
  try {
    await runMigrations(db);
    if (config.authProvider === 'supabase') {
      await createSupabaseAdmin(db);
    } else {
      await createLocalAdmin(db);
    }
  } finally {
    await closeDatabase();
  }
} catch (error) {
  logger.error('Could not create the super administrator', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

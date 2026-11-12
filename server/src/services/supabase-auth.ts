import { config } from '../config.js';
import { AppError, badRequest, conflict, forbidden, tooMany, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  adminCreateUser,
  signInWithPassword,
  signUpWithPassword,
  SupabaseRequestError,
  type SupabaseSession,
  type SupabaseUser,
  updatePasswordWithToken,
  verifyEmailToken,
} from '../lib/supabase.js';
import type { Database, Sql } from '../db/index.js';

export type SupabaseProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: 'active' | 'suspended' | 'deleted';
  email_verified_at: string | null;
  created_at: string;
};

export type ProfileFallback = {
  fullName?: string;
  phone?: string | null;
  marketingOptIn?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed ? trimmed : null;
}

export function mapSupabaseError(error: unknown): AppError | null {
  if (!(error instanceof SupabaseRequestError)) return null;
  const code = (error.code || '').toLowerCase();

  switch (code) {
    case 'invalid_credentials':
    case 'user_not_found':
      return unauthorized('Invalid email or password');
    case 'email_not_confirmed':
      return forbidden('Verify your email address before signing in. Check your inbox for the confirmation link.');
    case 'user_banned':
      return forbidden('This account is suspended. Please contact customer support.');
    case 'user_already_exists':
    case 'email_exists':
    case 'user_already_registered':
      return conflict('An account with this email already exists. Try signing in instead.');
    case 'weak_password':
      return badRequest(error.message || 'Choose a stronger password.');
    case 'same_password':
      return badRequest('Choose a password you have not used before');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return tooMany('Too many requests. Please wait a moment and try again.');
    case 'otp_expired':
    case 'token_expired':
    case 'expired_token':
    case 'token_not_found':
      return badRequest('This link is invalid or has expired. Request a new one.');
    case 'email_address_invalid':
    case 'validation_failed':
      return badRequest(error.message || 'Check the details you entered and try again.');
    default:
      break;
  }

  logger.warn('Supabase auth request failed', {
    status: error.status,
    code: error.code,
    message: error.message,
  });

  if (error.status >= 500) {
    return new AppError(502, 'auth_unavailable', 'Sign-in is temporarily unavailable. Please try again.');
  }
  if (error.status === 429) {
    return tooMany(error.message);
  }
  return new AppError(
    error.status >= 400 && error.status < 500 ? error.status : 502,
    error.code || 'auth_failed',
    error.message,
  );
}

function rethrowSupabase(error: unknown): never {
  const mapped = mapSupabaseError(error);
  if (mapped) throw mapped;
  throw error;
}

/**
 * Mirrors the Supabase Auth identity into the application profile. The database
 * trigger covers normal signups; this keeps profiles correct for accounts created
 * before the trigger existed, for API-created users, and for metadata changes.
 */
export async function syncSupabaseProfile(
  db: Database,
  user: SupabaseUser,
  fallback: ProfileFallback = {},
): Promise<SupabaseProfile> {
  if (!UUID.test(user.id)) {
    throw new AppError(502, 'auth_mapping_failed', 'The authentication provider returned an invalid account.');
  }

  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) {
    throw badRequest('This account has no email address. Add one in Supabase Auth before signing in.');
  }

  const metadata = user.user_metadata ?? {};
  const fullName = text(metadata.full_name) || text(fallback.fullName) || email.split('@')[0];
  const phone = nullableText(metadata.phone) ?? nullableText(fallback.phone);
  const marketingOptIn =
    typeof metadata.marketing_opt_in === 'boolean'
      ? metadata.marketing_opt_in
      : Boolean(fallback.marketingOptIn);
  const verifiedAt = user.email_confirmed_at ?? user.confirmed_at ?? null;

  try {
    return await db.transaction(async (tx: Sql) => {
      const existing = await tx.query<SupabaseProfile>(
        `select id, email, full_name, phone, status, email_verified_at, created_at
           from profiles where id = $1`,
        [user.id],
      );
      if (!existing.rows[0]) {
        const byEmail = await tx.query<{ id: string }>(
          `select id from profiles where lower(email) = $1 limit 1`,
          [email],
        );
        if (byEmail.rows[0]) {
          throw conflict(
            'An account with this email already exists with a different sign-in method. Contact support to link it.',
          );
        }
        await tx.query(
          `insert into profiles (id, email, full_name, phone, email_verified_at, marketing_opt_in)
           values ($1, $2, $3, $4, $5, $6)`,
          [user.id, email, fullName, phone, verifiedAt, marketingOptIn],
        );
      } else {
        await tx.query(
          `update profiles
              set email = $2,
                  full_name = coalesce(nullif($3, ''), full_name),
                  phone = coalesce($4, phone),
                  email_verified_at = coalesce(email_verified_at, $5),
                  marketing_opt_in = marketing_opt_in or $6,
                  updated_at = now()
            where id = $1`,
          [user.id, email, fullName, phone, verifiedAt, marketingOptIn],
        );
      }

      await tx.query(
        `insert into user_roles (profile_id, role_key) values ($1, 'customer')
         on conflict do nothing`,
        [user.id],
      );

      if (marketingOptIn) {
        await tx.query(
          `insert into newsletter_subscribers (email, source, confirmed_at)
           values ($1, 'registration', now())
           on conflict (lower(email)) do update set status = 'subscribed'`,
          [email],
        );
      }

      const result = await tx.query<SupabaseProfile>(
        `select id, email, full_name, phone, status, email_verified_at, created_at
           from profiles where id = $1`,
        [user.id],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Profile sync returned no row');
      return row;
    });
  } catch (error) {
    if (mapSupabaseError(error)) throw error;
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === '23505'
    ) {
      throw conflict('An account with this email already exists. Try signing in instead.');
    }
    throw error;
  }
}

export type SupabaseRegistration = {
  user: SupabaseUser;
  session: SupabaseSession | null;
};

export async function registerWithSupabase(
  email: string,
  password: string,
  data: { full_name: string; phone?: string | null; marketing_opt_in?: boolean },
): Promise<SupabaseRegistration> {
  try {
    const result = await signUpWithPassword(email, password, data, `${config.appUrl}/verify-email`);
    const user = result.user;
    if (!user?.id) {
      throw new AppError(502, 'auth_mapping_failed', 'The authentication provider did not create the account.');
    }
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      throw conflict('An account with this email already exists. Try signing in instead.');
    }
    return { user, session: result.session ?? null };
  } catch (error) {
    rethrowSupabase(error);
  }
}

export async function loginWithSupabase(email: string, password: string): Promise<SupabaseSession> {
  try {
    return await signInWithPassword(email, password);
  } catch (error) {
    rethrowSupabase(error);
  }
}

export async function verifySupabaseEmail(
  tokenHash: string,
  type: 'signup' | 'email' | 'recovery' = 'signup',
): Promise<SupabaseSession> {
  try {
    return await verifyEmailToken(tokenHash, type);
  } catch (error) {
    rethrowSupabase(error);
  }
}

export async function resetSupabasePassword(
  tokenHash: string,
  password: string,
): Promise<SupabaseSession> {
  const session = await verifySupabaseEmail(tokenHash, 'recovery');
  try {
    await updatePasswordWithToken(session.access_token, password);
  } catch (error) {
    rethrowSupabase(error);
  }
  return session;
}

export async function changeSupabasePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (currentPassword === newPassword) {
    throw badRequest('Choose a password you have not used before');
  }
  const session = await loginWithSupabase(email, currentPassword);
  try {
    await updatePasswordWithToken(session.access_token, newPassword);
  } catch (error) {
    rethrowSupabase(error);
  }
}

export async function createSupabaseUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
): Promise<SupabaseUser> {
  try {
    return await adminCreateUser({ email, password, emailConfirm: true, metadata });
  } catch (error) {
    rethrowSupabase(error);
  }
}

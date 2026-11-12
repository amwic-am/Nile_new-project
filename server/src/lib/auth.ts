import type { NextFunction, Request, Response } from 'express';
import { randomToken, sha256 } from './tokens.js';
import { unauthorized, forbidden } from './errors.js';
import { config } from '../config.js';
import type { Database } from '../db/index.js';
import { logger } from './logger.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: 'active' | 'suspended' | 'deleted';
  emailVerified: boolean;
  roles: string[];
  perms: string[];
  isStaff: boolean;
  marketingOptIn: boolean;
  notificationPrefs: Record<string, boolean>;
  createdAt: string;
}

export function cookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd,
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(config.sessionCookieName, token, cookieOptions(config.sessionTtlDays * 24 * 60 * 60 * 1000));
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.sessionCookieName, cookieOptions());
}

export function setGuestCartCookie(res: Response, token: string) {
  res.cookie(config.cartCookieName, token, cookieOptions(60 * 24 * 60 * 60 * 1000));
}

export function clearGuestCartCookie(res: Response) {
  res.clearCookie(config.cartCookieName, cookieOptions());
}

type SessionRow = {
  session_id: string;
  last_seen_at: string;
  profile_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: AuthUser['status'];
  email_verified_at: string | null;
  marketing_opt_in: boolean;
  notification_prefs: Record<string, boolean>;
  created_at: string;
};

export async function loadSessionUser(
  db: Database,
  token: string,
): Promise<{ user: AuthUser; sessionId: string; lastSeenAt: string } | null> {
  const tokenHash = sha256(token);
  const sessionResult = await db.query<SessionRow>(
    `select s.id as session_id, s.last_seen_at, p.id as profile_id, p.email, p.full_name, p.phone,
            p.avatar_url, p.status, coalesce(c.email_verified_at, p.email_verified_at) as email_verified_at,
            p.marketing_opt_in, p.notification_prefs, p.created_at
       from sessions s
       join profiles p on p.id = s.profile_id
       left join auth_credentials c on c.profile_id = p.id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
      limit 1`,
    [tokenHash],
  );
  const row = sessionResult.rows[0];
  if (!row) return null;
  if (row.status !== 'active') return null;

  const access = await db.query<{ roles: string; perms: string; is_staff: boolean }>(
    `select coalesce(json_agg(distinct ur.role_key), '[]'::json)::text as roles,
            coalesce(json_agg(distinct rp.permission_key)
                     filter (where rp.permission_key is not null), '[]'::json)::text as perms,
            coalesce(bool_or(r.is_staff), false) as is_staff
       from user_roles ur
       join roles r on r.key = ur.role_key
       left join role_permissions rp on rp.role_key = ur.role_key
      where ur.profile_id = $1`,
    [row.profile_id],
  );

  const accessRow = access.rows[0];
  const user: AuthUser = {
    id: row.profile_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    roles: JSON.parse(accessRow?.roles ?? '[]') as string[],
    perms: JSON.parse(accessRow?.perms ?? '[]') as string[],
    isStaff: Boolean(accessRow?.is_staff),
    marketingOptIn: row.marketing_opt_in,
    notificationPrefs: row.notification_prefs ?? {},
    createdAt: row.created_at,
  };

  return { user, sessionId: row.session_id, lastSeenAt: row.last_seen_at };
}

export async function attachAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const guest = req.cookies?.[config.cartCookieName];
    if (typeof guest === 'string' && /^[a-f0-9]{64}$/.test(guest)) {
      req.guestToken = guest;
    } else {
      req.guestToken = null;
    }

    const token = req.cookies?.[config.sessionCookieName];
    if (typeof token === 'string' && token.length >= 20) {
      const db = await import('../db/index.js').then((mod) => mod.getDatabase());
      const session = await loadSessionUser(db, token);
      if (session) {
        req.auth = session.user;
        req.sessionId = session.sessionId;
        const stale = Date.now() - new Date(session.lastSeenAt).getTime() > 10 * 60 * 1000;
        if (stale) {
          db.query(
            `update sessions set last_seen_at = now() where id = $1`,
            [session.sessionId],
          ).catch((error) => logger.debug('Failed to update session heartbeat', { error: String(error) }));
        }
      } else {
        clearSessionCookie(res);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isStaff) return next(forbidden('Staff access required'));
  next();
}

export function requirePerm(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!req.auth.perms.includes(permission)) {
      return next(forbidden(`Missing permission: ${permission}`));
    }
    next();
  };
}

export function hasPerm(req: Request, permission: string): boolean {
  return Boolean(req.auth?.perms.includes(permission));
}

export async function createSession(
  db: Database,
  profileId: string,
  req: Request,
  res: Response,
): Promise<string> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.query('delete from sessions where profile_id = $1 and expires_at < now()', [profileId]);
  await db.query(
    `insert into sessions (profile_id, token_hash, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [profileId, sha256(token), req.get('user-agent')?.slice(0, 500) ?? '', req.ip ?? '', expiresAt],
  );
  setSessionCookie(res, token);
  return token;
}

export async function revokeSession(db: Database, sessionId: string, profileId: string) {
  const result = await db.query(
    `update sessions set revoked_at = now()
      where id = $1 and profile_id = $2 and revoked_at is null`,
    [sessionId, profileId],
  );
  return result.rowCount > 0;
}

export async function revokeAllSessions(
  db: Database,
  profileId: string,
  exceptSessionId?: string,
) {
  await db.query(
    `update sessions set revoked_at = now()
      where profile_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2::uuid)`,
    [profileId, exceptSessionId ?? null],
  );
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    roles: user.roles,
    permissions: user.perms,
    isStaff: user.isStaff,
    marketingOptIn: user.marketingOptIn,
    notificationPrefs: user.notificationPrefs,
    createdAt: user.createdAt,
  };
}

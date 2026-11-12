import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { config, smtpConfigured } from '../config.js';
import { getDatabase, isUniqueViolation } from '../db/index.js';
import {
  clearGuestCartCookie,
  clearSessionCookie,
  createSession,
  loadSessionUser,
  publicUser,
  requireAuth,
  revokeAllSessions,
  revokeSession,
} from '../lib/auth.js';
import { passwordChangedEmail, passwordResetEmail, verificationEmail, welcomeEmail } from '../lib/emails.js';
import { badRequest, conflict, forbidden, notFound, tooMany, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../lib/mailer.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { asyncRoute } from '../lib/request.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { requestPasswordReset, resendSignupEmail } from '../lib/supabase.js';
import { parse } from '../lib/validation.js';
import { emailLimiter, loginLimiter, registerLimiter } from '../middleware/security.js';
import { mergeGuestCart } from '../services/cart-merge.js';
import {
  changeSupabasePassword,
  loginWithSupabase,
  mapSupabaseError,
  registerWithSupabase,
  resetSupabasePassword,
  syncSupabaseProfile,
  verifySupabaseEmail,
} from '../services/supabase-auth.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  email: z.string().trim().min(5).max(254).email('Enter a valid email address'),
  password: passwordSchema,
  phone: z.string().trim().max(20).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().min(5).max(254),
  password: z.string().min(1).max(128),
});

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
};

let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword('nile-mart-timing-safety-2026');
  return dummyHash;
}

async function issueEmailToken(
  db: Awaited<ReturnType<typeof getDatabase>>,
  profileId: string,
  type: 'verify_email' | 'reset_password',
  ttlMs: number,
  payload?: Record<string, unknown>,
) {
  const token = randomToken(32);
  await db.query(
    `update auth_tokens set used_at = now()
      where profile_id = $1 and type = $2 and used_at is null`,
    [profileId, type],
  );
  await db.query(
    `insert into auth_tokens (profile_id, type, token_hash, payload, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [profileId, type, sha256(token), payload ? JSON.stringify(payload) : null, new Date(Date.now() + ttlMs)],
  );
  return token;
}

async function startSession(
  db: Awaited<ReturnType<typeof getDatabase>>,
  profileId: string,
  req: Request,
  res: Response,
) {
  const sessionToken = await createSession(db, profileId, req, res);
  if (req.guestToken) {
    await mergeGuestCart(db, profileId, req.guestToken);
    clearGuestCartCookie(res);
  }
  const session = await loadSessionUser(db, sessionToken);
  if (!session) throw new Error('Session could not be created');
  return session.user;
}

router.get('/me', (req, res) => {
  res.json({ user: req.auth ? publicUser(req.auth) : null });
});

router.post(
  '/register',
  registerLimiter,
  asyncRoute(async (req, res) => {
    const body = parse(registerSchema, req.body);
    const email = body.email.toLowerCase();
    const db = await getDatabase();

    if (config.authProvider === 'supabase') {
      const registration = await registerWithSupabase(email, body.password, {
        full_name: body.fullName,
        phone: body.phone || null,
        marketing_opt_in: Boolean(body.marketingOptIn),
      });
      const profile = await syncSupabaseProfile(db, registration.user, {
        fullName: body.fullName,
        phone: body.phone,
        marketingOptIn: Boolean(body.marketingOptIn),
      });
      if (profile.status !== 'active') {
        throw forbidden('This account is suspended. Please contact customer support.');
      }

      if (!registration.session) {
        res.status(201).json({
          user: null,
          requiresVerification: true,
          email: profile.email,
          message: 'Check your inbox for a confirmation link to finish creating your account.',
        });
        return;
      }

      await db.query(`update profiles set last_login_at = now() where id = $1`, [profile.id]);
      const user = await startSession(db, profile.id, req, res);
      res.status(201).json({ user: publicUser(user) });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    let profile: ProfileRow;
    try {
      profile = await db.transaction(async (tx) => {
        const inserted = await tx.query<ProfileRow>(
          `insert into profiles (email, full_name, phone, marketing_opt_in)
           values ($1, $2, $3, $4)
           returning id, email, full_name, phone, created_at`,
          [email, body.fullName, body.phone || null, Boolean(body.marketingOptIn)],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error('Profile insert returned no row');
        await tx.query(
          `insert into auth_credentials (profile_id, password_hash) values ($1, $2)`,
          [row.id, passwordHash],
        );
        await tx.query(`insert into user_roles (profile_id, role_key) values ($1, 'customer')`, [row.id]);
        if (body.marketingOptIn) {
          await tx.query(
            `insert into newsletter_subscribers (email, source, confirmed_at)
             values ($1, 'registration', now())
             on conflict (lower(email)) do update set status = 'subscribed'`,
            [email],
          );
        }
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict('An account with this email already exists. Try signing in instead.');
      }
      throw error;
    }

    const verifyToken = await issueEmailToken(db, profile.id, 'verify_email', 24 * 60 * 60 * 1000);
    const verifyUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    void sendEmail(db, {
      to: email,
      ...verificationEmail(profile.full_name, verifyUrl),
    });

    const sessionToken = await createSession(db, profile.id, req, res);
    if (req.guestToken) {
      await mergeGuestCart(db, profile.id, req.guestToken);
      clearGuestCartCookie(res);
    }
    const session = await loadSessionUser(db, sessionToken);
    if (!session) throw new Error('Session could not be created');

    res.status(201).json({
      user: publicUser(session.user),
      ...(config.isDev && !smtpConfigured ? { devVerifyUrl: verifyUrl } : {}),
    });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncRoute(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLowerCase();
    const db = await getDatabase();

    if (config.authProvider === 'supabase') {
      const providerSession = await loginWithSupabase(email, body.password);
      const profile = await syncSupabaseProfile(db, providerSession.user);
      if (profile.status !== 'active') {
        throw forbidden('This account is suspended. Please contact customer support.');
      }
      await db.query(`update profiles set last_login_at = now() where id = $1`, [profile.id]);
      const user = await startSession(db, profile.id, req, res);
      res.json({ user: publicUser(user) });
      return;
    }

    const result = await db.query<{
      profile_id: string;
      email: string;
      full_name: string;
      status: string;
      password_hash: string;
      failed_attempts: number;
      locked_until: string | null;
    }>(
      `select p.id as profile_id, p.email, p.full_name, p.status,
              c.password_hash, c.failed_attempts, c.locked_until
         from profiles p
         join auth_credentials c on c.profile_id = p.id
        where lower(p.email) = $1
        limit 1`,
      [email],
    );

    const row = result.rows[0];
    if (!row) {
      await verifyPassword(body.password, await getDummyHash());
      throw unauthorized('Invalid email or password');
    }

    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      throw tooMany('Too many failed attempts. Please try again in 15 minutes.');
    }

    const valid = await verifyPassword(body.password, row.password_hash);
    if (!valid) {
      const attempts = row.failed_attempts + 1;
      await db.query(
        `update auth_credentials
            set failed_attempts = $2,
                locked_until = case when $2 >= 8 then now() + interval '15 minutes' else null end
          where profile_id = $1`,
        [row.profile_id, attempts],
      );
      throw unauthorized('Invalid email or password');
    }

    if (row.status !== 'active') {
      throw forbidden('This account is suspended. Please contact customer support.');
    }

    await db.query(
      `update auth_credentials set failed_attempts = 0, locked_until = null where profile_id = $1`,
      [row.profile_id],
    );
    await db.query(`update profiles set last_login_at = now() where id = $1`, [row.profile_id]);

    const sessionToken = await createSession(db, row.profile_id, req, res);
    if (req.guestToken) {
      await mergeGuestCart(db, row.profile_id, req.guestToken);
      clearGuestCartCookie(res);
    }
    const session = await loadSessionUser(db, sessionToken);
    if (!session) throw new Error('Session could not be created');

    res.json({ user: publicUser(session.user) });
  }),
);

router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    if (req.auth && req.sessionId) {
      const db = await getDatabase();
      await revokeSession(db, req.sessionId, req.auth.id);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

router.post(
  '/logout-all',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = await getDatabase();
    await revokeAllSessions(db, req.auth!.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

router.post(
  '/verify-email',
  emailLimiter,
  asyncRoute(async (req, res) => {
    if (config.authProvider === 'supabase') {
      const providerBody = parse(
        z
          .object({
            token: z.string().min(10).max(400).optional(),
            tokenHash: z.string().min(10).max(400).optional(),
            type: z.enum(['signup', 'email']).optional(),
          })
          .refine((value) => Boolean(value.token || value.tokenHash), {
            message: 'A verification token is required',
          }),
        req.body,
      );
      const db = await getDatabase();
      const tokenHash = providerBody.tokenHash ?? providerBody.token!;
      const providerSession = await verifySupabaseEmail(tokenHash, providerBody.type ?? 'signup');
      const profile = await syncSupabaseProfile(db, providerSession.user);
      if (profile.status !== 'active') {
        throw forbidden('This account is suspended. Please contact customer support.');
      }
      await db.query(
        `update profiles set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
          where id = $1`,
        [profile.id],
      );

      const alreadyWelcomed = await db.query<{ exists: boolean }>(
        `select exists (
           select 1 from notifications
            where profile_id = $1 and type = 'account' and title = 'Email verified'
         ) as exists`,
        [profile.id],
      );
      if (!alreadyWelcomed.rows[0]?.exists) {
        void sendEmail(db, { to: profile.email, ...welcomeEmail(profile.full_name) });
        await db.query(
          `insert into notifications (profile_id, type, title, body, link)
           values ($1, 'account', 'Email verified', 'Your email address has been confirmed.', '/account')`,
          [profile.id],
        );
      }

      const user = req.auth && req.auth.id === profile.id
        ? { ...req.auth, emailVerified: true }
        : await startSession(db, profile.id, req, res);
      res.json({ verified: true, user: publicUser(user) });
      return;
    }

    const body = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const db = await getDatabase();
    const tokenHash = sha256(body.token);

    const outcome = await db.transaction(async (tx) => {
      const tokenResult = await tx.query<{ id: string; profile_id: string }>(
        `select id, profile_id from auth_tokens
          where token_hash = $1 and type = 'verify_email' and used_at is null and expires_at > now()
          for update`,
        [tokenHash],
      );
      const token = tokenResult.rows[0];
      if (!token) return null;

      await tx.query(`update auth_tokens set used_at = now() where id = $1`, [token.id]);
      const credentials = await tx.query<{ email_verified_at: string | null }>(
        `update auth_credentials
            set email_verified_at = coalesce(email_verified_at, now())
          where profile_id = $1
          returning email_verified_at`,
        [token.profile_id],
      );
      const profile = await tx.query<{ email: string; full_name: string }>(
        `select email, full_name from profiles where id = $1`,
        [token.profile_id],
      );
      return {
        profileId: token.profile_id,
        email: profile.rows[0]?.email ?? '',
        fullName: profile.rows[0]?.full_name ?? '',
        firstVerification: Boolean(credentials.rows[0]?.email_verified_at),
      };
    });

    if (!outcome) {
      throw badRequest('This verification link is invalid or has expired. Request a new one.');
    }

    if (outcome.email) {
      void sendEmail(db, { to: outcome.email, ...welcomeEmail(outcome.fullName) });
      await db.query(
        `insert into notifications (profile_id, type, title, body, link)
         values ($1, 'account', 'Email verified', 'Your email address has been confirmed.', '/account')`,
        [outcome.profileId],
      );
    }

    const me = req.auth?.id === outcome.profileId ? publicUser({ ...req.auth, emailVerified: true }) : null;
    res.json({ verified: true, user: me });
  }),
);

router.post(
  '/resend-verification',
  emailLimiter,
  asyncRoute(async (req, res) => {
    if (config.authProvider === 'supabase') {
      const body = parse(z.object({ email: z.string().trim().min(5).max(254).optional() }), req.body);
      if (req.auth?.emailVerified) {
        res.json({ sent: false, verified: true });
        return;
      }
      const email = req.auth?.email ?? (body.email ? body.email.toLowerCase() : '');
      if (!email) {
        res.json({ sent: false, message: 'Enter the email address you registered with.' });
        return;
      }
      try {
        await resendSignupEmail(email, `${config.appUrl}/verify-email`);
      } catch (error) {
        const mapped = mapSupabaseError(error);
        if (mapped && mapped.status === 429) throw mapped;
        logger.warn('Supabase verification resend failed', { error: String(error) });
      }
      res.json({ sent: true });
      return;
    }

    const body = parse(z.object({ email: z.string().trim().min(5).max(254).optional() }), req.body);
    const db = await getDatabase();
    let profileId: string | null = req.auth?.id ?? null;
    let email = req.auth?.email ?? '';
    let name = req.auth?.fullName ?? '';
    let alreadyVerified = req.auth?.emailVerified ?? false;

    if (!profileId && body.email) {
      const result = await db.query<{
        id: string;
        email: string;
        full_name: string;
        email_verified_at: string | null;
      }>(
        `select p.id, p.email, p.full_name, c.email_verified_at
           from profiles p join auth_credentials c on c.profile_id = p.id
          where lower(p.email) = $1`,
        [body.email.toLowerCase()],
      );
      const found = result.rows[0];
      if (found) {
        profileId = found.id;
        email = found.email;
        name = found.full_name;
        alreadyVerified = Boolean(found.email_verified_at);
      }
    }

    if (!profileId) {
      res.json({ sent: true });
      return;
    }
    if (alreadyVerified) {
      res.json({ sent: false, verified: true });
      return;
    }

    const token = await issueEmailToken(db, profileId, 'verify_email', 24 * 60 * 60 * 1000);
    const verifyUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    void sendEmail(db, { to: email, ...verificationEmail(name, verifyUrl) });

    res.json({
      sent: true,
      ...(config.isDev && !smtpConfigured ? { devVerifyUrl: verifyUrl } : {}),
    });
  }),
);

router.post(
  '/forgot-password',
  emailLimiter,
  asyncRoute(async (req, res) => {
    if (config.authProvider === 'supabase') {
      const body = parse(z.object({ email: z.string().trim().min(5).max(254).email() }), req.body);
      try {
        await requestPasswordReset(body.email.toLowerCase(), `${config.appUrl}/reset-password`);
      } catch (error) {
        const mapped = mapSupabaseError(error);
        if (mapped && mapped.status === 429) throw mapped;
        logger.warn('Supabase password recovery request failed', { error: String(error) });
      }
      res.json({
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
      return;
    }

    const body = parse(z.object({ email: z.string().trim().min(5).max(254) }), req.body);
    const email = body.email.toLowerCase();
    const db = await getDatabase();
    const result = await db.query<{ id: string; email: string; full_name: string }>(
      `select id, email, full_name from profiles where lower(email) = $1 and status = 'active'`,
      [email],
    );
    const profile = result.rows[0];

    let devResetUrl: string | undefined;
    if (profile) {
      const token = await issueEmailToken(db, profile.id, 'reset_password', 60 * 60 * 1000);
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      void sendEmail(db, { to: profile.email, ...passwordResetEmail(profile.full_name, resetUrl) });
      if (config.isDev && !smtpConfigured) devResetUrl = resetUrl;
    }

    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
      ...(devResetUrl ? { devResetUrl } : {}),
    });
  }),
);

router.post(
  '/reset-password',
  emailLimiter,
  asyncRoute(async (req, res) => {
    if (config.authProvider === 'supabase') {
      const body = parse(
        z
          .object({
            token: z.string().min(10).max(400).optional(),
            tokenHash: z.string().min(10).max(400).optional(),
            password: passwordSchema,
          })
          .refine((value) => Boolean(value.token || value.tokenHash), {
            message: 'A password reset token is required',
          }),
        req.body,
      );
      const db = await getDatabase();
      const tokenHash = body.tokenHash ?? body.token!;
      const providerSession = await resetSupabasePassword(tokenHash, body.password);
      const profile = await syncSupabaseProfile(db, providerSession.user);
      await db.query(
        `update profiles set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
          where id = $1`,
        [profile.id],
      );
      await db.query(
        `update sessions set revoked_at = now() where profile_id = $1 and revoked_at is null`,
        [profile.id],
      );
      clearSessionCookie(res);
      void sendEmail(db, { to: profile.email, ...passwordChangedEmail(profile.full_name) });
      res.json({ message: 'Your password has been updated. Sign in with your new password.' });
      return;
    }

    const body = parse(
      z.object({ token: z.string().min(10).max(200), password: passwordSchema }),
      req.body,
    );
    const db = await getDatabase();
    const tokenHash = sha256(body.token);
    const newHash = await hashPassword(body.password);

    const profile = await db.transaction(async (tx) => {
      const tokenResult = await tx.query<{ id: string; profile_id: string }>(
        `select id, profile_id from auth_tokens
          where token_hash = $1 and type = 'reset_password' and used_at is null and expires_at > now()
          for update`,
        [tokenHash],
      );
      const token = tokenResult.rows[0];
      if (!token) throw badRequest('This password reset link is invalid or has expired.');

      await tx.query(`update auth_tokens set used_at = now() where id = $1`, [token.id]);
      await tx.query(
        `update auth_tokens set used_at = now()
          where profile_id = $1 and type = 'reset_password' and used_at is null`,
        [token.profile_id],
      );
      await tx.query(
        `update auth_credentials
            set password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = null
          where profile_id = $1`,
        [token.profile_id, newHash],
      );
      await tx.query(
        `update sessions set revoked_at = now() where profile_id = $1 and revoked_at is null`,
        [token.profile_id],
      );
      const result = await tx.query<{ email: string; full_name: string }>(
        `select email, full_name from profiles where id = $1`,
        [token.profile_id],
      );
      return result.rows[0];
    });

    clearSessionCookie(res);
    if (profile?.email) {
      void sendEmail(db, { to: profile.email, ...passwordChangedEmail(profile.full_name) });
    }
    res.json({ message: 'Your password has been updated. Sign in with your new password.' });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }),
      req.body,
    );
    const db = await getDatabase();

    if (config.authProvider === 'supabase') {
      await changeSupabasePassword(req.auth!.email, body.currentPassword, body.newPassword);
      await revokeAllSessions(db, req.auth!.id, req.sessionId);
      void sendEmail(db, { to: req.auth!.email, ...passwordChangedEmail(req.auth!.fullName) });
      res.json({ message: 'Password updated. Other devices have been signed out.' });
      return;
    }

    const result = await db.query<{ password_hash: string }>(
      `select password_hash from auth_credentials where profile_id = $1`,
      [req.auth!.id],
    );
    const stored = result.rows[0]?.password_hash;
    if (!stored || !(await verifyPassword(body.currentPassword, stored))) {
      throw badRequest('Your current password is not correct');
    }
    if (body.currentPassword === body.newPassword) {
      throw badRequest('Choose a password you have not used before');
    }

    const newHash = await hashPassword(body.newPassword);
    await db.query(
      `update auth_credentials
          set password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = null
        where profile_id = $1`,
      [req.auth!.id, newHash],
    );
    await revokeAllSessions(db, req.auth!.id, req.sessionId);
    void sendEmail(db, { to: req.auth!.email, ...passwordChangedEmail(req.auth!.fullName) });

    res.json({ message: 'Password updated. Other devices have been signed out.' });
  }),
);

router.get(
  '/sessions',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = await getDatabase();
    const result = await db.query<{
      id: string;
      user_agent: string;
      ip: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
    }>(
      `select id, coalesce(user_agent, '') as user_agent, coalesce(ip, '') as ip,
              created_at, last_seen_at, expires_at
         from sessions
        where profile_id = $1 and revoked_at is null and expires_at > now()
        order by last_seen_at desc`,
      [req.auth!.id],
    );
    res.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        userAgent: row.user_agent,
        ip: row.ip,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
        current: row.id === req.sessionId,
      })),
    });
  }),
);

router.delete(
  '/sessions/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const db = await getDatabase();
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Session not found');
    const revoked = await revokeSession(db, id, req.auth!.id);
    if (!revoked) throw notFound('Session not found');
    if (id === req.sessionId) clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

export default router;

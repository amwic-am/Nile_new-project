import { config } from '../config.js';

export type SupabaseUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  identities?: unknown[] | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: SupabaseUser;
};

export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
  admin?: boolean;
};

function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function authRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = config.supabase.url;
  const key = options.admin ? config.supabase.serviceRoleKey : config.supabase.anonKey;

  if (!base) {
    throw new SupabaseRequestError(503, 'not_configured', 'Supabase is not configured.');
  }
  if (!key) {
    throw new SupabaseRequestError(
      503,
      'not_configured',
      options.admin
        ? 'SUPABASE_SERVICE_ROLE_KEY is required for this operation.'
        : 'SUPABASE_ANON_KEY is required for this operation.',
    );
  }

  const headers: Record<string, string> = {
    apikey: key,
    'content-type': 'application/json',
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  const data = text ? parseJson(text) : {};

  if (!response.ok) {
    const code = String(
      data.error_code ?? data.code ?? data.error ?? `http_${response.status}`,
    );
    const message = String(
      data.msg ??
        data.message ??
        data.error_description ??
        data.error ??
        `Supabase request failed (${response.status}).`,
    );
    throw new SupabaseRequestError(response.status, code, message);
  }

  return data as T;
}

export function signUpWithPassword(
  email: string,
  password: string,
  data: { full_name: string; phone?: string | null; marketing_opt_in?: boolean },
  redirectTo?: string,
) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  return authRequest<{ user: SupabaseUser; session: SupabaseSession | null }>(`/auth/v1/signup${query}`, {
    method: 'POST',
    body: { email, password, data },
  });
}

export function signInWithPassword(email: string, password: string) {
  return authRequest<SupabaseSession>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
}

export function resendSignupEmail(email: string, redirectTo?: string) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  return authRequest<Record<string, never>>(`/auth/v1/resend${query}`, {
    method: 'POST',
    body: { type: 'signup', email },
  });
}

export function verifyEmailToken(
  tokenHash: string,
  type: 'signup' | 'email' | 'recovery' | 'email_change',
) {
  return authRequest<SupabaseSession>('/auth/v1/verify', {
    method: 'POST',
    body: { type, token_hash: tokenHash },
  });
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return authRequest<Record<string, never>>('/auth/v1/recover', {
    method: 'POST',
    body: { email, redirect_to: redirectTo },
  });
}

export function updatePasswordWithToken(accessToken: string, password: string) {
  return authRequest<SupabaseUser>('/auth/v1/user', {
    method: 'PUT',
    token: accessToken,
    body: { password },
  });
}

type AdminUserInput = {
  email: string;
  password: string;
  emailConfirm: boolean;
  metadata?: Record<string, unknown>;
};

export function adminCreateUser(input: AdminUserInput) {
  return authRequest<SupabaseUser>('/auth/v1/admin/users', {
    method: 'POST',
    admin: true,
    body: {
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm,
      user_metadata: input.metadata ?? {},
    },
  });
}

export function adminUpdateUser(
  id: string,
  input: { password?: string; emailConfirm?: boolean },
) {
  return authRequest<SupabaseUser>(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    admin: true,
    body: {
      ...(input.password ? { password: input.password } : {}),
      ...(input.emailConfirm ? { email_confirm: true } : {}),
    },
  });
}

export async function adminFindUserByEmail(email: string): Promise<SupabaseUser | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const result = await authRequest<{ users?: SupabaseUser[] }>(
      `/auth/v1/admin/users?page=${page}&per_page=200`,
      { admin: true },
    );
    const users = result.users ?? [];
    const match = users.find((user) => (user.email ?? '').toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

import { describe, expect, it } from 'vitest';
import { SupabaseRequestError } from '../src/lib/supabase.js';
import { hasValidImageSignature } from '../src/lib/storage.js';
import { mapSupabaseError } from '../src/services/supabase-auth.js';

function supabaseError(status: number, code: string, message = 'provider message') {
  return new SupabaseRequestError(status, code, message);
}

describe('mapSupabaseError', () => {
  it('ignores errors that are not Supabase responses', () => {
    expect(mapSupabaseError(new Error('boom'))).toBeNull();
  });

  it('maps bad credentials to a generic 401', () => {
    for (const code of ['invalid_credentials', 'user_not_found']) {
      const mapped = mapSupabaseError(supabaseError(400, code));
      expect(mapped?.status).toBe(401);
      expect(mapped?.message).toBe('Invalid email or password');
    }
  });

  it('requires email confirmation', () => {
    const mapped = mapSupabaseError(supabaseError(400, 'email_not_confirmed'));
    expect(mapped?.status).toBe(403);
    expect(mapped?.message).toContain('Verify your email');
  });

  it('reports suspended accounts', () => {
    const mapped = mapSupabaseError(supabaseError(400, 'user_banned'));
    expect(mapped?.status).toBe(403);
  });

  it('maps duplicate signups to 409', () => {
    for (const code of ['user_already_exists', 'email_exists', 'user_already_registered']) {
      expect(mapSupabaseError(supabaseError(422, code))?.status).toBe(409);
    }
  });

  it('passes through weak-password messages', () => {
    const mapped = mapSupabaseError(supabaseError(422, 'weak_password', 'Password is too weak'));
    expect(mapped?.status).toBe(400);
    expect(mapped?.message).toBe('Password is too weak');
  });

  it('rejects reusing the current password', () => {
    const mapped = mapSupabaseError(supabaseError(422, 'same_password'));
    expect(mapped?.status).toBe(400);
    expect(mapped?.message).toContain('not used before');
  });

  it('maps rate limits by code and by status', () => {
    expect(mapSupabaseError(supabaseError(429, 'over_email_send_rate_limit'))?.status).toBe(429);
    expect(mapSupabaseError(supabaseError(429, 'over_request_rate_limit'))?.status).toBe(429);
    expect(mapSupabaseError(supabaseError(429, 'unexpected_code'))?.status).toBe(429);
  });

  it('maps expired or unknown tokens to a retryable 400', () => {
    for (const code of ['otp_expired', 'token_expired', 'expired_token', 'token_not_found']) {
      const mapped = mapSupabaseError(supabaseError(403, code));
      expect(mapped?.status).toBe(400);
      expect(mapped?.message).toContain('invalid or has expired');
    }
  });

  it('turns provider outages into 502', () => {
    expect(mapSupabaseError(supabaseError(500, 'unexpected_failure'))?.status).toBe(502);
    expect(mapSupabaseError(supabaseError(503, 'not_configured'))?.status).toBe(502);
  });

  it('preserves an unknown client-error status and code', () => {
    const mapped = mapSupabaseError(supabaseError(422, 'custom_validation', 'Nope'));
    expect(mapped?.status).toBe(422);
    expect(mapped?.code).toBe('custom_validation');
    expect(mapped?.message).toBe('Nope');
  });
});

describe('hasValidImageSignature', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(6)]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif')]);

  it('accepts real image headers', () => {
    expect(hasValidImageSignature(png, 'image/png')).toBe(true);
    expect(hasValidImageSignature(jpeg, 'image/jpeg')).toBe(true);
    expect(hasValidImageSignature(gif, 'image/gif')).toBe(true);
    expect(hasValidImageSignature(webp, 'image/webp')).toBe(true);
    expect(hasValidImageSignature(avif, 'image/avif')).toBe(true);
  });

  it('rejects a mismatched type or a truncated file', () => {
    expect(hasValidImageSignature(png, 'image/jpeg')).toBe(false);
    expect(hasValidImageSignature(Buffer.from('<svg></svg>'), 'image/png')).toBe(false);
    expect(hasValidImageSignature(Buffer.from([0x89]), 'image/png')).toBe(false);
    expect(hasValidImageSignature(png, 'image/svg+xml')).toBe(false);
  });
});

import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function uuid(): string {
  return randomUUID();
}

export function guestToken(): string {
  return randomBytes(32).toString('hex');
}

export function isValidGuestToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function orderNumber(): string {
  // Caller combines this with a database sequence value.
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  return stamp;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

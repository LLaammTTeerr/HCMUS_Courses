// Password hashing, session tokens and login rate limiting. No third-party crypto: node:crypto only.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCb(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key))));

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 32, saltLength: 16 };
export const SESSION_COOKIE = 'session';
export const SESSION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `scrypt$N$r$p$salt$hash`, all base64 — the parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltLength);
  const key = await scrypt(password, salt, SCRYPT.keyLength, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Secret handed to the client; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const sessionExpiry = (from = new Date()): string => new Date(from.getTime() + SESSION_DAYS * MS_PER_DAY).toISOString();

/** A readable invite code: 4 groups of 4 unambiguous characters. */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Temporary password for an admin reset: readable, still 12 random characters. */
export function newTemporaryPassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  return [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join('');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearedSessionCookie = (secure: boolean): string =>
  [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0', ...(secure ? ['Secure'] : [])].join('; ');

/** Sliding-window limiter for login and registration attempts (per process). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly limit = 10, private readonly windowMs = 5 * 60 * 1000) {}

  /** Records a failure; true when the caller is now over the limit. */
  fail(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length > this.limit;
  }

  blocked(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length === 0) this.hits.delete(key);
    else this.hits.set(key, recent);
    return recent.length > this.limit;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 10;

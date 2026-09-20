import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie, hashPassword, newInviteCode, newTemporaryPassword, newToken, parseCookies,
  RateLimiter, sessionCookie, sha256, verifyPassword,
} from './auth';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterx', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts every hash and records its parameters', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(a.split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('rejects a stored value in an unknown format', async () => {
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
  });
});

describe('tokens and codes', () => {
  it('generates unique session tokens and hashes them one way', () => {
    const tokens = new Set(Array.from({ length: 50 }, newToken));
    expect(tokens.size).toBe(50);
    const token = newToken();
    expect(sha256(token)).toHaveLength(64);
    expect(sha256(token)).not.toContain(token);
  });

  it('generates readable invite codes and temporary passwords', () => {
    expect(newInviteCode()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(newTemporaryPassword()).toMatch(/^[a-z2-9]{12}$/);
    expect(new Set(Array.from({ length: 20 }, newInviteCode)).size).toBe(20);
  });
});

describe('cookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('session=abc; other=1')).toEqual({ session: 'abc', other: '1' });
    expect(parseCookies(undefined)).toEqual({});
  });

  it('sets HttpOnly SameSite cookies, Secure only over https', () => {
    expect(sessionCookie('abc', false)).toBe('session=abc; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000');
    expect(sessionCookie('abc', true)).toContain('; Secure');
    expect(clearedSessionCookie(false)).toContain('Max-Age=0');
  });
});

describe('RateLimiter', () => {
  it('blocks after the limit and forgets old attempts', () => {
    const limiter = new RateLimiter(3, 1000);
    const now = 10_000;
    expect(limiter.fail('ip', now)).toBe(false);
    expect(limiter.fail('ip', now)).toBe(false);
    expect(limiter.fail('ip', now)).toBe(false);
    expect(limiter.fail('ip', now)).toBe(true);
    expect(limiter.blocked('ip', now)).toBe(true);
    expect(limiter.blocked('ip', now + 1500)).toBe(false);
    expect(limiter.blocked('other', now)).toBe(false);
  });

  it('forgets a key after a success', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.fail('ip');
    limiter.fail('ip');
    expect(limiter.blocked('ip')).toBe(true);
    limiter.reset('ip');
    expect(limiter.blocked('ip')).toBe(false);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { sha256 } from './auth';
import { openDb, type Db } from './db';
import { createUsers } from './users';

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
let users: ReturnType<typeof createUsers>;
let adminCookie: string;

const call = (method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cookieFrom = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

async function invite(note = 'for a classmate'): Promise<string> {
  const res = await call('POST', '/admin/invites', { note }, adminCookie);
  return (await res.json()).code as string;
}

async function register(username: string, code: string, password = 'password-1234') {
  const res = await call('POST', '/auth/register', { username, displayName: username, password, inviteCode: code });
  return { res, cookie: cookieFrom(res) };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'accounts-test-'));
  db = openDb(join(dir, 'progress.db'));
  users = createUsers(db);
  await users.create({ id: 1, username: 'owner', displayName: 'Owner', password: 'password-1234', isAdmin: true });
  adminCookie = `session=${users.startSession(1)}`;
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('registration', () => {
  it('needs a valid invite code and uses it up', async () => {
    const code = await invite();
    const first = await register('mai', code);
    expect(first.res.status).toBe(201);
    expect(await first.res.json()).toMatchObject({ user: { username: 'mai', isAdmin: false } });
    expect(first.cookie).toMatch(/^session=/);
    expect(first.res.headers.get('set-cookie')).toContain('HttpOnly');
    expect(first.res.headers.get('set-cookie')).not.toContain('Secure');   // plain http in tests

    const second = await register('linh', code);
    expect(second.res.status).toBe(400);
    expect((await second.res.json()).error).toMatch(/invite/i);
  });

  it('rejects an unknown code, a taken username and a weak password', async () => {
    expect((await register('mai', 'NOPE-NOPE-NOPE-NOPE')).res.status).toBe(400);
    const code = await invite();
    await register('mai', code);
    const again = await register('MAI', await invite());
    expect(again.res.status).toBe(400);
    expect((await again.res.json()).error).toMatch(/taken/i);
    const short = await call('POST', '/auth/register', { username: 'bo', displayName: '', password: 'short', inviteCode: await invite() });
    expect(short.status).toBe(400);
  });

  it('gives a new account its own empty record starting at semester 1', async () => {
    const { cookie } = await register('mai', await invite());
    const record = await (await call('GET', '/record', undefined, cookie)).json();
    expect(record.attempts).toEqual([]);
    expect(record.profile.currentSemester).toBe(1);
  });
});

describe('login and sessions', () => {
  it('signs in with the right password only', async () => {
    const ok = await call('POST', '/auth/login', { username: 'owner', password: 'password-1234' });
    expect(ok.status).toBe(200);
    expect(cookieFrom(ok)).toMatch(/^session=/);
    const bad = await call('POST', '/auth/login', { username: 'owner', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect((await call('POST', '/auth/login', { username: 'ghost', password: 'password-1234' })).status).toBe(401);
  });

  it('reports the signed-in user and forgets them after logout', async () => {
    const cookie = cookieFrom(await call('POST', '/auth/login', { username: 'owner', password: 'password-1234' }));
    expect(await (await call('GET', '/auth/me', undefined, cookie)).json()).toMatchObject({ user: { username: 'owner', isAdmin: true } });
    expect((await call('POST', '/auth/logout', undefined, cookie)).status).toBe(204);
    expect((await call('GET', '/auth/me', undefined, cookie)).status).toBe(401);
    expect((await call('GET', '/record', undefined, cookie)).status).toBe(401);
  });

  it('refuses an expired session', async () => {
    const token = users.startSession(1);
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token_hash = ?").run(sha256(token));
    expect((await call('GET', '/auth/me', undefined, `session=${token}`)).status).toBe(401);
    // The expired row is cleaned up; other sessions of the same user survive.
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(sha256(token))).toEqual({ n: 0 });
    expect((await call('GET', '/auth/me', undefined, adminCookie)).status).toBe(200);
  });

  it('changes a password and keeps the session', async () => {
    const cookie = cookieFrom(await call('POST', '/auth/login', { username: 'owner', password: 'password-1234' }));
    expect((await call('POST', '/auth/password', { currentPassword: 'nope', newPassword: 'new-password-1' }, cookie)).status).toBe(400);
    expect((await call('POST', '/auth/password', { currentPassword: 'password-1234', newPassword: 'short' }, cookie)).status).toBe(400);
    expect((await call('POST', '/auth/password', { currentPassword: 'password-1234', newPassword: 'new-password-1' }, cookie)).status).toBe(200);
    expect((await call('GET', '/auth/me', undefined, cookie)).status).toBe(200);
    expect((await call('POST', '/auth/login', { username: 'owner', password: 'new-password-1' })).status).toBe(200);
  });
});

describe('isolation between users', () => {
  it('keeps records, profiles, certificates and GPA overrides separate', async () => {
    const mai = (await register('mai', await invite())).cookie;
    await call('POST', '/attempts', { code: 'CS160', semester: 1, status: 'completed', grade10: 9 }, adminCookie);
    await call('PUT', '/english', { type: 'IELTS', score: 7, issued: '2026-01-01' }, adminCookie);
    await call('PUT', '/gpa-overrides/CS160', { counts: false }, adminCookie);
    await call('PUT', '/profile', { currentSemester: 5 }, adminCookie);

    const theirs = await (await call('GET', '/record', undefined, mai)).json();
    expect(theirs.attempts).toEqual([]);
    expect(theirs.english).toBeNull();
    expect(theirs.gpaOverrides).toEqual({});
    expect(theirs.profile.currentSemester).toBe(1);

    const ours = await (await call('GET', '/record', undefined, adminCookie)).json();
    expect(ours.attempts).toHaveLength(1);
    const id = ours.attempts[0].id;
    expect((await call('PATCH', `/attempts/${id}`, { grade10: 3 }, mai)).status).toBe(404);
    expect((await call('DELETE', `/attempts/${id}`, undefined, mai)).status).toBe(404);
    expect((await (await call('GET', '/record', undefined, adminCookie)).json()).attempts[0].grade10).toBe(9);
  });
});

describe('admin', () => {
  it('lets only admins manage invites, users and resets', async () => {
    const mai = (await register('mai', await invite())).cookie;
    for (const [method, path, body] of [['GET', '/admin/users'], ['GET', '/admin/invites'], ['POST', '/admin/invites', {}]] as const) {
      expect((await call(method, path, body, mai)).status, path).toBe(403);
    }
    expect((await call('GET', '/admin/users', undefined, '')).status).toBe(401);
    expect((await (await call('GET', '/admin/users', undefined, adminCookie)).json())).toHaveLength(2);
  });

  it('lists invites without revealing codes and revokes unused ones', async () => {
    const code = await invite('for Mai');
    const invites = await (await call('GET', '/admin/invites', undefined, adminCookie)).json();
    expect(invites[0].note).toBe('for Mai');
    expect(JSON.stringify(invites)).not.toContain(code);
    expect(invites[0].usedBy).toBeNull();

    const afterRevoke = await (await call('DELETE', `/admin/invites/${invites[0].codeHash}`, undefined, adminCookie)).json();
    expect(afterRevoke).toEqual([]);
    expect((await register('mai', code)).res.status).toBe(400);
  });

  it('marks an invite as used by the account that redeemed it', async () => {
    const code = await invite();
    await register('mai', code);
    const invites = await (await call('GET', '/admin/invites', undefined, adminCookie)).json();
    expect(invites[0].usedBy).toBe('mai');
    expect(invites[0].usedAt).toBeTruthy();
  });

  it('resets a password, forces a change and signs the user out everywhere', async () => {
    const { cookie: mai } = await register('mai', await invite());
    const target = users.byUsername('mai')!;
    const reset = await (await call('POST', `/admin/users/${target.id}/reset-password`, {}, adminCookie)).json();
    expect(reset.temporaryPassword).toMatch(/^[a-z2-9]{12}$/);
    expect(reset.user.mustChangePassword).toBe(true);
    expect((await call('GET', '/record', undefined, mai)).status).toBe(401);
    const back = await call('POST', '/auth/login', { username: 'mai', password: reset.temporaryPassword });
    expect(back.status).toBe(200);
    expect((await back.json()).user.mustChangePassword).toBe(true);
    expect((await call('POST', `/admin/users/999/reset-password`, {}, adminCookie)).status).toBe(404);
  });
});

describe('rate limiting', () => {
  it('blocks after ten failed logins from the same address', async () => {
    const headers = { 'x-forwarded-for': '10.0.0.9' };
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/auth/login', { username: 'owner', password: 'wrong' }, undefined, headers)).status).toBe(401);
    }
    expect((await call('POST', '/auth/login', { username: 'owner', password: 'wrong' }, undefined, headers)).status).toBe(401);
    expect((await call('POST', '/auth/login', { username: 'owner', password: 'password-1234' }, undefined, headers)).status).toBe(429);
    // A different address is unaffected.
    expect((await call('POST', '/auth/login', { username: 'owner', password: 'password-1234' }, undefined, { 'x-forwarded-for': '10.0.0.10' })).status).toBe(200);
  });
});

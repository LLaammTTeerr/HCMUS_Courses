import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  attemptInput, attemptPatch, batchDeleteInput, batchInput, englishInput, gpaOverrideInput,
  exportPayload, loginInput, passwordChangeInput, profilePatch, registerInput, inviteInput,
  type AttemptInput,
} from '../shared/api';
import { courseIndex, getProgram, PROGRAM_IDS } from '../shared/programs/index';
import {
  clearedSessionCookie, MIN_PASSWORD_LENGTH, newTemporaryPassword, parseCookies, RateLimiter,
  SESSION_COOKIE, sessionCookie, USERNAME_PATTERN,
} from './auth';
import type { Db } from './db';
import { createRepo } from './repo';
import { createUsers, type User } from './users';

class BadRequest extends Error {}
class Unauthorized extends Error {}
class Forbidden extends Error {}
class TooManyRequests extends Error {}

type Env = { Variables: { user: User; token: string } };

async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new BadRequest('Body must be JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequest(`${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const socketAddress = (c: Context): string | null => {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
};

export interface AppOptions {
  /**
   * Trust `x-forwarded-*` headers. Default: only from a proxy on this machine (Tailscale serve/funnel,
   * the Vite dev proxy), or everywhere when TRUST_PROXY=1. A client that reaches the server directly
   * must not be able to fake its address or pretend the connection was HTTPS.
   */
  trustProxy?: boolean;
}

export function createApp(db: Db, options: AppOptions = {}) {
  const trustForwarded = (c: Context): boolean => {
    if (options.trustProxy !== undefined) return options.trustProxy;
    if (process.env.TRUST_PROXY === '1') return true;
    const address = socketAddress(c);
    return address !== null && LOOPBACK.has(address);
  };

  /** Cookies are marked Secure only when the connection really was HTTPS. */
  const isSecure = (c: Context) =>
    (trustForwarded(c) && c.req.header('x-forwarded-proto') === 'https') ||
    new URL(c.req.url).protocol === 'https:';

  /** Rate-limit bucket per caller, so one person's failed logins cannot lock out everyone else. */
  const clientKey = (c: Context): string => {
    if (trustForwarded(c)) {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
    }
    return socketAddress(c) ?? 'local';
  };

  const repo = createRepo(db);
  const users = createUsers(db);
  const limiter = new RateLimiter();
  const app = new Hono<Env>().basePath('/api');

  const checkCodes = (userId: number, attempts: Pick<AttemptInput, 'code'>[]) => {
    const program = getProgram(repo.getProfile(userId).programId);
    const index = courseIndex(program);
    for (const a of attempts) {
      if (!index.has(a.code)) throw new BadRequest(`Unknown course code ${a.code} for ${program.meta.id}`);
    }
  };
  const idParam = (c: Context) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw new BadRequest('Invalid id');
    return id;
  };

  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    if (err instanceof Unauthorized) return c.json({ error: err.message || 'Sign in required' }, 401);
    if (err instanceof Forbidden) return c.json({ error: err.message || 'Admins only' }, 403);
    if (err instanceof TooManyRequests) return c.json({ error: 'Too many attempts — wait a few minutes' }, 429);
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Attaches the signed-in user, when there is one.
  app.use('*', async (c, next) => {
    const token = parseCookies(c.req.header('cookie'))[SESSION_COOKIE];
    const user = users.userForToken(token);
    if (user) {
      c.set('user', user);
      c.set('token', token);
    }
    await next();
  });

  const requireUser = (c: Context<Env>): User => {
    const user = c.get('user');
    if (!user) throw new Unauthorized('Sign in required');
    return user;
  };
  const requireAdmin = (c: Context<Env>): User => {
    const user = requireUser(c);
    if (!user.isAdmin) throw new Forbidden('Admins only');
    return user;
  };

  // Conservative headers; the app never embeds or is embedded, and sends no cross-site requests.
  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('referrer-policy', 'same-origin');
    if (isSecure(c)) c.header('strict-transport-security', 'max-age=31536000');
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // ---------------------------------------------------------------- auth

  app.post('/auth/register', async (c) => {
    const key = clientKey(c);
    if (limiter.blocked(key)) throw new TooManyRequests();
    const input = await parseBody(c, registerInput);
    const username = input.username.toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequest('Username must be 3–32 characters: lowercase letters, digits, dot, dash or underscore');
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (!users.inviteIsValid(input.inviteCode)) {
      limiter.fail(key);
      throw new BadRequest('That invite code is not valid or has already been used');
    }
    if (users.byUsername(username)) throw new BadRequest('That username is taken');

    const user = await users.create({ username, displayName: input.displayName.trim() || username, password: input.password });
    users.useInvite(input.inviteCode, user.id);
    const token = users.startSession(user.id);
    c.header('set-cookie', sessionCookie(token, isSecure(c)));
    return c.json({ user }, 201);
  });

  app.post('/auth/login', async (c) => {
    const key = clientKey(c);
    if (limiter.blocked(key)) throw new TooManyRequests();
    const { username, password } = await parseBody(c, loginInput);
    const user = await users.authenticate(username, password);
    if (!user) {
      limiter.fail(key);
      throw new Unauthorized('Wrong username or password');
    }
    limiter.reset(key);
    const token = users.startSession(user.id);
    c.header('set-cookie', sessionCookie(token, isSecure(c)));
    return c.json({ user });
  });

  app.get('/auth/me', (c) => c.json({ user: requireUser(c) }));

  app.post('/auth/logout', (c) => {
    const token = c.get('token');
    if (token) users.endSession(token);
    c.header('set-cookie', clearedSessionCookie(isSecure(c)));
    return c.body(null, 204);
  });

  app.post('/auth/password', async (c) => {
    const user = requireUser(c);
    const { currentPassword, newPassword } = await parseBody(c, passwordChangeInput);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (!(await users.checkPassword(user.id, currentPassword))) throw new BadRequest('Current password is wrong');
    await users.setPassword(user.id, newPassword);
    return c.json({ user: users.byId(user.id) });
  });

  // ---------------------------------------------------------------- admin

  app.get('/admin/users', (c) => {
    requireAdmin(c);
    return c.json(users.list());
  });

  app.post('/admin/invites', async (c) => {
    const admin = requireAdmin(c);
    const { note, expiresInDays } = await parseBody(c, inviteInput);
    const code = users.createInvite(admin.id, note?.trim() || null, expiresInDays ?? null);
    return c.json({ code, invites: users.listInvites() }, 201);
  });

  app.get('/admin/invites', (c) => {
    requireAdmin(c);
    return c.json(users.listInvites());
  });

  app.delete('/admin/invites/:hash', (c) => {
    requireAdmin(c);
    const removed = users.revokeInvite(c.req.param('hash'));
    return removed ? c.json(users.listInvites()) : c.json({ error: 'Invite not found or already used' }, 404);
  });

  app.post('/admin/users/:id/reset-password', async (c) => {
    requireAdmin(c);
    const id = idParam(c);
    const target = users.byId(id);
    if (!target) return c.json({ error: 'User not found' }, 404);
    const temporaryPassword = newTemporaryPassword();
    await users.setPassword(id, temporaryPassword, true);
    users.endAllSessions(id);
    return c.json({ temporaryPassword, user: users.byId(id) });
  });

  // ---------------------------------------------------------------- record

  app.get('/record', (c) => c.json(repo.getRecord(requireUser(c).id)));

  app.put('/profile', async (c) => {
    const user = requireUser(c);
    const patch = await parseBody(c, profilePatch);
    if (patch.programId !== undefined && !PROGRAM_IDS.includes(patch.programId)) {
      throw new BadRequest(`Unknown program ${patch.programId}`);
    }
    if (patch.choices !== undefined) {
      const program = getProgram(patch.programId ?? repo.getProfile(user.id).programId);
      for (const [id, value] of Object.entries(patch.choices)) {
        const choice = program.choices.find((x) => x.id === id);
        if (!choice) throw new BadRequest(`Unknown choice ${id} for ${program.meta.id}`);
        if (!choice.options.some((o) => o.id === value)) throw new BadRequest(`Unknown option ${value} for choice ${id}`);
      }
    }
    return c.json(repo.updateProfile(user.id, patch));
  });

  app.post('/attempts', async (c) => {
    const user = requireUser(c);
    const input = await parseBody(c, attemptInput);
    checkCodes(user.id, [input]);
    return c.json(repo.insertAttempts(user.id, [input])[0], 201);
  });

  app.post('/attempts/batch', async (c) => {
    const user = requireUser(c);
    const { attempts } = await parseBody(c, batchInput);
    checkCodes(user.id, attempts);
    return c.json(repo.insertAttempts(user.id, attempts), 201);
  });

  app.patch('/attempts/:id', async (c) => {
    const user = requireUser(c);
    const id = idParam(c);
    const patch = await parseBody(c, attemptPatch);
    const current = repo.getAttempt(user.id, id);
    if (!current) return c.json({ error: 'Attempt not found' }, 404);
    const next = { ...current, ...patch };
    if (next.status === 'completed' && next.grade10 === null) throw new BadRequest('grade10: A completed attempt needs a grade');
    return c.json(repo.updateAttempt(user.id, id, patch));
  });

  app.delete('/attempts/:id', (c) => {
    const user = requireUser(c);
    const removed = repo.deleteAttempts(user.id, [idParam(c)]);
    return removed ? c.body(null, 204) : c.json({ error: 'Attempt not found' }, 404);
  });

  app.post('/attempts/batch-delete', async (c) => {
    const user = requireUser(c);
    const { ids } = await parseBody(c, batchDeleteInput);
    repo.deleteAttempts(user.id, ids);
    return c.body(null, 204);
  });

  app.put('/english', async (c) => c.json(repo.putEnglish(requireUser(c).id, await parseBody(c, englishInput))));

  app.delete('/english', (c) => {
    repo.deleteEnglish(requireUser(c).id);
    return c.body(null, 204);
  });

  app.put('/gpa-overrides/:code', async (c) => {
    const user = requireUser(c);
    const code = c.req.param('code').toUpperCase();
    checkCodes(user.id, [{ code }]);
    const { counts } = await parseBody(c, gpaOverrideInput);
    repo.setGpaOverride(user.id, code, counts);
    return c.json(repo.getGpaOverrides(user.id));
  });

  app.delete('/gpa-overrides/:code', (c) => {
    const user = requireUser(c);
    repo.deleteGpaOverride(user.id, c.req.param('code').toUpperCase());
    return c.json(repo.getGpaOverrides(user.id));
  });

  // ---------------------------------------------------------------- export & restore

  app.get('/export', (c) => {
    const user = requireUser(c);
    const record = repo.getRecord(user.id);
    const payload = {
      format: 'hcmus-progress-export' as const,
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      username: user.username,
      profile: record.profile,
      attempts: record.attempts.map(({ id: _id, ...a }) => a),
      english: record.english,
      gpaOverrides: record.gpaOverrides,
    };
    c.header('content-disposition', `attachment; filename="hcmus-progress-${user.username}-${payload.exportedAt.slice(0, 10)}.json"`);
    return c.json(payload);
  });

  app.get('/export.csv', (c) => {
    const user = requireUser(c);
    const record = repo.getRecord(user.id);
    const program = getProgram(record.profile.programId);
    const index = courseIndex(program);
    const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
    const rows = [
      ['code', 'name', 'credits', 'semester', 'status', 'grade10'].join(','),
      ...record.attempts.map((a) => {
        const course = index.get(a.code);
        return [a.code, escape(course?.nameEn || course?.nameVi || ''), course?.credits ?? '', a.semester, a.status, a.grade10 ?? '']
          .join(',');
      }),
    ];
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', `attachment; filename="hcmus-progress-${user.username}.csv"`);
    return c.body(`${rows.join('\n')}\n`);
  });

  app.post('/import', async (c) => {
    const user = requireUser(c);
    const payload = await parseBody(c, exportPayload);
    if (!PROGRAM_IDS.includes(payload.profile.programId)) {
      throw new BadRequest(`The file is for an unknown program (${payload.profile.programId})`);
    }
    const index = courseIndex(getProgram(payload.profile.programId));
    const unknown = [...new Set([...payload.attempts.map((a) => a.code), ...Object.keys(payload.gpaOverrides)])]
      .filter((code) => !index.has(code));
    if (unknown.length) throw new BadRequest(`The file has courses this program does not define: ${unknown.slice(0, 5).join(', ')}`);
    for (const a of payload.attempts) {
      if (a.status === 'completed' && a.grade10 === null) throw new BadRequest(`${a.code}: a completed attempt needs a grade`);
    }
    return c.json(repo.replaceRecord(user.id, {
      profile: payload.profile,
      attempts: payload.attempts,
      english: payload.english,
      gpaOverrides: payload.gpaOverrides,
    }));
  });

  // Registered last so unknown /api paths get JSON instead of the UI fallback.
  app.all('/*', (c) => c.json({ error: 'Not found' }, 404));

  return app;
}

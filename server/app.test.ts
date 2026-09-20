import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { backupDb, migrate, openDb, type Db } from './db';

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;

const call = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apcs-test-'));
  db = openDb(join(dir, 'progress.db'));
  app = createApp(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('routing', () => {
  it('answers unknown API paths with a JSON 404', async () => {
    const res = await call('GET', '/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect((await call('GET', '/health')).status).toBe(200);
  });
});

describe('record and profile', () => {
  it('returns the default record', async () => {
    const res = await call('GET', '/record');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: { programId: 'apcs-2024', currentSemester: 7, choices: {}, militaryCert: false, thesisGpaThreshold: null },
      attempts: [],
      english: null,
      gpaOverrides: {},
    });
  });

  it('updates the profile partially', async () => {
    const res = await call('PUT', '/profile', { choices: { gradTrack: 'capstone' }, militaryCert: true });
    expect(await res.json()).toMatchObject({ choices: { gradTrack: 'capstone' }, militaryCert: true, currentSemester: 7 });
    expect((await call('PUT', '/profile', { programId: 'nope' })).status).toBe(400);
    expect((await call('PUT', '/profile', { choices: { nope: 'x' } })).status).toBe(400);
    expect((await call('PUT', '/profile', { choices: { gradTrack: 'nope' } })).status).toBe(400);
  });
});

describe('attempts', () => {
  it('creates, updates and deletes an attempt', async () => {
    const created = await (await call('POST', '/attempts', { code: 'cs160', semester: 1, status: 'completed', grade10: 8.5 })).json();
    expect(created).toMatchObject({ code: 'CS160', semester: 1, status: 'completed', grade10: 8.5 });

    const patched = await (await call('PATCH', `/attempts/${created.id}`, { grade10: 9 })).json();
    expect(patched.grade10).toBe(9);

    expect((await call('DELETE', `/attempts/${created.id}`)).status).toBe(204);
    expect((await call('DELETE', `/attempts/${created.id}`)).status).toBe(404);
    expect((await (await call('GET', '/record')).json()).attempts).toEqual([]);
  });

  it('rejects invalid attempts without writing', async () => {
    const cases = [
      { code: 'XX999', semester: 1, status: 'completed', grade10: 8 },
      { code: 'CS160', semester: 0, status: 'planned' },
      { code: 'CS160', semester: 1, status: 'completed', grade10: 11 },
      { code: 'CS160', semester: 1, status: 'completed' },
    ];
    for (const body of cases) {
      const res = await call('POST', '/attempts', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
    expect((await (await call('GET', '/record')).json()).attempts).toEqual([]);
  });

  it('rejects a patch that leaves a completed attempt without a grade', async () => {
    const created = await (await call('POST', '/attempts', { code: 'CS160', semester: 8, status: 'planned' })).json();
    expect((await call('PATCH', `/attempts/${created.id}`, { status: 'completed' })).status).toBe(400);
  });

  it('inserts a batch in one transaction', async () => {
    const ok = await call('POST', '/attempts/batch', {
      attempts: [
        { code: 'CS160', semester: 1, status: 'completed', grade10: 8 },
        { code: 'CS163', semester: 2, status: 'completed', grade10: 7 },
      ],
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toHaveLength(2);

    const bad = await call('POST', '/attempts/batch', {
      attempts: [
        { code: 'CS202', semester: 3, status: 'completed', grade10: 8 },
        { code: 'NOPE1', semester: 3, status: 'completed', grade10: 8 },
      ],
    });
    expect(bad.status).toBe(400);
    const { attempts } = await (await call('GET', '/record')).json();
    expect(attempts.map((a: { code: string }) => a.code)).toEqual(['CS160', 'CS163']);

    const ids = attempts.map((a: { id: number }) => a.id);
    expect((await call('POST', '/attempts/batch-delete', { ids })).status).toBe(204);
    expect((await (await call('GET', '/record')).json()).attempts).toEqual([]);
  });
});

describe('GPA overrides', () => {
  it('sets, replaces and resets a per-course GPA override', async () => {
    expect(await (await call('PUT', '/gpa-overrides/baa00101', { counts: false })).json()).toEqual({ BAA00101: false });
    expect(await (await call('PUT', '/gpa-overrides/BAA00030', { counts: true })).json()).toEqual({ BAA00030: true, BAA00101: false });
    expect(await (await call('PUT', '/gpa-overrides/BAA00101', { counts: true })).json()).toEqual({ BAA00030: true, BAA00101: true });
    expect(await (await call('DELETE', '/gpa-overrides/BAA00030')).json()).toEqual({ BAA00101: true });
    expect((await (await call('GET', '/record')).json()).gpaOverrides).toEqual({ BAA00101: true });
  });

  it('rejects unknown courses and invalid bodies', async () => {
    expect((await call('PUT', '/gpa-overrides/XX999', { counts: false })).status).toBe(400);
    expect((await call('PUT', '/gpa-overrides/CS160', { counts: 'no' })).status).toBe(400);
    expect((await (await call('GET', '/record')).json()).gpaOverrides).toEqual({});
  });
});

describe('english certificate', () => {
  it('stores, replaces and deletes the certificate', async () => {
    await call('PUT', '/english', { type: 'IELTS', score: 6.5, issued: '2026-05-01' });
    const replaced = await (await call('PUT', '/english', { type: 'TOEFL_IBT', score: 90, issued: '2026-06-01', expires: '2028-06-01' })).json();
    expect(replaced).toEqual({ type: 'TOEFL_IBT', score: 90, score2: null, issued: '2026-06-01', expires: '2028-06-01' });
    expect((await call('PUT', '/english', { type: 'TOEFL_ITP_TOEIC_SW', score: 560, issued: '2026-06-01' })).status).toBe(400);
    expect((await call('DELETE', '/english')).status).toBe(204);
    expect((await (await call('GET', '/record')).json()).english).toBeNull();
  });
});

describe('database', () => {
  it('runs migrations idempotently', () => {
    migrate(db);
    migrate(db);
    expect(db.prepare('SELECT version FROM schema_version').get()).toEqual({ version: 3 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM profile').get()).toEqual({ n: 1 });
  });

  it('includes writes still in the write-ahead log in the backup', () => {
    const file = join(dir, 'progress.db');
    db.prepare("INSERT INTO attempts (code, semester, status, grade10) VALUES ('CS160', 1, 'completed', 8)").run();
    const target = backupDb(file, join(dir, 'wal-backups'))!;
    const copy = openDb(target);
    expect(copy.prepare('SELECT COUNT(*) AS n FROM attempts').get()).toEqual({ n: 1 });
    copy.close();
  });

  it('backs up once per day and keeps the newest copies', () => {
    const file = join(dir, 'source.db');
    openDb(file).close();
    const backups = join(dir, 'backups');
    for (let day = 1; day <= 9; day++) backupDb(file, backups, 7, new Date(`2026-09-0${day}T12:00:00Z`));
    backupDb(file, backups, 7, new Date('2026-09-09T18:00:00Z'));
    const files = readdirSync(backups).sort();
    expect(files).toHaveLength(7);
    expect(files[0]).toBe('progress-20260903.db');
    expect(backupDb(join(dir, 'missing.db'), backups)).toBeNull();
  });
});

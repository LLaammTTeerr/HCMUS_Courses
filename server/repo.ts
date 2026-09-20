import type { AttemptInput, AttemptPatch, EnglishInput, ProfilePatch } from '../shared/api';
import type { Attempt, EnglishCert, GpaOverrides, Profile, StudentRecord } from '../shared/domain/types';
import type { Db } from './db';

interface ProfileRow {
  user_id: number;
  program_id: string;
  current_semester: number;
  choices: string;
  military_cert: number;
  thesis_gpa_threshold: number | null;
}

const toProfile = (r: ProfileRow): Profile => ({
  programId: r.program_id,
  currentSemester: r.current_semester,
  choices: parseChoices(r.choices),
  militaryCert: r.military_cert === 1,
  thesisGpaThreshold: r.thesis_gpa_threshold,
});

function parseChoices(raw: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string') as [string, string][],
    );
  } catch {
    return {};
  }
}

export type Repo = ReturnType<typeof createRepo>;

/** All queries are scoped to one user; nothing here can read another user's rows. */
export function createRepo(db: Db) {
  const getAttempt = db.prepare('SELECT id, code, semester, status, grade10 FROM attempts WHERE id = ? AND user_id = ?');
  const insertAttempt = db.prepare(
    'INSERT INTO attempts (user_id, code, semester, status, grade10) VALUES (@userId, @code, @semester, @status, @grade10)',
  );

  const repo = {
    getProfile(userId: number): Profile {
      db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userId);
      return toProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as ProfileRow);
    },

    updateProfile(userId: number, patch: ProfilePatch): Profile {
      const current = repo.getProfile(userId);
      const next = { ...current, ...patch };
      db.prepare(
        `UPDATE profiles SET program_id = ?, current_semester = ?, choices = ?, military_cert = ?,
         thesis_gpa_threshold = ? WHERE user_id = ?`,
      ).run(next.programId, next.currentSemester, JSON.stringify(next.choices), next.militaryCert ? 1 : 0,
        next.thesisGpaThreshold, userId);
      return repo.getProfile(userId);
    },

    listAttempts(userId: number): Attempt[] {
      return db.prepare('SELECT id, code, semester, status, grade10 FROM attempts WHERE user_id = ? ORDER BY semester, id')
        .all(userId) as Attempt[];
    },

    getAttempt(userId: number, id: number): Attempt | undefined {
      return getAttempt.get(id, userId) as Attempt | undefined;
    },

    insertAttempts: db.transaction((userId: number, attempts: AttemptInput[]): Attempt[] =>
      attempts.map((a) => getAttempt.get(insertAttempt.run({ ...a, userId }).lastInsertRowid, userId) as Attempt),
    ),

    updateAttempt(userId: number, id: number, patch: AttemptPatch): Attempt | undefined {
      const current = repo.getAttempt(userId, id);
      if (!current) return undefined;
      const next = { ...current, ...patch };
      db.prepare('UPDATE attempts SET semester = ?, status = ?, grade10 = ? WHERE id = ? AND user_id = ?')
        .run(next.semester, next.status, next.grade10, id, userId);
      return repo.getAttempt(userId, id);
    },

    deleteAttempts: db.transaction((userId: number, ids: number[]): number =>
      ids.reduce((n, id) => n + db.prepare('DELETE FROM attempts WHERE id = ? AND user_id = ?').run(id, userId).changes, 0),
    ),

    getEnglish(userId: number): EnglishCert | null {
      return (db.prepare('SELECT type, score, score2, issued, expires FROM english_certs WHERE user_id = ?')
        .get(userId) as EnglishCert) ?? null;
    },

    putEnglish(userId: number, cert: EnglishInput): EnglishCert {
      db.prepare(
        `INSERT INTO english_certs (user_id, type, score, score2, issued, expires)
         VALUES (@userId, @type, @score, @score2, @issued, @expires)
         ON CONFLICT(user_id) DO UPDATE SET type = @type, score = @score, score2 = @score2, issued = @issued, expires = @expires`,
      ).run({ ...cert, userId });
      return repo.getEnglish(userId)!;
    },

    deleteEnglish(userId: number): void {
      db.prepare('DELETE FROM english_certs WHERE user_id = ?').run(userId);
    },

    getGpaOverrides(userId: number): GpaOverrides {
      const rows = db.prepare('SELECT code, counts FROM gpa_overrides WHERE user_id = ? ORDER BY code')
        .all(userId) as { code: string; counts: number }[];
      return Object.fromEntries(rows.map((r) => [r.code, r.counts === 1]));
    },

    setGpaOverride(userId: number, code: string, counts: boolean): void {
      db.prepare(
        `INSERT INTO gpa_overrides (user_id, code, counts) VALUES (?, ?, ?)
         ON CONFLICT(user_id, code) DO UPDATE SET counts = excluded.counts`,
      ).run(userId, code, counts ? 1 : 0);
    },

    deleteGpaOverride(userId: number, code: string): void {
      db.prepare('DELETE FROM gpa_overrides WHERE user_id = ? AND code = ?').run(userId, code);
    },

    /** Replaces everything this user owns, in one transaction. */
    replaceRecord: db.transaction((userId: number, data: {
      profile: ProfilePatch; attempts: AttemptInput[]; english: EnglishInput | null;
      gpaOverrides: Record<string, boolean>;
    }): StudentRecord => {
      db.prepare('DELETE FROM attempts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM english_certs WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM gpa_overrides WHERE user_id = ?').run(userId);
      repo.updateProfile(userId, data.profile);
      if (data.attempts.length) repo.insertAttempts(userId, data.attempts);
      if (data.english) repo.putEnglish(userId, data.english);
      for (const [code, counts] of Object.entries(data.gpaOverrides)) repo.setGpaOverride(userId, code, counts);
      return repo.getRecord(userId);
    }),

    getRecord(userId: number): StudentRecord {
      return {
        profile: repo.getProfile(userId),
        attempts: repo.listAttempts(userId),
        english: repo.getEnglish(userId),
        gpaOverrides: repo.getGpaOverrides(userId),
      };
    },
  };
  return repo;
}

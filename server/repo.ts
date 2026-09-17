import type { AttemptInput, AttemptPatch, EnglishInput, ProfilePatch } from '../shared/api';
import type { Attempt, EnglishCert, GpaOverrides, Profile, StudentRecord } from '../shared/domain/types';
import type { Db } from './db';

interface ProfileRow {
  program_id: string;
  current_semester: number;
  grad_track: Profile['gradTrack'];
  military_cert: number;
  thesis_gpa_threshold: number | null;
}

const toProfile = (r: ProfileRow): Profile => ({
  programId: r.program_id,
  currentSemester: r.current_semester,
  gradTrack: r.grad_track,
  militaryCert: r.military_cert === 1,
  thesisGpaThreshold: r.thesis_gpa_threshold,
});

export type Repo = ReturnType<typeof createRepo>;

export function createRepo(db: Db) {
  const getAttempt = db.prepare('SELECT id, code, semester, status, grade10 FROM attempts WHERE id = ?');
  const insertAttempt = db.prepare(
    'INSERT INTO attempts (code, semester, status, grade10) VALUES (@code, @semester, @status, @grade10)',
  );

  const repo = {
    getProfile(): Profile {
      return toProfile(db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow);
    },

    updateProfile(patch: ProfilePatch): Profile {
      const current = repo.getProfile();
      const next = { ...current, ...patch };
      db.prepare(
        `UPDATE profile SET program_id = ?, current_semester = ?, grad_track = ?, military_cert = ?,
         thesis_gpa_threshold = ? WHERE id = 1`,
      ).run(next.programId, next.currentSemester, next.gradTrack, next.militaryCert ? 1 : 0, next.thesisGpaThreshold);
      return repo.getProfile();
    },

    listAttempts(): Attempt[] {
      return db.prepare('SELECT id, code, semester, status, grade10 FROM attempts ORDER BY semester, id').all() as Attempt[];
    },

    getAttempt(id: number): Attempt | undefined {
      return getAttempt.get(id) as Attempt | undefined;
    },

    insertAttempts: db.transaction((attempts: AttemptInput[]): Attempt[] =>
      attempts.map((a) => getAttempt.get(insertAttempt.run(a).lastInsertRowid) as Attempt),
    ),

    updateAttempt(id: number, patch: AttemptPatch): Attempt | undefined {
      const current = repo.getAttempt(id);
      if (!current) return undefined;
      const next = { ...current, ...patch };
      db.prepare('UPDATE attempts SET semester = ?, status = ?, grade10 = ? WHERE id = ?')
        .run(next.semester, next.status, next.grade10, id);
      return repo.getAttempt(id);
    },

    deleteAttempts: db.transaction((ids: number[]): number =>
      ids.reduce((n, id) => n + db.prepare('DELETE FROM attempts WHERE id = ?').run(id).changes, 0),
    ),

    getEnglish(): EnglishCert | null {
      return (db.prepare('SELECT type, score, score2, issued, expires FROM english_cert WHERE id = 1').get() as EnglishCert) ?? null;
    },

    putEnglish(cert: EnglishInput): EnglishCert {
      db.prepare(
        `INSERT INTO english_cert (id, type, score, score2, issued, expires) VALUES (1, @type, @score, @score2, @issued, @expires)
         ON CONFLICT(id) DO UPDATE SET type = @type, score = @score, score2 = @score2, issued = @issued, expires = @expires`,
      ).run(cert);
      return repo.getEnglish()!;
    },

    deleteEnglish(): void {
      db.prepare('DELETE FROM english_cert WHERE id = 1').run();
    },

    getGpaOverrides(): GpaOverrides {
      const rows = db.prepare('SELECT code, counts FROM gpa_overrides ORDER BY code').all() as { code: string; counts: number }[];
      return Object.fromEntries(rows.map((r) => [r.code, r.counts === 1]));
    },

    setGpaOverride(code: string, counts: boolean): void {
      db.prepare('INSERT INTO gpa_overrides (code, counts) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET counts = excluded.counts')
        .run(code, counts ? 1 : 0);
    },

    deleteGpaOverride(code: string): void {
      db.prepare('DELETE FROM gpa_overrides WHERE code = ?').run(code);
    },

    getRecord(): StudentRecord {
      return {
        profile: repo.getProfile(),
        attempts: repo.listAttempts(),
        english: repo.getEnglish(),
        gpaOverrides: repo.getGpaOverrides(),
      };
    },
  };
  return repo;
}

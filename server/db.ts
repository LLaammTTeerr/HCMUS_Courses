import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = Database.Database;

// Append-only: never edit a migration that has shipped; add a new one instead.
const MIGRATIONS: string[] = [
  `CREATE TABLE profile (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     program_id TEXT NOT NULL DEFAULT 'apcs-2024',
     current_semester INTEGER NOT NULL DEFAULT 7,
     grad_track TEXT NOT NULL DEFAULT 'undecided' CHECK (grad_track IN ('thesis','capstone','undecided')),
     military_cert INTEGER NOT NULL DEFAULT 0,
     thesis_gpa_threshold REAL
   );
   INSERT INTO profile (id) VALUES (1);
   CREATE TABLE attempts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     code TEXT NOT NULL,
     semester INTEGER NOT NULL CHECK (semester >= 1),
     status TEXT NOT NULL CHECK (status IN ('completed','in-progress','planned')),
     grade10 REAL CHECK (grade10 IS NULL OR (grade10 >= 0 AND grade10 <= 10)),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX attempts_code ON attempts(code);
   CREATE TABLE english_cert (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     type TEXT NOT NULL CHECK (type IN ('IELTS','TOEFL_IBT','TOEFL_ITP_TOEIC_SW')),
     score REAL NOT NULL,
     score2 REAL,
     issued TEXT NOT NULL,
     expires TEXT
   );`,
  // 2 — per-course choice whether a course counts toward the GPA (QC1175 Art. 15.1c).
  `CREATE TABLE gpa_overrides (
     code TEXT PRIMARY KEY,
     counts INTEGER NOT NULL CHECK (counts IN (0, 1))
   );`,
  // 3 — programs define their own choices (graduation track, specialization), so one column is not enough.
  `ALTER TABLE profile ADD COLUMN choices TEXT NOT NULL DEFAULT '{}';
   UPDATE profile SET choices = json_object('gradTrack', grad_track)
     WHERE grad_track IS NOT NULL AND grad_track <> 'undecided';
   ALTER TABLE profile DROP COLUMN grad_track;`,
  // 4 — accounts: every record belongs to a user (docs/superpowers/specs/2026-09-21-accounts-design.md).
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0,
     must_change_password INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     last_login TEXT
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE invites (
     code_hash TEXT PRIMARY KEY,
     created_by INTEGER NOT NULL REFERENCES users(id),
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT,
     used_by INTEGER REFERENCES users(id),
     used_at TEXT
   );
   CREATE TABLE profiles (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     program_id TEXT NOT NULL DEFAULT 'apcs-2024',
     current_semester INTEGER NOT NULL DEFAULT 1,
     choices TEXT NOT NULL DEFAULT '{}',
     military_cert INTEGER NOT NULL DEFAULT 0,
     thesis_gpa_threshold REAL
   );
   INSERT INTO profiles (user_id, program_id, current_semester, choices, military_cert, thesis_gpa_threshold)
     SELECT 1, program_id, current_semester, choices, military_cert, thesis_gpa_threshold FROM profile;
   DROP TABLE profile;
   ALTER TABLE attempts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
   CREATE INDEX attempts_user ON attempts(user_id);
   CREATE TABLE english_certs (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK (type IN ('IELTS','TOEFL_IBT','TOEFL_ITP_TOEIC_SW')),
     score REAL NOT NULL,
     score2 REAL,
     issued TEXT NOT NULL,
     expires TEXT
   );
   INSERT INTO english_certs (user_id, type, score, score2, issued, expires)
     SELECT 1, type, score, score2, issued, expires FROM english_cert;
   DROP TABLE english_cert;
   CREATE TABLE gpa_overrides_v4 (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     code TEXT NOT NULL,
     counts INTEGER NOT NULL CHECK (counts IN (0, 1)),
     PRIMARY KEY (user_id, code)
   );
   INSERT INTO gpa_overrides_v4 (user_id, code, counts) SELECT 1, code, counts FROM gpa_overrides;
   DROP TABLE gpa_overrides;
   ALTER TABLE gpa_overrides_v4 RENAME TO gpa_overrides;`,
];

export function migrate(db: Db): void {
  // Migrations rebuild tables and backfill rows whose owner is inserted afterwards (the bootstrap admin).
  db.pragma('foreign_keys = OFF');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  const apply = db.transaction((sql: string, next: number) => {
    db.exec(sql);
    db.prepare('UPDATE schema_version SET version = ?').run(next);
  });
  while (version < MIGRATIONS.length) {
    apply(MIGRATIONS[version], version + 1);
    version++;
  }
  db.pragma('foreign_keys = ON');
}

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

/** Copies `file` to `dir/progress-YYYYMMDD.db` once per day and keeps the newest `keep` copies. */
export function backupDb(file: string, dir: string, keep = 7, today = new Date()): string | null {
  if (!existsSync(file)) return null;
  mkdirSync(dir, { recursive: true });
  const stamp = today.toISOString().slice(0, 10).replaceAll('-', '');
  const target = join(dir, `progress-${stamp}.db`);
  if (!existsSync(target)) {
    // Fold the write-ahead log into the main file first (it may hold writes after an unclean shutdown).
    const conn = new Database(file);
    conn.pragma('wal_checkpoint(TRUNCATE)');
    conn.close();
    copyFileSync(file, target);
  }
  const backups = readdirSync(dir).filter((f) => /^progress-\d{8}\.db$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) rmSync(join(dir, old));
  return target;
}

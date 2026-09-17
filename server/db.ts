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
];

export function migrate(db: Db): void {
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
  if (!existsSync(target)) copyFileSync(file, target);
  const backups = readdirSync(dir).filter((f) => /^progress-\d{8}\.db$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) rmSync(join(dir, old));
  return target;
}

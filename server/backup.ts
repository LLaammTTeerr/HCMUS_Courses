// Manual/scheduled backup: `npm run backup [target-directory]`.
// Safe to run while the app is running — the write-ahead log is folded in before copying.
import { resolve } from 'node:path';
import { backupDb } from './db';

const root = resolve(import.meta.dirname, '..');
const dbFile = process.env.PROGRESS_DB ?? resolve(root, 'data/progress.db');
const target = process.argv[2] ?? process.env.BACKUP_DIR ?? resolve(root, 'data/backups');
const keep = Number(process.env.BACKUP_KEEP ?? 7);

const copy = backupDb(dbFile, target, keep);
if (!copy) {
  console.error(`No database at ${dbFile} — nothing to back up.`);
  process.exit(1);
}
console.log(`Backed up ${dbFile} → ${copy} (keeping the newest ${keep})`);

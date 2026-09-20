// Users, sessions and invite codes. Only hashes are stored: never a password, never a live token or code.
import {
  hashPassword, newInviteCode, newToken, SESSION_DAYS, sessionExpiry, sha256, verifyPassword,
} from './auth';
import type { Db } from './db';

export interface User {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
  lastLogin?: string | null;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  must_change_password: number;
  created_at: string;
  last_login: string | null;
}

export interface Invite {
  codeHash: string;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedBy: string | null;
  usedAt: string | null;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  isAdmin: r.is_admin === 1,
  mustChangePassword: r.must_change_password === 1,
  createdAt: r.created_at,
  lastLogin: r.last_login,
});

export type Users = ReturnType<typeof createUsers>;

export function createUsers(db: Db) {
  const rowById = db.prepare('SELECT * FROM users WHERE id = ?');
  const rowByName = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');

  const users = {
    count(): number {
      return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    },

    byId(id: number): User | null {
      const row = rowById.get(id) as UserRow | undefined;
      return row ? toUser(row) : null;
    },

    byUsername(username: string): User | null {
      const row = rowByName.get(username) as UserRow | undefined;
      return row ? toUser(row) : null;
    },

    list(): User[] {
      return (db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[]).map(toUser);
    },

    async create(input: {
      username: string; displayName: string; password: string; isAdmin?: boolean;
      mustChangePassword?: boolean; id?: number;
    }): Promise<User> {
      const hash = await hashPassword(input.password);
      const id = db.prepare(
        `INSERT INTO users (id, username, display_name, password_hash, is_admin, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(input.id ?? null, input.username.toLowerCase(), input.displayName, hash,
        input.isAdmin ? 1 : 0, input.mustChangePassword ? 1 : 0).lastInsertRowid as number;
      db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(id);
      return users.byId(id)!;
    },

    /** Returns the user when the password matches, else null. */
    async authenticate(username: string, password: string): Promise<User | null> {
      const row = rowByName.get(username) as UserRow | undefined;
      if (!row) return null;
      if (!(await verifyPassword(password, row.password_hash))) return null;
      db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(row.id);
      return users.byId(row.id);
    },

    async setPassword(id: number, password: string, mustChange = false): Promise<void> {
      const hash = await hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?')
        .run(hash, mustChange ? 1 : 0, id);
    },

    async checkPassword(id: number, password: string): Promise<boolean> {
      const row = rowById.get(id) as UserRow | undefined;
      return !!row && verifyPassword(password, row.password_hash);
    },

    // ---- sessions ----

    /** Creates a session and returns the token to put in the cookie (stored hashed). */
    startSession(userId: number): string {
      const token = newToken();
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(sha256(token), userId, sessionExpiry());
      return token;
    },

    userForToken(token: string | undefined): User | null {
      if (!token) return null;
      const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
        .get(sha256(token)) as { user_id: number; expires_at: string } | undefined;
      if (!row) return null;
      const now = new Date();
      if (row.expires_at <= now.toISOString()) {
        users.endSession(token);
        return null;
      }
      // Sliding window: refresh the expiry once a day of use, so active sessions do not expire mid-term.
      const renewAt = new Date(now.getTime() + (SESSION_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString();
      if (row.expires_at < renewAt) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(sessionExpiry(now), sha256(token));
      }
      return users.byId(row.user_id);
    },

    endSession(token: string): void {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    },

    endAllSessions(userId: number): void {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },

    // ---- invites ----

    /** Creates an invite and returns the code, which is shown once and stored only as a hash. */
    createInvite(createdBy: number, note: string | null, expiresInDays: number | null): string {
      const code = newInviteCode();
      const expiresAt = expiresInDays === null ? null
        : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO invites (code_hash, created_by, note, expires_at) VALUES (?, ?, ?, ?)')
        .run(sha256(code), createdBy, note, expiresAt);
      return code;
    },

    listInvites(): Invite[] {
      return db.prepare(
        `SELECT i.code_hash AS codeHash, i.note, i.created_at AS createdAt, i.expires_at AS expiresAt,
                u.username AS usedBy, i.used_at AS usedAt
         FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC`,
      ).all() as Invite[];
    },

    /** Unused and unexpired? */
    inviteIsValid(code: string): boolean {
      const row = db.prepare('SELECT used_by, expires_at FROM invites WHERE code_hash = ?')
        .get(sha256(code)) as { used_by: number | null; expires_at: string | null } | undefined;
      if (!row || row.used_by !== null) return false;
      return !row.expires_at || row.expires_at > new Date().toISOString();
    },

    useInvite(code: string, userId: number): void {
      db.prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code_hash = ?")
        .run(userId, sha256(code));
    },

    revokeInvite(codeHash: string): boolean {
      return db.prepare('DELETE FROM invites WHERE code_hash = ? AND used_by IS NULL').run(codeHash).changes > 0;
    },
  };
  return users;
}

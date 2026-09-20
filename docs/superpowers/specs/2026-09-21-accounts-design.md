# Accounts (invite-only) — Design Spec

Date: 2026-09-21 · Status: approved (questions answered) · Builds on
`2026-09-20-multi-program-support-design.md`

## 1. Purpose

Let several students use one installation, each with their own record. Sign-up needs an **invite code**
handed out by the admin (the first account). No email server: password recovery is an **admin reset**.

Reachability stays **Tailscale-only** for now, but the implementation must be safe to expose later:
hashed passwords, hashed session tokens, secure-cookie detection, and login rate limiting are in scope.

Out of scope: email, OAuth, per-user program authoring, sharing a record with someone else.

## 2. Data model (migration 4)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,            -- scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
  is_admin INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,            -- sha256 of the cookie value, never the value itself
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,             -- sha256 of the code
  created_by INTEGER NOT NULL REFERENCES users(id),
  note TEXT,                              -- "for Mai", free text
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  used_by INTEGER REFERENCES users(id),
  used_at TEXT
);
```

Existing tables become per-user:

- `profiles(user_id PK, program_id, current_semester, choices, military_cert, thesis_gpa_threshold)` —
  replaces the single-row `profile`; the old row becomes user 1's.
- `attempts`, `english_cert`, `gpa_overrides` gain `user_id NOT NULL DEFAULT 1`; primary keys become
  `(user_id, …)` where they were singletons. Every repository query filters by `user_id`.

**Bootstrap (not a migration):** on start, if `users` is empty, the server creates the admin account:
username from `ADMIN_USER` (default `admin`), password from `ADMIN_PASSWORD` or a generated one printed
once to the server log, `is_admin = 1`, `must_change_password = 1` when generated. That account owns all
pre-existing data (user_id 1).

## 3. Authentication

- **Hashing:** `node:crypto` scrypt, N=16384 r=8 p=1, 16-byte random salt, 32-byte hash, compared with
  `timingSafeEqual`. Format above so parameters can change later.
- **Sessions:** 32 random bytes, base64url, in cookie `session`; the database stores only its SHA-256.
  Lifetime 30 days, extended on use when older than a day. `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` when the request arrived over HTTPS (`x-forwarded-proto` or the request URL).
- **Rate limiting:** in-memory, 10 failed login or register attempts per 5 minutes per IP, then HTTP 429.
  Successful login resets the counter. (In-memory is enough for a single-process app.)
- **CSRF:** `SameSite=Lax` plus JSON-only bodies; no cookie-authenticated form posts exist.
- **Password rules:** at least 10 characters; username 3–32 characters of `[a-z0-9._-]`, case-insensitive
  unique.

## 4. API

Unauthenticated:

| Method | Path | Body → result |
|---|---|---|
| POST | `/api/auth/register` | `{username, displayName, password, inviteCode}` → `{user}` + cookie |
| POST | `/api/auth/login` | `{username, password}` → `{user}` + cookie |
| GET | `/api/auth/me` | `{user}` or 401 |
| POST | `/api/auth/logout` | 204, clears cookie |

Authenticated (401 without a valid session):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/password` | `{currentPassword, newPassword}`; clears `must_change_password`, keeps the session |
| GET/POST/PATCH/DELETE | `/api/record`, `/api/attempts…`, `/api/profile`, `/api/english`, `/api/gpa-overrides…` | always scoped to the session's user |

Admin only (403 otherwise):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users` | id, username, display name, admin flag, created, last login |
| POST | `/api/admin/invites` | `{note?, expiresInDays?}` → `{code}` **shown once** |
| GET | `/api/admin/invites` | list with used/unused state; codes are not recoverable |
| DELETE | `/api/admin/invites/:codeHash` | revoke an unused invite |
| POST | `/api/admin/users/:id/reset-password` | → `{temporaryPassword}`, sets `must_change_password`, drops that user's sessions |

`user` in responses is `{id, username, displayName, isAdmin, mustChangePassword}` — never the hash.

## 5. UI

- **Gate:** the store calls `/api/auth/me`; unauthenticated renders a **Sign in / Register** card
  (register asks for the invite code). No other page renders without a user.
- **Sidebar:** display name, "Change password", "Sign out", and for the admin an "Invites" entry.
- **Invites page (admin):** create a code with an optional note and expiry, show it once with a copy
  button, list outstanding and used invites, revoke unused ones, list users with a reset-password action
  that reveals a temporary password once.
- **Forced change:** when `mustChangePassword` is set, the app shows the change-password form first.
- **Expiry:** any 401 from the API drops back to the sign-in screen without losing typed data.

## 6. Testing

1. **Crypto:** hash/verify round-trip, wrong password fails, format is parseable, two hashes of the same
   password differ.
2. **Migration 4:** applies to a database with existing data, idempotent, the old profile/attempts end up
   owned by user 1, and the bootstrap creates exactly one admin.
3. **Register:** requires a valid, unused, unexpired invite; marks it used; rejects duplicate usernames
   (case-insensitively), short passwords, bad usernames.
4. **Login/session:** correct password sets a cookie; wrong password 401; `/api/record` without a cookie
   401; logout invalidates; expired session 401.
5. **Isolation:** user A's attempts, profile, English certificate and GPA overrides are invisible to
   user B, and B cannot modify A's rows by id.
6. **Admin:** non-admin gets 403 on every admin route; invite creation returns a code that works once;
   password reset invalidates the target's sessions.
7. **Rate limiting:** the 11th failed login within the window returns 429.
8. **Browser:** register with an invite, enter courses, sign out, sign in as a second user and see an
   empty record, admin sees the invites page.

## 7. Risks

- **Bootstrap password in the log.** Printed once; the account is flagged `must_change_password`.
- **In-memory rate limiting** resets on restart — acceptable for one process on a tailnet.
- **No HTTPS on the tailnet**, so cookies are not `Secure` there; the flag turns on automatically behind
  an HTTPS proxy or Tailscale Funnel.
- **Backups now hold several people's data**; the backup file stays local and gitignored.

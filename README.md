# HCMUS Progress

**Plan your degree at HCMUS without the spreadsheet.** Track every course you've taken, see exactly
which graduation requirements are still open, and plan the remaining semesters with warnings for
credit limits, prerequisites and your programme's rules.

### ➜ Use it now: **[hcmus-courses.lamter.cc](https://hcmus-courses.lamter.cc)**

The hosted site is free. Sign-up is invite-only while it's small, so ask the maintainer for a code — or
[run your own copy](#self-hosting) in a few minutes.

---

## What it does

- **Progress by requirement group.** Credits earned, in progress and planned for each block of your
  curriculum — general education, foundation, specialization, graduation work — against the numbers
  printed in the official *chương trình đào tạo*.
- **Every attempt, every grade.** Retakes are supported and the latest grade is official, as the
  regulation says. GPA on the 10- and 4-point scales with your graduation ranking.
- **Compulsory or elective at a glance.** Each course is badged *Compulsory*, *Choose* (pick within a
  group), *Elective* or *Graduation work*.
- **A semester planner.** Drag courses into semesters. It warns about credit limits, missing prior
  courses, a missing specialization or graduation track, and duplicate attempts. One click fills the
  remaining semesters with a plan that meets every requirement.
- **"What can I take next?"** Courses you're eligible for, ranked by the requirement they fill and how
  many later courses they unlock.
- **Graduation checklist.** The conditions of Article 17 of the university regulation, including your
  English certificate and whether it will still be valid when you graduate.
- **Your data is yours.** Download a full JSON backup or a CSV of your courses at any time, and restore
  from a backup.

## Supported programmes

| Programme | Curriculum used | Credits |
|---|---|---|
| Khoa học máy tính — Chương trình tiên tiến (**APCS**), khóa 2024 | CTĐT khóa 2024 | 163 |
| Công nghệ thông tin — **CLC** / Tăng cường tiếng Anh, khóa 2026 | CTĐT khóa **2024** (2026 not yet published) | 138 |
| **Công nghệ thông tin**, khóa 2025 | CTĐT khóa 2025 | 138 |
| **Khoa học máy tính**, khóa 2025 | CTĐT khóa 2025 | 138 |
| **Kỹ thuật phần mềm**, khóa 2025 | CTĐT khóa 2025 | 138 |

Specializations (chuyên ngành) and graduation options (khóa luận, thực tập tốt nghiệp, thực tập dự án)
come from each document. Your programme isn't listed? See [Adding a programme](#adding-a-programme) — it's
mostly data entry, and contributions are welcome.

## Getting started (as a student)

1. **Sign in**, then pick your **programme** and **current semester** in the sidebar.
2. **Courses → Quick entry.** Paste what you've already done, one course per line:
   `CODE SEMESTER GRADE` (for example `CSC10004 2 8.5`). Leave the grade out for courses you're taking now.
3. **Planner.** Choose your specialization and graduation track, press **Load suggested plan**, then
   drag courses around until the plan suits you.
4. **Checklist.** Record your English certificate and military education certificate.

---

## Self-hosting

You need **Node.js 22 or newer**. Everything — the website, the API and the SQLite database — runs in one
process.

```bash
git clone <this repository> hcmus-progress
cd hcmus-progress
npm install
npm run build
npm start                  # → http://localhost:5174
```

On first start the server creates an **admin** account and prints its password **once** in the log:

```
Created admin "admin" with password: …  (change it after signing in)
```

Sign in and the app will ask you to choose a new password. To pick the credentials yourself, set
`ADMIN_USER` and `ADMIN_PASSWORD` before the first start.

**Inviting people.** As the admin, open **Invites**, create a code and send it; registering requires a
valid code, and each code works once. A forgotten password is handled under **Invites → Accounts →
Reset password**, which shows a temporary password once and signs that person out everywhere.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5174` | Port the server listens on |
| `HOST` | `0.0.0.0` | Bind address — use `127.0.0.1` when a reverse proxy runs on the same machine |
| `PROGRESS_DB` | `data/progress.db` | SQLite database file |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_NAME` | generated | First-run admin account |
| `TRUST_PROXY` | off | Trust `X-Forwarded-*` from a proxy on **another** machine (a proxy on the same machine is trusted automatically) |

### Putting it on the internet

Run it behind anything that terminates HTTPS — Caddy, nginx, a Cloudflare Tunnel or a Tailscale Funnel.
When the proxy forwards `X-Forwarded-Proto: https`, session cookies become `Secure` and HSTS is sent
automatically; failed sign-ins are rate-limited per visitor address. Only the proxy should be able to
reach the app, so bind it to `127.0.0.1` if the proxy runs on the same host.

### Backups

- Each start copies the database to `data/backups/progress-YYYYMMDD.db` (one per day, the newest seven kept).
- `npm run backup [directory]` makes a consistent copy while the app is running — schedule it with cron
  for an off-machine copy. `BACKUP_KEEP` sets how many copies to keep.
- Every user can download their own data as JSON (restorable) or CSV from **Your data**.

---

## Development

```bash
npm install
npm run dev                # UI with hot reload on :5173, API on :5174
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests: rules engine, every programme's data, the API (Vitest) |
| `npm run test:e2e` | Browser tests against a production build on a throwaway database (Playwright) |
| `npm run test:all` | Both suites |
| `npm run typecheck` | TypeScript across server, UI and shared code |

**Stack:** React + Vite for the UI, Hono + better-sqlite3 for the API, and a pure TypeScript rules
engine in `shared/` that both use. The server only stores data; every calculation happens in the engine,
so it can be tested without a browser or a database.

```
shared/domain/      the rules engine: grades, GPA, prerequisites, planner, checklist
shared/programs/    one folder per programme (course data + its rules)
server/             API, accounts, SQLite migrations, backups
src/                React pages and components
e2e/                Playwright tests
```

`CLAUDE.md` has the architecture notes and the conventions the codebase follows.

### Adding a programme

Most HCMUS programmes share one structure — general education, foundation, one specialization and
graduation work — which `shared/programs/_standard/factory.ts` implements. For such a programme:

1. Transcribe the curriculum's §6–7 tables into an extraction file (the format is documented at the top
   of `scripts/program-from-extract.mjs`): the blocks and their rules ("all of", "choose 1 of", "choose
   N credits from"), the specializations and the course list with credits.
2. Generate the programme folder:

   ```bash
   node scripts/program-from-extract.mjs extract.json khmt-2026 "Khoa học máy tính — khóa tuyển 2026" "KHMT 2026"
   ```

3. Register it in `shared/programs/index.ts` and add its config to the list in
   `shared/programs/_standard/standard.test.ts`. That suite checks the credit totals, that every
   referenced course exists, and that a complete plan can be built for every graduation option.

Programmes with a different shape (APCS is one) implement the `ProgramModule` interface directly.

## Where the rules come from

- **Curricula:** the official *chương trình đào tạo* of each programme, published by HCMUS and the Faculty
  of Information Technology.
- **Regulation:** *Quy chế đào tạo trình độ đại học* (QĐ 1175/QĐ-KHTN) — credit limits per semester,
  grading, GPA, academic warnings and the graduation conditions of Article 17.
- **Grade conversion:** QĐ 651/QĐ-KHTN (4-point scale).

**Known limits.** Prerequisites are only known for APCS, and they are warnings rather than blocks. Things
the documents don't publish — the thesis GPA threshold, some programmes' English standard, the IT-skills
standard — show as *unknown* on the checklist until you confirm them with the faculty. Which courses
count toward the GPA can be changed per course, because Article 15.1c lets a programme exclude some.

Found a wrong number? Every figure comes from a document, so open an issue with the programme, the
section and what it should say.

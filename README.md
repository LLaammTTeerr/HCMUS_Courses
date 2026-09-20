# HCMUS Progress

A local web app for tracking graduation progress in an HCMUS programme. Two programmes are built in:

| Program | Document | Notes |
|---|---|---|
| **APCS 2024** — Advanced Program in Computer Science | CTĐT khóa 2024 (QĐ 2700/QĐ-KHTN) | 163 credits; thesis or capstone |
| **CLC 2026** — Tăng cường tiếng Anh / CLC, Công nghệ thông tin | CTĐT khóa **2024** (QĐ 2693/QĐ-KHTN) | 138 credits; 9 specializations; the 2026 curriculum is not published yet, so the 2024 one is used with 2026 semester labels |

Pick the programme in the sidebar. You can use it to:

- see credits per requirement group of your programme: earned, in progress, and planned
- see which courses are **compulsory** (bắt buộc), group electives ("choose", e.g. 16 cr of A), free CS
  electives, or graduation work. Badges appear in the course list, the drawer, and the planner (`REQ`).
- record every course attempt with its 10-point grade (retakes supported; the latest grade is official)
- plan semesters by drag and drop, with warnings for credit limits, prior courses, and your programme's
  choices (graduation track, and the CLC specialization)
- get ranked "what can I take next" suggestions
- check the Article 17 graduation checklist, including the English certificate and its expiry

Your data stays on your machine in `data/progress.db` (SQLite).

## Run

Requires Node 22+.

```bash
npm install
npm run dev          # UI at http://localhost:5173 (API on :5174), also on LAN/Tailscale IPs
```

To run a production build on a single port:

```bash
npm run build
npm start            # http://localhost:5174
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | rules engine, program data, and API tests (Vitest) |
| `npm run test:e2e` | browser tests: sign-in, invites, planner, program switch (Playwright) |
| `npm run test:all` | both suites |
| `npm run typecheck` | TypeScript check of the whole project |

Environment variables: `PROGRESS_DB` (database file), `PORT`, `HOST` (default `0.0.0.0`; `127.0.0.1` keeps
it local), and `ADMIN_USER` / `ADMIN_PASSWORD` / `ADMIN_NAME` for the first-run admin account.

The dev server listens on all interfaces and accepts `*.ts.net` hostnames, so the app is reachable over
Tailscale at `http://<machine>.<tailnet>.ts.net:5173`. Sign-in is required, but the tailnet connection is
plain HTTP, so session cookies are only marked `Secure` behind an HTTPS proxy (such as a Tailscale
Funnel), which the server detects automatically.

## Accounts

Everyone who uses the site has their own account and their own courses; nobody can see anyone else's.

- **First start** creates an **admin** account and prints its password once in the server log:
  `Created admin "admin" with password: …`. Sign in and change it (the app asks you to).
  Set `ADMIN_USER` / `ADMIN_PASSWORD` before the first start to choose them yourself.
- **Inviting someone:** sign in as the admin → **Invites** → create a code and send it. Registration
  requires a code, each code works once, and you can revoke unused codes.
- **Forgotten password:** the admin opens **Invites → Accounts → Reset password**, which shows a
  temporary password once and signs that person out everywhere. They choose a new one at next sign-in.
- Sessions are cookies valid for 30 days; failed sign-ins are rate limited.

## First steps

1. **Sign in** (see Accounts above).
2. **Courses → Quick entry.** Paste your finished courses, one per line: `CODE SEMESTER GRADE`
   (semester 1 = HK1 2024–2025). Leave the grade out for the current semester's courses.
3. **Sidebar.** Pick your programme and current semester.
4. **Planner.** Pick thesis or capstone, click **Load suggested plan**, then drag courses to adjust.
5. **Checklist.** Enter your English certificate and the military education certificate.

## Your data

- `data/progress.db` is ignored by git. To version your data, remove `data/*.db` from `.gitignore`.
- Each server start copies the database to `backups/progress-YYYYMMDD.db` next to it (once per day, newest 7 kept).
- To inspect the data: `sqlite3 data/progress.db 'select * from attempts'`.

## Adding another programme

Rules live in code, one module per programme (`shared/programs/<id>/`), so a new programme means a small
TypeScript file plus its course data and tests. See `CLAUDE.md` → "Adding a program".

## Where the rules come from

All sources are official documents from https://www.ctda.hcmus.edu.vn; copies are in `docs/sources/`.

| Rule | Source |
|---|---|
| Buckets, courses, credits, suggested plan | *CTĐT APCS khóa 2024* (QĐ 2700/QĐ-KHTN) |
| Prior courses (prerequisites) | *Course Descriptions — BSc APCS* (2021), "Prior-course" field, remapped to 2024 codes |
| 10–22 credits/semester, grading, GPA, academic warnings, Article 17 | *Quy chế đào tạo* QĐ 1175/QĐ-KHTN (in *Sổ tay sinh viên 2024–2025*) |
| English: IELTS 6.0 / TOEFL iBT 79 / TOEFL ITP 550 + TOEIC S&W 270 | QĐ 1985/QĐ-KHTN |
| 4-point conversion `1 + (g − 3) × 0.5` | QĐ 651/QĐ-KHTN |

GPA and graduation classification use the passed courses that count toward the GPA. By default the
app excludes Physical and Military Education, the five political theory courses (BAA00101–104,
BAA00003), and Introduction to Laws (BAA00004). Article 15.1c also lets the program exclude other
courses, so each course's drawer has a **"Counts toward GPA & graduation classification"** toggle.
Overridden courses show "not in GPA" in the course list, and the dashboard lists every graded course
left out.

Known gaps:

- **Prerequisites are soft.** They are "học phần học trước", so they produce warnings and never block.
  The original wording for each course is shown in its drawer.
- **IT standard.** The chuẩn tin học is not defined for APCS; confirm it with giáo vụ.
- **Thesis GPA threshold.** It is not published; enter it on the Checklist page.

The design is described in `docs/superpowers/specs/2026-09-17-apcs-progress-tracker-design.md`.

# APCS Progress

A local web app for tracking graduation progress in the **HCMUS Advanced Program in Computer Science
(APCS), intake 2024**. You can use it to:

- see credits per requirement bucket: earned, in progress, and planned
- see which courses are **compulsory** (bắt buộc), group electives ("choose", e.g. 16 cr of A), free CS
  electives, or graduation work. Badges appear in the course list, the drawer, and the planner (`REQ`).
- record every course attempt with its 10-point grade (retakes supported; the latest grade is official)
- plan semesters by drag and drop, with warnings for credit limits, prior courses, and the thesis/capstone track
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
| `npm run typecheck` | TypeScript check of the whole project |

Environment variables: `PROGRESS_DB` sets another database file, `PORT` sets the API/production port, and `HOST` sets the bind address (default `0.0.0.0`; use `127.0.0.1` to keep it local).

The dev server listens on all interfaces and accepts `*.ts.net` hostnames, so the app is reachable over Tailscale at `http://<machine>.<tailnet>.ts.net:5173`. There is no login: anyone who can reach the port can edit the data.

## First steps

1. **Courses → Quick entry.** Paste your finished courses, one per line: `CODE SEMESTER GRADE`
   (semester 1 = HK1 2024–2025). Leave the grade out for the current semester's courses.
2. **Sidebar.** Set the current semester (default S7 = HK1 2026–2027).
3. **Planner.** Pick thesis or capstone, click **Load suggested plan**, then drag courses to adjust.
4. **Checklist.** Enter your English certificate and the military education certificate.

## Your data

- `data/progress.db` is ignored by git. To version your data, remove `data/*.db` from `.gitignore`.
- Each server start copies the database to `backups/progress-YYYYMMDD.db` next to it (once per day, newest 7 kept).
- To inspect the data: `sqlite3 data/progress.db 'select * from attempts'`.

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

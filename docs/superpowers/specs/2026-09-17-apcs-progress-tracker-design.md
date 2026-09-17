# APCS Progress Tracker — Design Spec

Date: 2026-09-17 · Status: implemented (v1) · Owner: personal tool

## 1. Purpose

A local, personal web app for an HCMUS **Advanced Program in Computer Science (APCS), intake 2024**
student to:

- see graduation progress per credit bucket,
- track every course attempt with its 10-point grade,
- plan the remaining semesters with rule warnings,
- get "what can I take next" suggestions,
- verify the Article 17 graduation checklist.

The user enters semester 7 (HK1 2026–2027) and enters past courses manually.

Non-goals for v1: GPA-target calculator, prerequisite graph visualisation, transcript import,
multi-user/auth, hosting.

**Future development is a design constraint:** program rules live in data, the rules engine is pure and
tested, and the schema is migrated — so adding another intake (e.g. APCS 2025), new features, or a
different UI must not require rewriting the engine.

## 2. Sources (copies in `docs/sources/`)

| Ref | Document | Used for |
|---|---|---|
| CTĐT24 | *CTĐT_APCS_2024* (QĐ 2700/QĐ-KHTN, 30/09/2024), 16 p. scanned | buckets, course list, credits, suggested 12-semester plan |
| CTĐT25 | *CTĐT_APCS_2025* | confirms identical structure (not used as data) |
| DESC21 | *Course Descriptions, BSc APCS* (March 2021), 129 p. | "Prior-course" = prerequisites |
| QC1175 | *Quy chế đào tạo trình độ đại học* (QĐ 1175/QĐ-KHTN, 24/09/2021), in *Sổ tay sinh viên 2024–2025* | credit limits, grading, GPA, warnings, Art. 17 |
| QĐ1985 | *Chuẩn ngoại ngữ đầu ra, CTTT KHMT khóa 2024* | English requirement |
| QĐ651 | *Cách thức quy đổi thang điểm 4* (02/04/2024) | 10→4 point conversion |

Handbook URL (too large to vendor): https://www.ctda.hcmus.edu.vn/vi/goc-sinh-vien/so-tay-sinh-vien/

## 3. Domain rules

### 3.1 Buckets (CTĐT24 §6–7)

| Bucket id | Meaning | Requirement |
|---|---|---|
| `A_REQ` | CS160, CS163, CS201, CS202, CS250, CS300, CS323, CS333, CS486, ECE341 | all passed (40 cr) |
| `A_ELEC` | CS251, CS252, CS311, CS320, CS350, CS420 | A_REQ + A_ELEC ≥ 56 |
| `NONCS` | CM102, SC203, WR227, BAA00101/102/103/104, BAA00003, BAA00004 | all passed (26 cr) |
| `MATH` | MTH251, MTH252, MTH261, STAT451 | all passed (16 cr) |
| `PHYS` | PH211, PH212, PH213 | all passed (12 cr) |
| `B` | MTH253, MTH344, MTH346, STAT452 | ≥ 8 cr |
| `C` | 27 electives CS404…CS494 | B + C (+ A overflow) ≥ 43 |
| `GRAD` | CS468 (10) **or** CS469 + CS470 (5 + 5) | 10 cr |
| `EXTRA` | BAA00021, BAA00022, BAA00030 | must pass; not in 163, not in GPA |

- **Requirement kind** (`shared/domain/requirement.ts`, CTĐT "Loại HP"): compulsory = A_REQ, NONCS, MATH,
  PHYS, EXTRA (29 courses); group-elective = A_ELEC, B; elective = C; graduation = GRAD. Shown as badges
  in the UI and filterable on the Courses page.
- **A overflow:** `overflowA = max(0, A_REQ + A_ELEC − 56)` counts toward C.
- **Graduation work:** capstone counts only when both CS469 and CS470 are passed (CS469 alone = 0 cr);
  CS470 must be in a later semester than CS469. Graduation credits are capped at 10.
- **Total:** sum of all passed courses with `countsTowardTotal` (everything except EXTRA) ≥ 163, where
  GRAD contributes its capped value.

### 3.2 Course state

A course's state is derived from its attempts (QC1175 Art. 14: the latest attempt is official):

- `passed` — latest graded attempt has grade ≥ 5.0
- `failed` — latest graded attempt < 5.0 and no in-progress/planned attempt
- `in-progress` — has an attempt with status `in-progress`
- `planned` — has an attempt with status `planned`
- `not-taken`

Precedence: `passed` > `in-progress` > `planned` > `failed` > `not-taken` (a passed course with a planned
improvement retake stays `passed` for credits; its planned attempt still shows in the planner). The
official grade is the grade of the latest completed attempt (by semester, then id).

Projections: **earned** (passed), **+ in progress**, **+ planned**. Each bucket bar shows all three.

### 3.3 Grades and GPA

- Grade is on the 10-point scale, one decimal. Pass ≥ 5.0 (QC1175 Art. 11.4).
- **ĐTB tích lũy (cumulative GPA)** = credit-weighted mean of official grades of *passed* courses with
  `countsInGpa` (QC1175 Art. 15.1b). **ĐTB** includes failed courses too (Art. 15.1a).
- **Courses outside the GPA:** by default EXTRA (Art. 15.1c) and the political theory courses
  BAA00101/102/103/104 and BAA00003, plus BAA00004 (law) (`countsInGpa: false` in the program JSON,
  set at the student's direction; not stated in CTĐT24). Art. 15.1c also allows "other courses as
  specified by the program", so the student can override inclusion per course (`gpa_overrides` table,
  migration 2). Overrides affect ĐTB, ĐTB tích lũy, semester ĐTB for academic warnings, ranking, and the
  thesis GPA check — never earned credits.
- 4-point (QĐ651): `g ≥ 9 → 4.0`; `3 ≤ g < 9 → 1 + (g − 3) × 0.5`; `g < 3 → 0`. The cumulative 4-point
  GPA is the credit-weighted mean of per-course converted grades.
- Ranking (QC1175 Art. 15.2b, intakes ≥ 2021): 9–10 Xuất sắc · 8–<9 Giỏi · 7–<8 Khá · 5–<7 Trung bình ·
  4–<5 Yếu · <4 Kém.
- Year level (Art. 15.3): N < 38 → year 1; < 76 → 2; < 114 → 3; else 4.

### 3.4 Semesters

- 3 main semesters per academic year (QC1175 Art. 6.4b). Semester 1 = HK1 2024–2025.
  Label for semester n: `HK{((n−1) mod 3)+1} {Y}–{Y+1}` with `Y = 2024 + ⌊(n−1)/3⌋`.
- Approximate end dates: HK1 → 31 Dec Y, HK2 → 30 Apr Y+1, HK3 → 31 Aug Y+1.
- Registration limits (Art. 7.2): 10 ≤ credits ≤ 22 per semester (all registered courses, incl. EXTRA).
- Academic warning (Art. 16.1), checked for completed semesters: passed credits < 7 (unless cumulative
  ≥ 130), or semester ĐTB < 3.0.
- Standard duration 12 semesters; max +3 years (21 semesters) (Art. 2.7).

### 3.5 Prerequisites (DESC21 "Prior-course")

Semantics are **học phần học trước** (QC1175 Art. 3.1c): soft. They produce warnings, never block.
For a course X placed in semester s, prerequisite P is:

- `ok` — P passed, or P has an in-progress/planned/completed attempt in a semester < s
- `weak` — P was taken but its latest grade is failing (allowed as học trước; flagged)
- `missing` — otherwise (including P only in the same semester s)

Old codes remapped to 2024: CS161/CS162 → CS160, CS305 → CS323, CM101 → CM102, CS386 → CS486.
Prose entries are hand-mapped and every such course stores the original wording in `prereqNote`.
Courses without an entry in DESC21 (CS252, CS414, CS435, CS468) have no prerequisites.
Deliberate omissions (documented in `prereqNote`): STAT451 omits CS251 (elective, same semester in plan);
MTH346 omits "Algorithms Analysis" (plan puts MTH346 before CS350); CS420 maps "Data Structures and
Algorithms" to CS163 only; CS469/CS470 "any programming-intensive CS elective" is not enforced.

### 3.6 Graduation checklist (QC1175 Art. 17)

1. Total ≥ 163 and every bucket requirement in 3.1.
2. Physical Education 1 and 2 passed.
3. Military education (BAA00030) passed and certificate received (profile flag).
4. English (QĐ1985): IELTS ≥ 6.0, **or** TOEFL iBT ≥ 79, **or** TOEFL ITP ≥ 550 **and** TOEIC
   Speaking+Writing ≥ 270. Valid if `expires` (or `issued + 2 years` when no expiry) is on/after the end
   date of the planned graduation semester.
5. IT standard ("chuẩn tin học"): not defined in CTĐT24 → shown as *unconfirmed — ask giáo vụ*.
6. Thesis track only: cumulative GPA ≥ user-entered faculty threshold (not public), if entered.

Each item reports `done`, `covered-by-plan`, `missing`, or `unknown`.

### 3.7 Planner warnings

- Semester credits outside 10–22 (current and future semesters with ≥ 1 course).
- Prerequisite `missing`/`weak` for in-progress or planned courses.
- A course planned more than once (warning); a planned attempt of an already passed course is shown as
  info — it counts as a grade improvement and its grade becomes official (QC1175 Art. 14.2).
- Planned/in-progress attempt in a semester before the current one; completed attempts in the future.
- Track: thesis without CS468 planned; capstone without CS469+CS470; CS470 not after CS469; courses of the
  other track planned.
- Projected (with plan) bucket shortfalls, e.g. "B + C: 39 / 43 with plan".
- In-progress attempts in semesters before the current one ("needs a grade").

**Earliest graduation semester:** if the full projection satisfies every credit requirement, the latest
semester holding an in-progress/planned course (or the current semester if none); else "plan incomplete".

### 3.8 "What next" ranking

Target semester t (default current + 1). Candidates: courses not passed and with no in-progress/planned
attempt, all prerequisites `ok` for t. GRAD courses only when t ≥ 11 and matching the track (CS470 only if
CS469 is passed/in-progress/planned before t). Sorted by:

1. tier: 0 required (A_REQ/NONCS/MATH/PHYS/EXTRA, GRAD when eligible) · 1 A_ELEC while projected A < 56 ·
   2 B while projected B < 8 · 3 C/A_ELEC/B while projected B + C < 43 · 4 surplus
2. number of not-yet-passed courses that list it as a prerequisite (desc)
3. official suggested semester (asc, missing last), then code

Each row states its reason, e.g. "required · unlocks 3".

### 3.9 Suggested plan

"Load suggested plan" (Planner) creates planned attempts that complete every requirement:

- **Selection.** Uncovered required courses; electives only while their bucket is short (A < 56,
  B < 8, B + C < 43), taken in official suggested order; graduation work for the chosen track plus its
  prior courses (none when undecided).
- **Placement.** No earlier than the next semester and after prior courses. Graduation work is pinned
  to its suggested semesters, and credits are spread evenly over the remaining standard semesters.
- **Balancing.** A local search (single moves and pairwise swaps that keep prerequisite order) removes
  semesters below 10 or above 22 credits. When the credit multiset cannot fill every semester, it adds
  up to three extra electives.
- **Undo.** The page offers an undo for the batch it just added.

## 4. Architecture

```
HCMUS_Courses/
  data/progress.db            user data (gitignored); data/backups/ keeps last 7 daily copies
  docs/                       sources + specs + plans
  shared/                     pure TypeScript, no React / Node APIs
    programs/apcs-2024.json   program facts (courses, buckets, rules parameters, plan)
    programs/index.ts         program registry (id → Program)
    domain/                   types, courseState, credits, gpa, semesters, prereqs, planner,
                              recommend, checklist, english
    api.ts                    API DTOs + zod schemas shared by server and client
  server/                     Node + Hono + better-sqlite3
    db.ts                     open, backup, migrations
    repo.ts                   SQL access
    app.ts                    createApp(db) → Hono routes
    index.ts                  entry: port 5174, serves dist/ in production
  src/                        React UI (Vite)
    api/client.ts, state/     fetch wrapper + StoreProvider (optimistic updates, retry marks)
    pages/                    Dashboard, Courses, Planner, Next, Checklist
    components/               BucketBar, CourseDrawer, QuickEntry, WarningList, …
  tests/ (co-located *.test.ts)
```

Dependency direction: `src` → `shared`; `server` → `shared`; `shared` depends on nothing.
The client computes everything from `(program, record)`; the server only persists.

### 4.1 Database (SQLite, migrations table `schema_version`)

```sql
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  program_id TEXT NOT NULL DEFAULT 'apcs-2024',
  current_semester INTEGER NOT NULL DEFAULT 7,
  grad_track TEXT NOT NULL DEFAULT 'undecided' CHECK (grad_track IN ('thesis','capstone','undecided')),
  military_cert INTEGER NOT NULL DEFAULT 0,
  thesis_gpa_threshold REAL
);
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1),
  status TEXT NOT NULL CHECK (status IN ('completed','in-progress','planned')),
  grade10 REAL CHECK (grade10 IS NULL OR (grade10 >= 0 AND grade10 <= 10)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE english_cert (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  type TEXT NOT NULL CHECK (type IN ('IELTS','TOEFL_IBT','TOEFL_ITP_TOEIC_SW')),
  score REAL NOT NULL,
  score2 REAL,
  issued TEXT NOT NULL,
  expires TEXT
);
```

`completed` requires `grade10`; enforced by API validation.

### 4.2 API (JSON, prefix `/api`)

| Method | Path | Body / result |
|---|---|---|
| GET | `/record` | `{ profile, attempts, english }` |
| PUT | `/profile` | partial profile → profile |
| POST | `/attempts` | attempt (no id) → attempt |
| POST | `/attempts/batch` | `{ attempts: [...] }` → attempts (single transaction) |
| PATCH | `/attempts/:id` | partial → attempt |
| DELETE | `/attempts/:id` | 204 |
| POST | `/attempts/batch-delete` | `{ ids }` → 204 |
| PUT | `/english` | cert → cert |
| DELETE | `/english` | 204 |
| GET | `/health` | `{ ok: true }` |

Validation with zod: unknown course code (for the profile's program), grade outside 0–10, semester < 1,
`completed` without grade → 400 with message; nothing written.

### 4.3 Running

- `npm run dev` — Vite (5173, proxies `/api` → 5174) + API with tsx watch, via `concurrently`.
- `npm run build && npm start` — API serves the built UI on 5174.
- `npm test` — Vitest (shared + server).
- On server start: copy existing `data/progress.db` to `data/backups/progress-YYYYMMDD.db` (once per day),
  keep newest 7 (in `backups/` next to the database file; the WAL is checkpointed first).

## 5. UI

Left sidebar with five pages; a course drawer opens from any course reference. Names shown EN + VI.
Light/dark via CSS tokens.

- **Dashboard** — total credits, ĐTB tích lũy (10 & 4 scale) + ranking + year level, earliest graduation
  semester, bucket bars (earned / in progress / planned, overflow note), warnings panel (planner + academic
  warnings), empty-state CTA.
- **Courses** — grouped by bucket, filter by status/bucket, search; drawer with attempts CRUD and
  prerequisite status (+ original wording). **Quick entry** table: rows of `code, semester, grade` with
  inline validation, saved in one batch.
- **Planner** — semester columns 1…max(12, last used); past columns read-only; current = in-progress;
  future = planned. HTML5 drag from "Not yet taken" tray or between columns; per-column credit total with
  limit marker; ⚠ per card for prereq issues; track switch; "Load suggested plan" with undo.
- **What next** — target semester selector, ranked eligible list with reasons, "Add to semester t".
- **Checklist** — Art. 17 items, English certificate form, military certificate flag, thesis GPA
  threshold input, IT standard note.

Errors: API unreachable → banner "Server not running — start with `npm run dev`"; failed save keeps the
optimistic change, marks it with a retry control.

## 6. Testing

- **Program data** (`apcs-2024.test.ts`): 69 courses; A_REQ 10 courses/40 cr; A_ELEC 6; NONCS 26 cr;
  MATH 16; PHYS 12; B pool 4; C pool 27; CS468 = 10, CS469 = CS470 = 5; prereq codes exist; prereq graph
  acyclic; plan semesters 1–12 and codes exist; every hand-mapped prereq has `prereqNote`.
- **Domain** unit tests per module (cases listed in brainstorming section 3: overflow 56/64, B < 8 with
  B + C ≥ 43, capstone half, retake counting, QĐ651 values 3.0/5.0/8.9/9.0/2.9, ranking boundaries,
  prereq in-progress/same-semester/failed, credit limits 9/22/23, CS470 ordering, thesis without CS468,
  recommendation tiers, English expiry).
- **Server** integration tests against a temp DB: CRUD, batch transaction, migrations idempotent, 400 on
  invalid input with no write.
- **UI**: quick-entry parsing/validation is a pure function with unit tests; manual end-to-end check
  (enter courses, drag in planner, restart, data persists).

## 7. Extending later

- New intake: add `shared/programs/<id>.json`, register in `programs/index.ts`, copy the data test; the
  profile's `program_id` selects it.
- New rule: add a pure function in `shared/domain`, a test, and surface it via `planner`/`checklist`.
- Schema change: append a migration in `server/db.ts` (never edit old ones).

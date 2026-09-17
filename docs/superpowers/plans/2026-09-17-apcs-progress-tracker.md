# APCS Progress Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local web app that tracks APCS K2024 graduation progress, plans semesters, and checks Art. 17.

**Architecture:** `shared/` holds program data (JSON) and a pure, unit-tested rules engine. `server/` is a
thin Hono + better-sqlite3 persistence API over `data/progress.db`. `src/` is a React (Vite) UI that
loads the record from the API and computes everything with `shared/domain`.

**Tech Stack:** Node 22, TypeScript 5 (strict), Vite 6, React 18, react-router-dom 6, Hono 4 +
@hono/node-server, better-sqlite3, zod 3, Vitest 2, tsx, concurrently.

**Spec:** `docs/superpowers/specs/2026-09-17-apcs-progress-tracker-design.md`

## Global Constraints

- Program: `apcs-2024`; total ≥ 163; A ≥ 56 (A_REQ 40); B ≥ 8; B + C (+A overflow) ≥ 43; GRAD 10.
- Semester credits 10–22; semester 1 = HK1 2024–2025; current semester default 7; 12 standard semesters.
- Pass ≥ 5.0; QĐ651: `g ≥ 9 → 4`, `3 ≤ g < 9 → 1 + (g − 3) × 0.5`, `g < 3 → 0`.
- Prerequisites are soft warnings only.
- `shared/` imports nothing from `src/` or `server/` and uses no Node/DOM APIs.
- API port 5174, Vite port 5173 proxying `/api`.
- DB file `data/progress.db` (gitignored); tests never touch it.

---

## File map

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
shared/programs/apcs-2024.json         program facts
shared/programs/index.ts               getProgram(id), PROGRAM_IDS
shared/programs/apcs-2024.test.ts      data validation
shared/domain/types.ts                 Program, Course, Attempt, Profile, EnglishCert, StudentRecord
shared/domain/courseState.ts (+test)   deriveCourseStates
shared/domain/gpa.ts (+test)           to4, rank, cumulativeGpa, semesterStats, yearLevel
shared/domain/semesters.ts (+test)     semesterLabel, semesterEndDate
shared/domain/credits.ts (+test)       computeProgress
shared/domain/prereqs.ts (+test)       prereqStatus
shared/domain/english.ts (+test)       englishMeets, englishValidUntil
shared/domain/planner.ts (+test)       planWarnings, earliestGraduation
shared/domain/recommend.ts (+test)     recommend
shared/domain/checklist.ts (+test)     checklist
shared/domain/suggestedPlan.ts (+test) suggestedPlanAttempts
shared/domain/quickEntry.ts (+test)    parseQuickEntry
shared/api.ts                          zod schemas + DTO types
server/db.ts, server/repo.ts, server/app.ts, server/index.ts, server/app.test.ts
src/main.tsx, src/App.tsx, src/styles.css
src/api/client.ts, src/state/store.tsx
src/components/*.tsx, src/pages/*.tsx
README.md, CLAUDE.md
```

## Shared interfaces (all tasks use these names)

```ts
// shared/domain/types.ts
export type BucketId = 'A_REQ'|'A_ELEC'|'NONCS'|'MATH'|'PHYS'|'B'|'C'|'GRAD'|'EXTRA';
export interface Course { code: string; nameEn: string; nameVi: string; credits: number; bucket: BucketId;
  prereqs: string[]; prereqNote?: string; suggestedSemester?: number; }
export interface ProgramRules { totalCredits: number; aMin: number; aReqCredits: number; bMin: number;
  bcMin: number; gradCredits: number; semesterMin: number; semesterMax: number; standardSemesters: number;
  maxSemesters: number; intakeYear: number; gradEarliestSemester: number;
  thesis: string[]; capstone: [string, string]; peCourses: string[]; militaryCourse: string; }
export interface Program { id: string; name: string; courses: Course[]; rules: ProgramRules; }
export type AttemptStatus = 'completed'|'in-progress'|'planned';
export interface Attempt { id: number; code: string; semester: number; status: AttemptStatus; grade10: number|null; }
export type GradTrack = 'thesis'|'capstone'|'undecided';
export interface Profile { programId: string; currentSemester: number; gradTrack: GradTrack;
  militaryCert: boolean; thesisGpaThreshold: number|null; }
export type EnglishType = 'IELTS'|'TOEFL_IBT'|'TOEFL_ITP_TOEIC_SW';
export interface EnglishCert { type: EnglishType; score: number; score2: number|null; issued: string; expires: string|null; }
export interface StudentRecord { profile: Profile; attempts: Attempt[]; english: EnglishCert|null; }
export type CourseStatus = 'passed'|'in-progress'|'planned'|'failed'|'not-taken';
export interface CourseState { code: string; status: CourseStatus; officialGrade: number|null;
  passedSemester: number|null; activeSemester: number|null; /* in-progress or first planned */ attempts: Attempt[]; }
export type Severity = 'error'|'warning'|'info';
export interface Warning { id: string; severity: Severity; message: string; semester?: number; code?: string;
  link: 'planner'|'courses'|'checklist'; }
```

---

### Task 1: Scaffold + program data + data tests
- [ ] package.json scripts: `dev` (concurrently vite + `tsx watch server/index.ts`), `build` (`vite build`),
  `start` (`NODE_ENV=production tsx server/index.ts`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
- [ ] `apcs-2024.json`: 69 courses per spec §3.1/§3.5, suggested semesters from CTĐT24 §8.
- [ ] Test: counts/credits/pools, prereq codes exist, acyclic, plan in 1–12, `prereqNote` present for mapped prose.
- [ ] Run `npm test` → pass; commit.

### Task 2: courseState + gpa + semesters
- `deriveCourseStates(program, attempts): Map<string, CourseState>`
- `to4(g: number): number`; `rank(g: number|null): string`; `cumulativeGpa(program, states): {gpa10, gpa4, credits}`;
  `semesterStats(program, attempts): {semester, attemptedCredits, passedCredits, gpa10}[]`; `yearLevel(n)`.
- `semesterLabel(program, n): string`; `semesterEndDate(program, n): string` (ISO).
- Tests: precedence rules, retake latest counts (lower grade too), QĐ651 3.0→1, 5.0→2, 8.9→3.95, 9.0→4, 2.9→0;
  ranking 8.99 Giỏi / 9.0 Xuất sắc; EXTRA excluded; label sem 7 → "HK1 2026–2027"; end date sem 8 → 2027-04-30.

### Task 3: credits
- `type Projection = 'earned'|'inProgress'|'planned'`
- `computeProgress(program, states, track): { buckets: Record<BucketKey, {earned,inProgress,planned,required}>, overflowA: {earned,inProgress,planned}, total: {...}, missingRequired: {earned: string[], planned: string[]} }`
  where `BucketKey = 'A'|'NONCS'|'MATH'|'PHYS'|'B'|'C'|'BC'|'GRAD'|'TOTAL'` and values are cumulative.
- Tests: 56→0 overflow; 64→8 overflow reaching BC 43 with B 8 + C 27; B 4 fails even with BC ≥ 43; capstone
  CS469 only → GRAD 0; thesis + capstone both → 10 cap; failed then passed counts once.

### Task 4: prereqs + english + planner + suggested plan
- `prereqStatus(program, states, attempts, code, semester): {code, status: 'ok'|'weak'|'missing'}[]`
- `englishMeets(cert): boolean`; `englishValidUntil(cert): string`
- `planWarnings(program, record): Warning[]`; `earliestGraduation(program, record): number|null`
- `suggestedPlanAttempts(program, record): Omit<Attempt,'id'>[]`
- Tests: in-progress prereq ok next semester; same-semester missing; failed weak; 9/22/23 credits;
  CS470 same semester as CS469 error; thesis without CS468; planned-after-passed info; earliest graduation.

### Task 5: recommend + checklist + quickEntry
- `recommend(program, record, target): {code, tier, unlocks, reason}[]`
- `checklist(program, record): {id, label, status: 'done'|'covered-by-plan'|'missing'|'unknown', detail}[]`
- `parseQuickEntry(program, text): {rows: {line, code, semester, grade10}[], errors: {line, message}[]}`
  (accepts lines `CS160 1 8.5`, commas or tabs; code case-insensitive).
- Tests: required above electives; A_ELEC demoted after 16; planned excluded; GRAD only ≥ 11; English expiry;
  quick entry errors for unknown code / bad grade / bad semester.

### Task 6: server
- `openDb(file): Database` (runs migrations); `backupDb(file, dir, keep=7)`; `createRepo(db)`; `createApp(db, program resolver)`.
- Tests with temp file: GET record defaults; POST/PATCH/DELETE attempts; batch transactional (one invalid →
  nothing written, 400); completed without grade 400; migrations twice OK; PUT/DELETE english.

### Task 7: UI shell, store, Dashboard, Checklist
- `client.ts` typed fetchers; `StoreProvider` with `record`, `status: 'loading'|'ready'|'offline'`, optimistic
  mutations, `pending`/`failed` markers + retry.
- Layout + sidebar + routes; Dashboard + Checklist pages.

### Task 8: Courses page + drawer + quick entry

### Task 9: Planner + What next

### Task 10: Docs + verification
- README (run, data, sources), CLAUDE.md (architecture, extension rules); `npm test`, `npm run typecheck`,
  `npm run build`; manual e2e with the real server (enter courses, plan, restart, persists).

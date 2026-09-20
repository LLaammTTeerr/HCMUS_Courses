# APCS Progress: notes for development

Personal graduation tracker for HCMUS APCS intake 2024. The spec is in
`docs/superpowers/specs/2026-09-17-apcs-progress-tracker-design.md`, and official sources are in
`docs/sources/`.

## Architecture

```
shared/   pure TypeScript: no React, no Node APIs. Imported by both server and UI.
  domain/program.ts     the ProgramModule interface + helpers (isCovered, group, creditsOf, buildContext)
  domain/*.ts           program-independent engine, each module with a *.test.ts next to it
  domain/golden.test.ts behaviour lock for APCS — a refactor must not change these numbers
  programs/index.ts     registry: getProgram(id), listPrograms(), courseIndex(program)
  programs/<id>/        one folder per program: courses.json + meta.json + index.ts (+ data.test.ts)
  api.ts                zod schemas and DTOs shared by server and client
server/   Hono + better-sqlite3. Persistence only; it does no rule calculations.
  db.ts (migrations, backups) · repo.ts (SQL) · app.ts (routes, validation) · index.ts (entry)
src/      React + Vite UI. Loads the record, computes everything via shared/domain.
  state/store.tsx + state/storeContext.ts · state/derived.ts (useDerived) · pages/ · components/
```

Data flow: `GET /api/record` loads a `StudentRecord`, `useDerived()` runs the engine plus the program
module on it, and the pages render `ProgressReport.groups` without knowing the program.

**Split of responsibilities**

| Shared engine | Program module (`shared/programs/<id>/index.ts`) |
|---|---|
| course state, grades, GPA and overrides, rankings | credit groups and their arithmetic |
| semester labels, prerequisites, quick entry | which requirement a course serves (`courseNeed`) |
| planner scheduling, balancing, credit limits, duplicates | which courses the plan still needs (`coursesToPlan`) |
| Art. 17 checklist items shared by all programs | program-specific checklist items (English standard, thesis GPA) |
| generic warnings | program-specific warnings (graduation track, specialization) |

## Common tasks

**Adding a program**

1. Create `shared/programs/<id>/` with `courses.json` (see the `Course` type: `group`, `requirement`,
   `countsInCredits`, `countsInGpa`), `meta.json` (`ProgramMeta` + any rule numbers the module needs) and
   `index.ts` implementing `ProgramModule`.
2. Register it in `shared/programs/index.ts`.
3. Add `data.test.ts` asserting the totals printed in the CTĐT, and rule tests for the shapes that are new.
4. The sidebar program picker shows every registered program; switching keeps all attempts.

**Program rules live in code, not data** (decided 2026-09-20): each program implements `ProgramModule`.
The shared engine must never special-case a program id.

**Adding a rule or warning**

- Write the function and test in `shared/domain`, then surface it through `planWarnings`,
  `academicWarnings`, or `checklist`. Warnings need a stable `id` (tests and React keys use it).

**Adding a page**

- Create `src/pages/XPage.tsx` taking `PageProps` (`record`, `derived`), then add the route and nav link
  in `src/App.tsx`.

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run build && npm start`

## Ideas not built yet (v1 non-goals)

- GPA target calculator ("what average do I need for Giỏi")
- prerequisite graph view
- transcript import from the student portal
- program selector UI

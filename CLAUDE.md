# APCS Progress: notes for development

Personal graduation tracker for HCMUS APCS intake 2024. The spec is in
`docs/superpowers/specs/2026-09-17-apcs-progress-tracker-design.md`, and official sources are in
`docs/sources/`.

## Architecture

```
shared/   pure TypeScript: no React, no Node APIs. Imported by both server and UI.
  programs/<id>.json    program facts (courses, buckets, rules, suggested semesters)
  programs/index.ts     registry: getProgram(id), courseIndex(program)
  domain/*.ts           rules engine, each module with a *.test.ts next to it
  api.ts                zod schemas and DTOs shared by server and client
server/   Hono + better-sqlite3. Persistence only; it does no rule calculations.
  db.ts (migrations, backups) · repo.ts (SQL) · app.ts (routes, validation) · index.ts (entry)
src/      React + Vite UI. Loads the record, computes everything via shared/domain.
  state/store.tsx (optimistic mutations + retry) · state/derived.ts (useDerived) · pages/ · components/
```

Data flow: `GET /api/record` loads a `StudentRecord`, `useDerived()` runs the domain functions on it,
and the pages render the results. Mutations update the store immediately and then call the API; a
failed save shows a Retry toast.

## Rules of the codebase

- **All rule logic lives in `shared/domain`, backed by unit tests.** UI and server never reimplement rules.
- **Program facts belong in JSON, not code.** Numbers such as 163, 56, or 10–22 come from `program.rules`.
- **Cite sources.** When adding a rule, reference the document and article in a comment
  (e.g. `QC1175 Art. 16.1`).
- **Prerequisites stay soft** (warnings, never blocks). Hand-mapped ones must keep the original wording
  in `prereqNote`; `apcs-2024.test.ts` enforces this.
- **Schema changes append a migration** to `MIGRATIONS` in `server/db.ts`. Never edit a shipped migration.
- **Tests never touch `data/progress.db`**, which holds the user's real data. Server tests use a temp
  file. For browser checks, run a second instance:
  `PROGRESS_DB=/tmp/x.db PORT=5176 HOST=127.0.0.1 npx tsx server/index.ts` plus
  `API_PORT=5176 npx vite --port 5177`. Stop it by PID, not `pkill -f`.
- **GPA inclusion:** always go through `countsInGpa(program, code, record.gpaOverrides)`. The per-course
  user overrides live in the `gpa_overrides` table; the program default is `Course.countsInGpa`, else
  "not EXTRA".
- **Store context lives in `src/state/storeContext.ts`**, separate from the provider, so hot reload keeps
  consumers attached.
- **Beware `pkill -f` in shells.** The pattern can match the shell's own command line; use `[x]yz`-style
  patterns.

## Common tasks

**Adding a program (e.g. APCS 2025)**

1. Copy `shared/programs/apcs-2024.json` to `apcs-2025.json` and edit it from the new CTĐT.
2. Register it in `shared/programs/index.ts`.
3. Copy `apcs-2024.test.ts` to `apcs-2025.test.ts` and update the expected numbers from the document.
4. Switch the profile with `PUT /api/profile {"programId": "apcs-2025"}` (there is no UI selector yet).

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

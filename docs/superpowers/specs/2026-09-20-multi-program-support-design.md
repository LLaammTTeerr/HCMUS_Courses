# Multi-Program Support — Design Spec

Date: 2026-09-20 · Status: approved (brainstorming sections 1–3) · Supersedes parts of
`2026-09-17-apcs-progress-tracker-design.md` (§3.1, §3.6 program-specific rules, §4 shared layout)

## 1. Purpose

Support more than one HCMUS program in one app, starting with **APCS 2024** (existing) and
**CLC/TCTA CNTT 2024** (new, used as an approximation for the unpublished 2026 intake). The program's
rules live in a per-program module of TypeScript (approach **C**, chosen by the user over a data-driven
requirement tree), behind one interface the shared engine consumes.

Out of scope this round (next rounds): user accounts with invite-only sign-up, hosting for other people.

## 2. Program module interface

`shared/domain/program.ts` defines:

```ts
export interface ProgramMeta {
  id: string;                 // 'apcs-2024'
  name: string;               // full name
  shortName: string;          // 'APCS 2024' — sidebar/picker
  intakeYear: number;
  semestersPerYear: number;
  standardSemesters: number;
  maxSemesters: number;
  semesterMin: number;        // registration limits (QC1175 Art. 7.2)
  semesterMax: number;
  totalCredits: number;
  sources: SourceRef[];
}

export interface ProgramChoice {
  id: string;                 // 'gradTrack' | 'specialization'
  label: string;
  required: boolean;          // blocks graduation when unset
  options: { id: string; label: string; note?: string }[];
}

export interface RuleContext {
  program: ProgramModule;
  record: StudentRecord;
  states: Map<string, CourseState>;
  choice: (id: string) => string | null;      // profile.choices[id]
}

export interface GroupProgress {
  id: string;
  label: string;
  earned: number;             // cumulative levels, as today
  inProgress: number;
  planned: number;
  required: number;
  approx?: boolean;           // render "≈"
  note?: string;
  satisfied: { earned: boolean; planned: boolean };
  /** Courses of this group not yet covered, for the checklist detail. */
  missing?: string[];
}

export interface ProgressReport {
  groups: GroupProgress[];    // display order
  total: GroupProgress;
  satisfied: { earned: boolean; planned: boolean };
}

export interface CourseNeed {
  /** Lower is more urgent; 0 = required. Drives "what next" ordering. */
  tier: number;
  label: string;              // "required", "A elective needed", "free choice"
}

export interface ProgramModule {
  meta: ProgramMeta;
  courses: Course[];
  choices: ProgramChoice[];
  progress(ctx: RuleContext): ProgressReport;
  /** null when the course adds nothing to an unmet requirement. */
  courseNeed(code: string, ctx: RuleContext): CourseNeed | null;
  /** Courses the suggested plan should add, most important first. */
  coursesToPlan(ctx: RuleContext): Course[];
  checklistItems(ctx: RuleContext): ChecklistItem[];   // program-specific items only
  warnings(ctx: RuleContext): Warning[];               // program-specific warnings only
}
```

Registry `shared/programs/index.ts`: `getProgram(id)`, `PROGRAM_IDS`, `listPrograms(): ProgramMeta[]`,
`courseIndex(module)`.

### 2.1 What stays shared

`courseState`, `gpa` (including per-course GPA overrides), `semesters`, `prereqs`, `quickEntry`,
the scheduling and balancing half of `suggestedPlan`, and the generic parts of `planner.ts`
(credit limits, duplicates, prerequisite warnings, past/future attempt warnings, academic warnings) and
`checklist.ts` (Art. 17 items: credits from the module's report, PE, military, IT standard, thesis GPA).

### 2.2 What each module owns

Credit-group arithmetic, graduation-work rules, which courses fill which requirement, program-specific
checklist items (e.g. the English standard, which is decided per program) and warnings (e.g. "choose a
specialization").

## 3. Course shape

```ts
interface Course {
  code: string; nameEn: string; nameVi: string; credits: number;
  prereqs: string[]; prereqNote?: string; suggestedSemester?: number;
  group: string;                 // display group, program-defined
  requirement: 'compulsory' | 'choose' | 'elective' | 'graduation';
  countsInCredits?: boolean;     // default true
  countsInGpa?: boolean;         // default true
}
```

`bucket` is gone; each module maps its own courses to requirements. Flags differ per program:

| Program | PE / Military credits | PE / Military in GPA |
|---|---|---|
| APCS 2024 | **not** counted (CTĐT §7.1.2 note) | no |
| CLC 2024 | counted (CTĐT §7.1.5–7.1.6) | no |

APCS keeps the user-chosen GPA exclusions (political theory + law) as `countsInGpa: false`.

## 4. Profile choices

`profile.gradTrack` → `profile.choices: Record<string, string>`.

- Migration 3: `ALTER TABLE profile ADD COLUMN choices TEXT NOT NULL DEFAULT '{}'`; copy
  `grad_track` into `choices.gradTrack`; drop `grad_track`.
- API: `PUT /profile` accepts `choices` (whole map) and validates every key against the program's
  `choices[].options`; unknown key or value → 400.
- UI: Planner renders one control per `ProgramChoice`; the sidebar gets a program picker that warns when
  the student's existing attempts contain codes the target program does not define (never deletes).

## 5. Programs in this round

### 5.1 apcs-2024 (port, no behaviour change)

Groups exactly as today: A (required + electives, with the surplus spilling into C), Non-CS, Math,
Physics, B, C, B + C, graduation work (thesis CS468 or capstone CS469 + CS470), total ≥ 163.
Choice: `gradTrack` ∈ thesis | capstone | undecided.

### 5.2 clc-2024 (new — "Chương trình Tăng cường tiếng Anh ngành CNTT", intake 2024)

Structure (CTĐT §3, §6–7): **138 credits** excluding GDTC/GDQP from the GPA but counting them as credits.

| Block | Credits | Shape |
|---|---|---|
| General — political & law (§7.1.1) | 14 | all of 6 courses |
| General — social/economics/skills (§7.1.2) | 2 | choose 1 of 3 |
| General — math & natural science (§7.1.3) | 36 | 6 compulsory (24) + choose 1 math of 3 (4) + ≥ 8 credits from a list |
| General — informatics (§7.1.4) | 4 | CSC00004 |
| PE (§7.1.5) / Military (§7.1.6) | 4 / 4 | compulsory; credits count, GPA does not |
| Foundation (§7.2.1) | 38 | all of 10 courses |
| Specialization (§7.2.2) | 34 | per chosen specialization: ≥ 4 courses and ≥ 16 credits compulsory-list + ≥ 2 courses and ≥ 8 credits elective-list + 10 free choice |
| Graduation (§7.2.3) | 10 | thesis or graduation courses |

Choices: `specialization` (9 options) and `gradTrack`. Before a specialization is chosen, its groups
report `required` with a "choose a specialization" note and contribute nothing to satisfaction.

Free choice (tự chọn tự do, 10 cr): credits of passed courses that no other group still needs, counted up
to 10.

## 6. Testing

1. **Golden parity (written first):** a fixed APCS record → progress numbers, checklist statuses,
   the first 10 recommendations, and the suggested plan's semester map, asserted against today's output.
   The port must not change them.
2. **Per-program data tests:** APCS as today; CLC asserts the printed totals (138; 56 = 42 + 14; 38; 34 =
   16 + 8 + 10; 10) and every "TỔNG CỘNG" subtotal, prerequisite codes exist, groups non-empty,
   9 specializations each with a compulsory list ≥ 16 credits and an elective list ≥ 8 credits.
3. **CLC rule tests:** choose-1-of-3, ≥ 8 credits from a list, ≥ 4 courses and ≥ 16 credits, free-choice
   absorption capped at 10, specialization unset, PE/military counted in credits but not GPA.
4. **Server:** migration 3 idempotent, choices round-trip, invalid choice rejected without writing.
5. **Browser:** one pass per program on a scratch database.

## 7. Risks

- **Scanned-PDF extraction (75 pages).** Mitigated by the printed subtotals in test 2 and by code patterns.
- **CLC English standard unknown.** Checklist item renders as `unknown` with a note until the decision
  document is found.
- **Program switching with incompatible attempts.** The picker warns and keeps data; codes not in the new
  program are ignored by the engine and listed in a warning.

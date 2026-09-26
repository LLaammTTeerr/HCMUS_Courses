// The contract every program (APCS 2024, CLC 2024, …) implements. The shared engine handles grades,
// prerequisites, scheduling and the university-wide regulation; each program owns its own credit rules.
import type { ChecklistItem } from './checklist';
import type { Course, CourseState, SourceRef, StudentRecord, Warning } from './types';

export interface ProgramMeta {
  id: string;
  /** Full official name. */
  name: string;
  /** Short label for the sidebar and the program picker, e.g. "APCS 2024". */
  shortName: string;
  intakeYear: number;
  semestersPerYear: number;
  standardSemesters: number;
  maxSemesters: number;
  /** Registration limits per semester (QC1175 Art. 7.2). */
  semesterMin: number;
  semesterMax: number;
  /**
   * Whether courses outside the programme total (PE, Military, general foreign language) count toward
   * the semester limits. QC1175 Art. 7.2a excludes them for mainstream programmes; the advanced/CLC
   * limits count every registered course. Default true.
   */
  limitCountsExtras?: boolean;
  totalCredits: number;
  /** Graduation work is only suggested from this semester on. */
  gradEarliestSemester: number;
  /** Physical Education courses (QC1175 Art. 17.3c). */
  peCourses: string[];
  /** Military Education course (QC1175 Art. 17.3c). */
  militaryCourse: string;
  /** Validity of an English certificate without a printed expiry, in years. */
  englishDefaultValidityYears: number;
  sources: SourceRef[];
}

/** A decision the student makes, such as the graduation track or a CLC specialization. */
export interface ProgramChoice {
  id: string;
  label: string;
  /** Graduation is not possible while a required choice is unset. */
  required: boolean;
  options: { id: string; label: string; note?: string }[];
}

export interface RuleContext {
  program: ProgramModule;
  record: StudentRecord;
  states: Map<string, CourseState>;
  /** Selected option of a program choice, or null. */
  choice: (id: string) => string | null;
}

/** Cumulative levels: earned ≤ inProgress ≤ planned, as the bucket bars render them. */
export interface GroupProgress {
  id: string;
  label: string;
  earned: number;
  inProgress: number;
  planned: number;
  required: number;
  /** Renders the target as "≈" — a guideline rather than a hard rule. */
  approx?: boolean;
  note?: string;
  satisfied: { earned: boolean; planned: boolean };
  /** Courses of this group that are not covered yet (for checklist details). */
  missing?: { earned: string[]; planned: string[] };
  /** Show this group as its own item on the graduation checklist. */
  checklist?: boolean;
  /** Warn in the planner when the plan leaves this group short. Default true; course-list groups
   *  and groups with their own warnings (e.g. graduation work) set it to false. */
  warn?: boolean;
}

export interface ProgressReport {
  groups: GroupProgress[];
  total: GroupProgress;
  satisfied: { earned: boolean; planned: boolean };
}

/** Why a course is worth taking; lower tiers come first in "what next". */
export interface CourseNeed {
  tier: number;
  label: string;
}

export interface ProgramModule {
  meta: ProgramMeta;
  courses: Course[];
  choices: ProgramChoice[];
  progress(ctx: RuleContext): ProgressReport;
  /** null when the course no longer serves an unmet requirement. */
  courseNeed(code: string, ctx: RuleContext): CourseNeed | null;
  /** Courses the suggested plan should add, most important first (scheduling is shared). */
  coursesToPlan(ctx: RuleContext): Course[];
  /** Graduation-checklist items specific to this program (credits items are generated centrally). */
  checklistItems(ctx: RuleContext): ChecklistItem[];
  /** Warnings specific to this program, e.g. graduation-track problems. */
  warnings(ctx: RuleContext): Warning[];
}

/** Kept as the name used throughout the engine. */
export type Program = ProgramModule;

export type Level = 'earned' | 'inProgress' | 'planned';
export const LEVELS: Level[] = ['earned', 'inProgress', 'planned'];

const COVERS: Record<Level, string[]> = {
  earned: ['passed'],
  inProgress: ['passed', 'in-progress'],
  planned: ['passed', 'in-progress', 'planned'],
};

/** Whether a course counts at the given projection level. */
export function isCovered(state: CourseState | undefined, level: Level): boolean {
  return !!state && COVERS[level].includes(state.status);
}

/** Builds a GroupProgress from a per-level credit function. */
export function group(
  id: string,
  label: string,
  required: number,
  credits: (level: Level) => number,
  extra: Partial<Pick<GroupProgress, 'approx' | 'note' | 'missing' | 'checklist' | 'warn'>> = {},
): GroupProgress {
  const earned = credits('earned');
  const inProgress = credits('inProgress');
  const planned = credits('planned');
  return {
    id, label, required, earned, inProgress, planned,
    satisfied: { earned: earned >= required, planned: planned >= required },
    ...extra,
  };
}

/** Sums the credits of the covered courses among `courses`. */
export function creditsOf(courses: Course[], states: Map<string, CourseState>, level: Level): number {
  return courses.filter((c) => isCovered(states.get(c.code), level)).reduce((sum, c) => sum + c.credits, 0);
}

export function buildContext(program: ProgramModule, record: StudentRecord, states: Map<string, CourseState>): RuleContext {
  return {
    program,
    record,
    states,
    choice: (id) => record.profile.choices[id] ?? null,
  };
}

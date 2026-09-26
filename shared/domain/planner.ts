import { courseIndex } from '../programs/index';
import { deriveCourseStates } from './courseState';
import { semesterStats } from './gpa';
import { prereqStatus } from './prereqs';
import { buildContext, type Program, type ProgressReport } from './program';
import { semesterLabel } from './semesters';
import type { Attempt, CourseState, StudentRecord, Warning } from './types';

/** The program's requirement report for a record. */
export function progressOf(program: Program, record: StudentRecord, states?: Map<string, CourseState>): ProgressReport {
  return program.progress(buildContext(program, record, states ?? deriveCourseStates(program, record.attempts)));
}

/**
 * Registered credits per semester, as QC1175 Art. 7.2 counts them for this programme: every attempt, or
 * without the courses outside the programme total when `limitCountsExtras` is false.
 */
export function semesterCredits(program: Program, attempts: Attempt[]): Map<number, number> {
  const index = courseIndex(program);
  const countsExtras = program.meta.limitCountsExtras ?? true;
  const totals = new Map<number, number>();
  for (const a of attempts) {
    const course = index.get(a.code);
    if (!course) continue;
    if (!countsExtras && course.countsInCredits === false) continue;
    totals.set(a.semester, (totals.get(a.semester) ?? 0) + course.credits);
  }
  return totals;
}

/** Semester a course is (or will be) done in: passed semester, else in-progress/planned semester. */
export function courseSemester(state: CourseState | undefined): number | null {
  return state?.passedSemester ?? state?.activeSemester ?? null;
}

export function planWarnings(program: Program, record: StudentRecord): Warning[] {
  const { profile, attempts } = record;
  const r = program.meta;
  const current = profile.currentSemester;
  const index = courseIndex(program);
  const states = deriveCourseStates(program, attempts);
  const label = (s: number) => semesterLabel(program, s);
  const warnings: Warning[] = [];

  // Registration limits for the current and future semesters.
  for (const [semester, credits] of semesterCredits(program, attempts)) {
    if (semester < current) continue;
    if (credits < r.semesterMin) {
      warnings.push({ id: `credits-low-${semester}`, severity: 'warning', semester, link: 'planner',
        message: `${label(semester)}: ${credits} credits is below the minimum of ${r.semesterMin}` });
    } else if (credits > r.semesterMax) {
      warnings.push({ id: `credits-high-${semester}`, severity: 'warning', semester, link: 'planner',
        message: `${label(semester)}: ${credits} credits is above the maximum of ${r.semesterMax}` });
    }
  }

  const activeByCode = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!index.has(a.code)) continue;
    if (a.status === 'completed') {
      if (a.semester > current) {
        warnings.push({ id: `graded-future-${a.id}`, severity: 'warning', code: a.code, semester: a.semester, link: 'courses',
          message: `${a.code} has a grade in a future semester (${label(a.semester)})` });
      }
      continue;
    }
    activeByCode.set(a.code, [...(activeByCode.get(a.code) ?? []), a]);

    if (a.status === 'in-progress' && a.semester < current) {
      warnings.push({ id: `needs-grade-${a.code}`, severity: 'warning', code: a.code, semester: a.semester, link: 'courses',
        message: `${a.code} is still in progress in ${label(a.semester)} — enter its grade` });
    } else if (a.status === 'in-progress' && a.semester > current) {
      warnings.push({ id: `in-progress-future-${a.code}`, severity: 'warning', code: a.code, semester: a.semester, link: 'planner',
        message: `${a.code} is marked in progress in a future semester (${label(a.semester)})` });
    } else if (a.status === 'planned' && a.semester <= current) {
      warnings.push({ id: `planned-past-${a.code}`, severity: 'warning', code: a.code, semester: a.semester, link: 'planner',
        message: `${a.code} is planned in ${label(a.semester)}, which is not a future semester` });
    }

    for (const p of prereqStatus(program, states, a.code, a.semester)) {
      if (p.status === 'ok') continue;
      warnings.push({
        id: `prereq-${a.code}-${p.code}`,
        severity: p.status === 'missing' ? 'warning' : 'info',
        code: a.code, semester: a.semester, link: 'planner',
        message: p.status === 'missing'
          ? `${a.code} (${label(a.semester)}): prior course ${p.code} is not taken in an earlier semester`
          : `${a.code} (${label(a.semester)}): prior course ${p.code} was taken but not passed`,
      });
    }

    if (states.get(a.code)?.status === 'passed') {
      warnings.push({ id: `retake-passed-${a.code}`, severity: 'info', code: a.code, semester: a.semester, link: 'planner',
        message: `${a.code} is already passed — this attempt counts as a grade improvement (the last grade becomes official)` });
    }
  }

  for (const [code, list] of activeByCode) {
    if (list.length > 1) {
      warnings.push({ id: `duplicate-${code}`, severity: 'warning', code, link: 'planner',
        message: `${code} is planned or in progress ${list.length} times` });
    }
  }

  warnings.push(...program.warnings(buildContext(program, record, states)));

  // Projected shortfalls with the whole plan, from the program's own requirement groups.
  const report = program.progress(buildContext(program, record, states));
  for (const g of [...report.groups, report.total]) {
    if (g.planned < g.required && !g.approx && g.warn !== false) {
      warnings.push({ id: `short-${g.id}`, severity: 'warning', link: 'planner',
        message: `${g.label}: ${g.planned} / ${g.required} credits even with the plan` });
    }
  }
  const missing = report.groups.flatMap((g) => g.missing?.planned ?? []);
  if (missing.length > 0) {
    warnings.push({ id: 'short-required', severity: 'warning', link: 'planner',
      message: `Required courses not passed or planned: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` +${missing.length - 8} more` : ''}` });
  }

  // Duplicate attempts of one course repeat per-course warnings; keep one per id (ids are React keys).
  const seen = new Set<string>();
  return warnings.filter((w) => !seen.has(w.id) && !!seen.add(w.id));
}

/** Academic warnings for finished semesters (QC1175 Art. 16.1). */
export function academicWarnings(program: Program, record: StudentRecord): Warning[] {
  const warnings: Warning[] = [];
  let accumulated = 0;
  for (const s of semesterStats(program, record.attempts, record.gpaOverrides)) {
    if (s.semester >= record.profile.currentSemester) break;
    const before = accumulated;
    accumulated += s.passedCredits;
    const label = semesterLabel(program, s.semester);
    if (s.passedCredits < 7 && before < 130) {
      warnings.push({ id: `academic-credits-${s.semester}`, severity: 'warning', semester: s.semester, link: 'courses',
        message: `${label}: only ${s.passedCredits} credits passed (academic warning below 7)` });
    }
    if (s.gpa10 !== null && s.gpa10 < 3) {
      warnings.push({ id: `academic-gpa-${s.semester}`, severity: 'warning', semester: s.semester, link: 'courses',
        message: `${label}: semester ĐTB ${s.gpa10.toFixed(2)} is below 3.0 (academic warning)` });
    }
  }
  return warnings;
}

/**
 * Earliest graduation semester: when the plan satisfies every credit requirement, the latest semester
 * holding an in-progress or planned course (or the current semester if none). Null if incomplete.
 */
export function earliestGraduation(program: Program, record: StudentRecord): number | null {
  const states = deriveCourseStates(program, record.attempts);
  if (!program.progress(buildContext(program, record, states)).satisfied.planned) return null;
  const active = record.attempts.filter((a) => a.status !== 'completed').map((a) => a.semester);
  return Math.max(record.profile.currentSemester, ...active);
}

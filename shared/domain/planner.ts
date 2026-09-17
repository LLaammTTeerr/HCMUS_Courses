import { courseIndex } from '../programs/index';
import { deriveCourseStates } from './courseState';
import { computeProgress, isCovered } from './credits';
import { semesterStats } from './gpa';
import { prereqStatus } from './prereqs';
import { semesterLabel } from './semesters';
import type { Attempt, CourseState, Program, StudentRecord, Warning } from './types';

/** Registered credits per semester (all attempts, including EXTRA courses — QC1175 Art. 7.2). */
export function semesterCredits(program: Program, attempts: Attempt[]): Map<number, number> {
  const index = courseIndex(program);
  const totals = new Map<number, number>();
  for (const a of attempts) {
    const course = index.get(a.code);
    if (course) totals.set(a.semester, (totals.get(a.semester) ?? 0) + course.credits);
  }
  return totals;
}

/** Semester a course is (or will be) done in: passed semester, else in-progress/planned semester. */
export function courseSemester(state: CourseState | undefined): number | null {
  return state?.passedSemester ?? state?.activeSemester ?? null;
}

export function planWarnings(program: Program, record: StudentRecord): Warning[] {
  const { profile, attempts } = record;
  const r = program.rules;
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

  warnings.push(...trackWarnings(program, record, states));

  // Projected shortfalls with the whole plan.
  const p = computeProgress(program, states, profile.gradTrack);
  const short = (id: string, name: string, value: number, required: number) => {
    if (value < required) {
      warnings.push({ id: `short-${id}`, severity: 'warning', link: 'planner',
        message: `${name}: ${value} / ${required} credits even with the plan` });
    }
  };
  short('total', 'Total', p.total.planned, r.totalCredits);
  short('a', 'Computer Science (A)', p.a.planned, r.aMin);
  short('b', 'Math electives (B)', p.b.planned, r.bMin);
  short('bc', 'B + C electives', p.bc.planned, r.bcMin);
  if (p.missingRequired.planned.length > 0) {
    const list = p.missingRequired.planned;
    warnings.push({ id: 'short-required', severity: 'warning', link: 'planner',
      message: `Required courses not passed or planned: ${list.slice(0, 8).join(', ')}${list.length > 8 ? ` +${list.length - 8} more` : ''}` });
  }

  // Duplicate attempts of one course repeat per-course warnings; keep one per id (ids are React keys).
  const seen = new Set<string>();
  return warnings.filter((w) => !seen.has(w.id) && !!seen.add(w.id));
}

function trackWarnings(program: Program, record: StudentRecord, states: Map<string, CourseState>): Warning[] {
  const { thesis, capstone } = program.rules;
  const track = record.profile.gradTrack;
  const covered = (code: string) => isCovered(states.get(code), 'planned');
  const touched = (code: string) => (states.get(code)?.attempts.length ?? 0) > 0;
  const warnings: Warning[] = [];

  if (track === 'thesis') {
    if (!thesis.every(covered)) {
      warnings.push({ id: 'track-thesis-missing', severity: 'warning', link: 'planner',
        message: `Thesis track: plan ${thesis.join(', ')}` });
    }
    for (const code of capstone.filter(touched)) {
      warnings.push({ id: `track-other-${code}`, severity: 'warning', code, link: 'planner',
        message: `${code} belongs to the capstone track, but the track is set to thesis` });
    }
  } else if (track === 'capstone') {
    if (!capstone.every(covered)) {
      warnings.push({ id: 'track-capstone-missing', severity: 'warning', link: 'planner',
        message: `Capstone track: plan both ${capstone.join(' and ')} (${capstone[0]} alone earns no credit)` });
    }
    for (const code of thesis.filter(touched)) {
      warnings.push({ id: `track-other-${code}`, severity: 'warning', code, link: 'planner',
        message: `${code} belongs to the thesis track, but the track is set to capstone` });
    }
  } else if (!thesis.every(covered) && !capstone.every(covered)) {
    warnings.push({ id: 'track-undecided', severity: 'info', link: 'planner',
      message: 'Graduation work: choose thesis (CS468) or capstone (CS469 + CS470)' });
  }

  const [first, second] = capstone;
  const s1 = courseSemester(states.get(first));
  const s2 = courseSemester(states.get(second));
  if (s2 !== null && (s1 === null || s2 <= s1)) {
    warnings.push({ id: 'capstone-order', severity: 'error', code: second, link: 'planner',
      message: `${second} must be taken in a semester after ${first} (${first} must be completed first)` });
  }
  return warnings;
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
  if (!computeProgress(program, states, record.profile.gradTrack).satisfied.planned) return null;
  const active = record.attempts.filter((a) => a.status !== 'completed').map((a) => a.semester);
  return Math.max(record.profile.currentSemester, ...active);
}

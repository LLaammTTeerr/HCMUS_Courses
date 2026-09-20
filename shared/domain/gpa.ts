import { courseIndex } from '../programs/index';
import { PASS_GRADE } from './courseState';
import type { Program } from './program';
import type { Attempt, CourseState, GpaOverrides } from './types';

/** Converts a 10-point grade to the 4-point scale (QĐ651/QĐ-KHTN, 2024). */
export function to4(grade10: number): number {
  if (grade10 >= 9) return 4;
  if (grade10 < 3) return 0;
  return 1 + (grade10 - 3) * 0.5;
}

/** Academic ranking for intakes from 2021 (QC1175 Art. 15.2b). */
export function rank(gpa10: number | null): string {
  if (gpa10 === null) return '—';
  if (gpa10 >= 9) return 'Xuất sắc';
  if (gpa10 >= 8) return 'Giỏi';
  if (gpa10 >= 7) return 'Khá';
  if (gpa10 >= 5) return 'Trung bình';
  if (gpa10 >= 4) return 'Yếu';
  return 'Kém';
}

/** Program default from the course data (QC1175 Art. 15.1c). */
export function defaultCountsInGpa(program: Program, code: string): boolean {
  const course = courseIndex(program).get(code);
  if (!course) return false;
  return course.countsInGpa ?? true;
}

/**
 * Whether a course counts toward ĐTB and graduation classification. Art. 15.1c also allows "other
 * courses as specified by the program", so the student can override the default per course.
 */
export function countsInGpa(program: Program, code: string, overrides: GpaOverrides = {}): boolean {
  return overrides[code] ?? defaultCountsInGpa(program, code);
}

export interface GpaSummary {
  /** ĐTB tích lũy — passed courses only. */
  gpa10: number | null;
  gpa4: number | null;
  /** Credits included in gpa10. */
  credits: number;
  /** ĐTB — all graded courses including failed ones. */
  allGpa10: number | null;
  /** Graded courses left out of the GPA (defaults and overrides), sorted. */
  excluded: string[];
}

export function cumulativeGpa(program: Program, states: Map<string, CourseState>, overrides: GpaOverrides = {}): GpaSummary {
  const index = courseIndex(program);
  let credits = 0, sum10 = 0, sum4 = 0, allCredits = 0, allSum = 0;
  const excluded: string[] = [];
  for (const s of states.values()) {
    if (s.officialGrade === null) continue;
    if (!countsInGpa(program, s.code, overrides)) {
      excluded.push(s.code);
      continue;
    }
    const cr = index.get(s.code)!.credits;
    allCredits += cr;
    allSum += s.officialGrade * cr;
    if (s.officialGrade >= PASS_GRADE) {
      credits += cr;
      sum10 += s.officialGrade * cr;
      sum4 += to4(s.officialGrade) * cr;
    }
  }
  return {
    gpa10: credits ? sum10 / credits : null,
    gpa4: credits ? sum4 / credits : null,
    credits,
    allGpa10: allCredits ? allSum / allCredits : null,
    excluded: excluded.sort(),
  };
}

export interface SemesterStat {
  semester: number;
  attemptedCredits: number;
  passedCredits: number;
  gpa10: number | null;
}

/**
 * Per-semester results over completed attempts (for academic warnings, Art. 16). Credits exclude
 * EXTRA courses; the semester ĐTB also leaves out courses that do not count toward the GPA.
 */
export function semesterStats(program: Program, attempts: Attempt[], overrides: GpaOverrides = {}): SemesterStat[] {
  const index = courseIndex(program);
  const bySemester = new Map<number, SemesterStat & { sum: number; gpaCredits: number }>();
  for (const a of attempts) {
    const course = index.get(a.code);
    if (a.status !== 'completed' || a.grade10 === null || !course) continue;
    const inGpa = countsInGpa(program, a.code, overrides);
    const inCredits = course.countsInCredits ?? true;
    if (!inCredits && !inGpa) continue;
    const s = bySemester.get(a.semester) ??
      { semester: a.semester, attemptedCredits: 0, passedCredits: 0, gpa10: null, sum: 0, gpaCredits: 0 };
    if (inCredits) {
      s.attemptedCredits += course.credits;
      if (a.grade10 >= PASS_GRADE) s.passedCredits += course.credits;
    }
    if (inGpa) {
      s.sum += a.grade10 * course.credits;
      s.gpaCredits += course.credits;
    }
    bySemester.set(a.semester, s);
  }
  return [...bySemester.values()]
    .sort((a, b) => a.semester - b.semester)
    .map(({ sum, gpaCredits, ...s }) => ({ ...s, gpa10: gpaCredits ? sum / gpaCredits : null }));
}

/** Study-year level from accumulated credits (Art. 15.3, 38 credits per year). */
export function yearLevel(accumulatedCredits: number): number {
  return Math.min(4, Math.floor(accumulatedCredits / 38) + 1);
}

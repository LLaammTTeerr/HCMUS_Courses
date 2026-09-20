import type { Program } from './program';

function parts(program: Program, n: number) {
  const perYear = program.meta.semestersPerYear;
  return { term: ((n - 1) % perYear) + 1, year: program.meta.intakeYear + Math.floor((n - 1) / perYear) };
}

/** "HK1 2026–2027" for semester 7 of a 2024 intake. */
export function semesterLabel(program: Program, n: number): string {
  const { term, year } = parts(program, n);
  return `HK${term} ${year}–${year + 1}`;
}

/**
 * Semester number that contains `today` for this program's intake, clamped to the allowed range.
 * HK1 starts in September, HK2 in January, HK3 in May.
 */
export function currentSemesterOn(program: Program, today = new Date()): number {
  const { intakeYear, semestersPerYear, maxSemesters } = program.meta;
  const month = today.getMonth() + 1;
  const term = month >= 9 ? 1 : month >= 5 ? 3 : 2;
  const academicYear = month >= 9 ? today.getFullYear() : today.getFullYear() - 1;
  const index = (academicYear - intakeYear) * semestersPerYear + term;
  return Math.min(maxSemesters, Math.max(1, index));
}

/** Approximate last day of a semester (HK1 Sep–Dec, HK2 Jan–Apr, HK3 May–Aug), ISO date. */
export function semesterEndDate(program: Program, n: number): string {
  const { term, year } = parts(program, n);
  if (term === 1) return `${year}-12-31`;
  if (term === 2) return `${year + 1}-04-30`;
  return `${year + 1}-08-31`;
}

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

/** Approximate last day of a semester (HK1 Sep–Dec, HK2 Jan–Apr, HK3 May–Aug), ISO date. */
export function semesterEndDate(program: Program, n: number): string {
  const { term, year } = parts(program, n);
  if (term === 1) return `${year}-12-31`;
  if (term === 2) return `${year + 1}-04-30`;
  return `${year + 1}-08-31`;
}

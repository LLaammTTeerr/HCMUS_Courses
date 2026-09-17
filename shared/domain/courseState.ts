import { courseIndex } from '../programs/index';
import type { Attempt, CourseState, Program } from './types';

export const PASS_GRADE = 5;

const byChronology = (a: Attempt, b: Attempt) => a.semester - b.semester || a.id - b.id;

/**
 * Derives the state of every course in the program from its attempts (QC1175 Art. 14: the latest
 * attempt is official). Precedence: passed > in-progress > planned > failed > not-taken.
 */
export function deriveCourseStates(program: Program, attempts: Attempt[]): Map<string, CourseState> {
  const index = courseIndex(program);
  const grouped = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!index.has(a.code)) continue;
    const list = grouped.get(a.code) ?? [];
    list.push(a);
    grouped.set(a.code, list);
  }

  const states = new Map<string, CourseState>();
  for (const course of program.courses) {
    const list = (grouped.get(course.code) ?? []).sort(byChronology);
    const completed = list.filter((a) => a.status === 'completed' && a.grade10 !== null);
    const latest = completed.at(-1);
    const officialGrade = latest?.grade10 ?? null;
    const passed = officialGrade !== null && officialGrade >= PASS_GRADE;
    const inProg = list.find((a) => a.status === 'in-progress');
    const plan = list.find((a) => a.status === 'planned');

    const status = passed ? 'passed'
      : inProg ? 'in-progress'
      : plan ? 'planned'
      : latest ? 'failed'
      : 'not-taken';

    states.set(course.code, {
      code: course.code,
      status,
      officialGrade,
      passedSemester: passed ? latest!.semester : null,
      activeSemester: inProg?.semester ?? plan?.semester ?? null,
      attempts: list,
    });
  }
  return states;
}

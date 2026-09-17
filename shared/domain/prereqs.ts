import { courseIndex } from '../programs/index';
import { PASS_GRADE } from './courseState';
import type { CourseState, Program } from './types';

export type PrereqLevel = 'ok' | 'weak' | 'missing';

export interface PrereqResult {
  code: string;
  status: PrereqLevel;
}

/**
 * Checks the prior courses ("học phần học trước", QC1175 Art. 3.1c) of `code` if taken in `semester`.
 * A prior course counts when it has an attempt in an earlier semester that passed, is in progress,
 * or is planned; an earlier attempt that only failed is `weak`. Soft rule — never blocks.
 */
export function prereqStatus(
  program: Program,
  states: Map<string, CourseState>,
  code: string,
  semester: number,
): PrereqResult[] {
  const course = courseIndex(program).get(code);
  if (!course) return [];
  return course.prereqs.map((p) => {
    const earlier = (states.get(p)?.attempts ?? []).filter((a) => a.semester < semester);
    if (earlier.length === 0) return { code: p, status: 'missing' };
    const counts = earlier.some(
      (a) => a.status !== 'completed' || (a.grade10 !== null && a.grade10 >= PASS_GRADE),
    );
    return { code: p, status: counts ? 'ok' : 'weak' };
  });
}

/** Courses that list `code` as a prior course. */
export function dependents(program: Program, code: string): string[] {
  return program.courses.filter((c) => c.prereqs.includes(code)).map((c) => c.code);
}

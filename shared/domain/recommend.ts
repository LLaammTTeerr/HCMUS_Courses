import { deriveCourseStates } from './courseState';
import { buildContext, type Program } from './program';
import { dependents, prereqStatus } from './prereqs';
import type { StudentRecord } from './types';

export interface Recommendation {
  code: string;
  /** From the program module: lower is more urgent, 0 = required. */
  tier: number;
  unlocks: number;
  reason: string;
}

/**
 * Courses that can be taken in `target`: not passed, not in progress or planned, prior courses taken
 * in an earlier semester. Ranked by the requirement they fill (the program decides), how many courses
 * they unlock, and the official suggested semester.
 */
export function recommend(program: Program, record: StudentRecord, target: number): Recommendation[] {
  const states = deriveCourseStates(program, record.attempts);
  const ctx = buildContext(program, record, states);

  const list = program.courses.flatMap((course) => {
    const state = states.get(course.code)!;
    if (state.status !== 'not-taken' && state.status !== 'failed') return [];
    if (course.requirement === 'graduation' && target < program.meta.gradEarliestSemester) return [];
    const prereqs = prereqStatus(program, states, course.code, target);
    if (prereqs.some((p) => p.status === 'missing')) return [];
    const need = program.courseNeed(course.code, ctx);
    if (!need) return [];

    const unlocks = dependents(program, course.code).filter((d) => states.get(d)!.status !== 'passed').length;
    const parts = [need.label];
    if (unlocks > 0) parts.push(`unlocks ${unlocks}`);
    if (state.status === 'failed') parts.push('retake');
    for (const p of prereqs.filter((x) => x.status === 'weak')) parts.push(`prior course ${p.code} not passed`);
    return [{ code: course.code, tier: need.tier, unlocks, reason: parts.join(' · '), suggested: course.suggestedSemester ?? 99 }];
  });

  return list
    .sort((a, b) => a.tier - b.tier || b.unlocks - a.unlocks || a.suggested - b.suggested || a.code.localeCompare(b.code))
    .map(({ suggested: _suggested, ...rest }) => rest);
}

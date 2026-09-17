import { deriveCourseStates } from './courseState';
import { computeProgress, REQUIRED_BUCKETS } from './credits';
import { dependents, prereqStatus } from './prereqs';
import type { Program, StudentRecord } from './types';

export interface Recommendation {
  code: string;
  /** 0 required · 1 A elective (A short) · 2 B (B short) · 3 counts toward B + C (short) · 4 surplus */
  tier: number;
  unlocks: number;
  reason: string;
}

const TIER_LABELS = ['required', 'A elective needed', 'math elective needed', 'counts toward B + C', 'extra (requirement already covered)'];

/**
 * Courses that can be taken in `target`: not passed, not in progress or planned, prior courses taken
 * in an earlier semester. Ranked by the requirement they fill, how many courses they unlock, and the
 * official suggested semester.
 */
export function recommend(program: Program, record: StudentRecord, target: number): Recommendation[] {
  const r = program.rules;
  const { gradTrack } = record.profile;
  const states = deriveCourseStates(program, record.attempts);
  const progress = computeProgress(program, states, gradTrack);

  const allowedGrad = gradTrack === 'thesis' ? r.thesis : gradTrack === 'capstone' ? [...r.capstone] : [...r.thesis, ...r.capstone];

  const tierOf = (bucket: string) => {
    if (REQUIRED_BUCKETS.includes(bucket as never) || bucket === 'GRAD') return 0;
    if (bucket === 'A_ELEC' && progress.a.planned < r.aMin) return 1;
    if (bucket === 'B' && progress.b.planned < r.bMin) return 2;
    if (['A_ELEC', 'B', 'C'].includes(bucket) && progress.bc.planned < r.bcMin) return 3;
    return 4;
  };

  const list = program.courses.flatMap((course) => {
    const state = states.get(course.code)!;
    if (state.status !== 'not-taken' && state.status !== 'failed') return [];
    if (course.bucket === 'GRAD' && (target < r.gradEarliestSemester || !allowedGrad.includes(course.code))) return [];
    const prereqs = prereqStatus(program, states, course.code, target);
    if (prereqs.some((p) => p.status === 'missing')) return [];

    const tier = tierOf(course.bucket);
    const unlocks = dependents(program, course.code).filter((d) => states.get(d)!.status !== 'passed').length;
    const parts = [TIER_LABELS[tier]];
    if (unlocks > 0) parts.push(`unlocks ${unlocks}`);
    if (state.status === 'failed') parts.push('retake');
    for (const p of prereqs.filter((x) => x.status === 'weak')) parts.push(`prior course ${p.code} not passed`);
    return [{ code: course.code, tier, unlocks, reason: parts.join(' · '), suggested: course.suggestedSemester ?? 99 }];
  });

  return list
    .sort((a, b) => a.tier - b.tier || b.unlocks - a.unlocks || a.suggested - b.suggested || a.code.localeCompare(b.code))
    .map(({ suggested: _suggested, ...rest }) => rest);
}

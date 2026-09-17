import { courseIndex } from '../programs/index';
import type { BucketId, CourseState, CourseStatus, GradTrack, Program } from './types';

/**
 * Credit progress per bucket (CTĐT §6–7). Each amount has three cumulative levels:
 * earned (passed) ≤ inProgress (+ in-progress) ≤ planned (+ planned).
 */
export interface Amount {
  earned: number;
  inProgress: number;
  planned: number;
}

export interface BucketProgress extends Amount {
  required: number;
}

export interface Progress {
  aReq: BucketProgress;
  aElec: BucketProgress;
  /** A_REQ + A_ELEC; requirement aMin. */
  a: BucketProgress;
  nonCs: BucketProgress;
  math: BucketProgress;
  phys: BucketProgress;
  b: BucketProgress;
  /** C including the A overflow; `required` is the guideline B+C min − B min. */
  c: BucketProgress;
  bc: BucketProgress;
  grad: BucketProgress;
  total: BucketProgress;
  overflowA: Amount;
  /** Individually required courses (A_REQ, NONCS, MATH, PHYS, EXTRA) not covered at the level. */
  missingRequired: { earned: string[]; planned: string[] };
  satisfied: { earned: boolean; planned: boolean };
}

export type Level = keyof Amount;
const COVERS: Record<Level, CourseStatus[]> = {
  earned: ['passed'],
  inProgress: ['passed', 'in-progress'],
  planned: ['passed', 'in-progress', 'planned'],
};

export const REQUIRED_BUCKETS: BucketId[] = ['A_REQ', 'NONCS', 'MATH', 'PHYS', 'EXTRA'];

export function isCovered(state: CourseState | undefined, level: Level): boolean {
  return !!state && COVERS[level].includes(state.status);
}

export function computeProgress(program: Program, states: Map<string, CourseState>, track: GradTrack): Progress {
  const r = program.rules;
  const index = courseIndex(program);

  const sumBucket = (bucket: BucketId, level: Level) =>
    program.courses
      .filter((c) => c.bucket === bucket && isCovered(states.get(c.code), level))
      .reduce((s, c) => s + c.credits, 0);

  const gradCredits = (level: Level) => {
    const covered = (code: string) => isCovered(states.get(code), level);
    const thesis = r.thesis.every(covered) ? r.thesis.reduce((s, c) => s + index.get(c)!.credits, 0) : 0;
    const capstone = r.capstone.every(covered) ? r.capstone.reduce((s, c) => s + index.get(c)!.credits, 0) : 0;
    const value = track === 'thesis' ? thesis : track === 'capstone' ? capstone : Math.max(thesis, capstone);
    return Math.min(value, r.gradCredits);
  };

  const build = (required: number, fn: (level: Level) => number): BucketProgress => ({
    required,
    earned: fn('earned'),
    inProgress: fn('inProgress'),
    planned: fn('planned'),
  });

  const aOf = (l: Level) => sumBucket('A_REQ', l) + sumBucket('A_ELEC', l);
  const overflowOf = (l: Level) => Math.max(0, aOf(l) - r.aMin);
  const cOf = (l: Level) => sumBucket('C', l) + overflowOf(l);
  const bcOf = (l: Level) => sumBucket('B', l) + cOf(l);

  const progress: Omit<Progress, 'total' | 'missingRequired' | 'satisfied'> = {
    aReq: build(r.aReqCredits, (l) => sumBucket('A_REQ', l)),
    aElec: build(r.aMin - r.aReqCredits, (l) => sumBucket('A_ELEC', l)),
    a: build(r.aMin, aOf),
    nonCs: build(bucketCredits(program, 'NONCS'), (l) => sumBucket('NONCS', l)),
    math: build(bucketCredits(program, 'MATH'), (l) => sumBucket('MATH', l)),
    phys: build(bucketCredits(program, 'PHYS'), (l) => sumBucket('PHYS', l)),
    b: build(r.bMin, (l) => sumBucket('B', l)),
    c: build(r.bcMin - r.bMin, cOf),
    bc: build(r.bcMin, bcOf),
    grad: build(r.gradCredits, gradCredits),
    overflowA: { earned: overflowOf('earned'), inProgress: overflowOf('inProgress'), planned: overflowOf('planned') },
  };

  const totalOf = (l: Level) =>
    aOf(l) + sumBucket('NONCS', l) + sumBucket('MATH', l) + sumBucket('PHYS', l) + sumBucket('B', l) +
    sumBucket('C', l) + gradCredits(l);
  const total = build(r.totalCredits, totalOf);

  const missingAt = (l: Level) =>
    program.courses
      .filter((c) => REQUIRED_BUCKETS.includes(c.bucket) && !isCovered(states.get(c.code), l))
      .map((c) => c.code);

  const satisfiedAt = (l: Level, missing: string[]) =>
    missing.length === 0 &&
    progress.a[l] >= r.aMin &&
    progress.b[l] >= r.bMin &&
    progress.bc[l] >= r.bcMin &&
    progress.grad[l] >= r.gradCredits &&
    total[l] >= r.totalCredits;

  const missingEarned = missingAt('earned');
  const missingPlanned = missingAt('planned');
  return {
    ...progress,
    total,
    missingRequired: { earned: missingEarned, planned: missingPlanned },
    satisfied: { earned: satisfiedAt('earned', missingEarned), planned: satisfiedAt('planned', missingPlanned) },
  };
}

function bucketCredits(program: Program, bucket: BucketId): number {
  return program.courses.filter((c) => c.bucket === bucket).reduce((s, c) => s + c.credits, 0);
}

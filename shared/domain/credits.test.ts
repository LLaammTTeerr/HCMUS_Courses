import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from './courseState';
import { computeProgress } from './credits';
import { codesIn, done, inProgress, passAll, planned, program } from './testUtils';
import type { Attempt, GradTrack } from './types';

const progress = (attempts: Attempt[], track: GradTrack = 'undecided') =>
  computeProgress(program, deriveCourseStates(program, attempts), track);

const C = codesIn('C');

describe('computeProgress', () => {
  it('has no A overflow at exactly 56', () => {
    const p = progress(passAll([...codesIn('A_REQ'), 'CS251', 'CS252', 'CS311', 'CS320']));
    expect(p.a.earned).toBe(56);
    expect(p.overflowA.earned).toBe(0);
    expect(p.c.earned).toBe(0);
  });

  it('moves A surplus to C and B+C (64 in A → 8 overflow)', () => {
    const attempts = passAll([...codesIn('A_REQ'), ...codesIn('A_ELEC'), 'MTH253', 'MTH344', ...C.slice(0, 7)]);
    const p = progress(attempts);
    expect(p.a.earned).toBe(64);
    expect(p.overflowA.earned).toBe(8);
    expect(p.b.earned).toBe(8);
    expect(p.c.earned).toBe(7 * 4 + 8);
    expect(p.bc.earned).toBe(8 + 28 + 8);
  });

  it('keeps B < 8 unsatisfied even when B + C ≥ 43', () => {
    const p = progress(passAll(['MTH253', ...C.slice(0, 10)]));
    expect(p.bc.earned).toBe(44);
    expect(p.b.earned).toBe(4);
    expect(p.b.earned < p.b.required).toBe(true);
  });

  it('counts capstone only when both parts pass', () => {
    expect(progress(passAll(['CS469']), 'capstone').grad.earned).toBe(0);
    expect(progress(passAll(['CS469', 'CS470']), 'capstone').grad.earned).toBe(10);
  });

  it('caps graduation work at 10 and respects the chosen track', () => {
    const attempts = passAll(['CS468', 'CS469', 'CS470']);
    expect(progress(attempts).grad.earned).toBe(10);
    expect(progress(passAll(['CS468']), 'capstone').grad.earned).toBe(0);
    expect(progress(passAll(['CS469', 'CS470']), 'thesis').grad.earned).toBe(0);
  });

  it('counts a failed-then-passed course once', () => {
    const p = progress([done('CS160', 1, 3), done('CS160', 2, 7)]);
    expect(p.a.earned).toBe(4);
    expect(p.total.earned).toBe(4);
  });

  it('projects in-progress and planned credits cumulatively', () => {
    const p = progress([done('CS160', 1, 8), inProgress('CS163', 7), planned('CS202', 8)]);
    expect(p.a).toMatchObject({ earned: 4, inProgress: 8, planned: 12, required: 56 });
  });

  it('excludes EXTRA courses from the total but tracks them as required', () => {
    const p = progress(passAll(['BAA00021', 'BAA00022', 'BAA00030']));
    expect(p.total.earned).toBe(0);
    expect(p.missingRequired.earned).not.toContain('BAA00021');
    expect(p.missingRequired.earned).toContain('CS160');
  });

  it('is satisfied by a complete graduation set', () => {
    const attempts = passAll([
      ...codesIn('A_REQ', 'NONCS', 'MATH', 'PHYS', 'EXTRA'),
      'CS350', 'CS320', 'CS311', 'CS251', 'MTH253', 'STAT452', ...C.slice(0, 9), 'CS468',
    ]);
    const p = progress(attempts, 'thesis');
    expect(p.total.earned).toBe(40 + 16 + 26 + 16 + 12 + 8 + 36 + 10);
    expect(p.bc.earned).toBe(44);
    expect(p.satisfied.earned).toBe(true);
    expect(progress(attempts.slice(1), 'thesis').satisfied.earned).toBe(false);
  });
});

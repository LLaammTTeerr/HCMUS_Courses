import { describe, expect, it } from 'vitest';
import { academicWarnings, earliestGraduation, planWarnings, semesterCredits } from './planner';
import { codesIn, done, inProgress, passAll, planned, program, record } from './testUtils';
import type { Attempt, StudentRecord } from './types';

const ids = (r: StudentRecord) => planWarnings(program, r).map((w) => w.id);
const withBaseline = (attempts: Attempt[]) => [...passAll(['CS160', 'CS163', 'CS202', 'CS250', 'MTH251', 'MTH252', 'CS201'], 1), ...attempts];

describe('semester credit limits', () => {
  const fill = (n: number, sem = 8) => codesIn('C').filter((c) => !['CS404', 'CS423', 'CS433', 'CS424', 'CS416', 'CS421', 'CS407', 'CS409', 'CS419'].includes(c)).slice(0, n).map((c) => planned(c, sem));

  it('flags 9 credits in a future semester', () => {
    const r = record(withBaseline([planned('CS420', 8), planned('BAA00004', 8), planned('BAA00102', 8)]));
    expect(semesterCredits(program, r.attempts).get(8)).toBe(9);
    expect(ids(r)).toContain('credits-low-8');
  });

  it('accepts 22 and flags 23', () => {
    const base = withBaseline([...fill(4), planned('BAA00101', 8), planned('BAA00004', 8)]);
    expect(semesterCredits(program, base).get(8)).toBe(22);
    expect(ids(record(base))).not.toContain('credits-high-8');
    const over = withBaseline([...fill(5), planned('BAA00101', 8)]);
    expect(semesterCredits(program, over).get(8)).toBe(23);
    expect(ids(record(over))).toContain('credits-high-8');
  });

  it('ignores past semesters and empty future ones', () => {
    const r = record([done('CS160', 1, 8)]);
    expect(ids(r).some((id) => id.startsWith('credits-'))).toBe(false);
  });
});

describe('plan warnings', () => {
  it('warns about a missing prior course for a planned course', () => {
    const r = record([planned('CS163', 8)]);
    expect(planWarnings(program, r)).toContainEqual(expect.objectContaining({ id: 'prereq-CS163-CS160', severity: 'warning' }));
  });

  it('marks a failed prior course as info', () => {
    const r = record([done('CS160', 1, 2), planned('CS163', 8)]);
    expect(planWarnings(program, r)).toContainEqual(expect.objectContaining({ id: 'prereq-CS163-CS160', severity: 'info' }));
  });

  it('errors when CS470 is not after CS469 on the capstone track', () => {
    const r = record([planned('CS469', 11), planned('CS470', 11)], { choices: { gradTrack: 'capstone' } });
    expect(planWarnings(program, r)).toContainEqual(expect.objectContaining({ id: 'capstone-order', severity: 'error' }));
    const ok = record([planned('CS469', 11), planned('CS470', 12)], { choices: { gradTrack: 'capstone' } });
    expect(ids(ok)).not.toContain('capstone-order');
  });

  it('warns when the thesis track has no CS468 and when the other track is planned', () => {
    const r = record([planned('CS469', 11)], { choices: { gradTrack: 'thesis' } });
    expect(ids(r)).toEqual(expect.arrayContaining(['track-thesis-missing', 'track-other-CS469']));
  });

  it('notes a planned retake of a passed course as info', () => {
    const r = record([done('CS160', 1, 6), planned('CS160', 8)]);
    expect(planWarnings(program, r)).toContainEqual(expect.objectContaining({ id: 'retake-passed-CS160', severity: 'info' }));
  });

  it('flags duplicate active attempts and past planned/in-progress attempts', () => {
    const r = record([planned('CS160', 8), planned('CS160', 9), inProgress('CS250', 6), planned('CS252', 5)]);
    expect(ids(r)).toEqual(expect.arrayContaining(['duplicate-CS160', 'needs-grade-CS250', 'planned-past-CS252']));
  });

  it('gives every warning a unique id even when a course is planned twice', () => {
    const r = record([planned('CS350', 8), planned('CS350', 8), done('CS160', 1, 6), planned('CS160', 9), planned('CS160', 10)]);
    const all = planWarnings(program, r).map((w) => w.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(['duplicate-CS350', 'prereq-CS350-MTH251', 'retake-passed-CS160']));
  });

  it('reports projected bucket shortfalls', () => {
    expect(ids(record([]))).toEqual(expect.arrayContaining(['short-total', 'short-a', 'short-b', 'short-bc', 'short-required']));
  });
});

describe('academicWarnings (Art. 16)', () => {
  it('flags semesters with < 7 passed credits or ĐTB < 3.0', () => {
    const r = record([done('CS160', 1, 8), done('CS163', 1, 2), done('CS202', 2, 2), done('CS250', 2, 2), done('MTH251', 3, 8), done('MTH252', 3, 8)]);
    expect(academicWarnings(program, r).map((w) => w.id)).toEqual(['academic-credits-1', 'academic-credits-2', 'academic-gpa-2']);
  });
});

describe('earliestGraduation', () => {
  const complete = () => [
    ...passAll([...codesIn('A_REQ', 'NONCS', 'MATH', 'PHYS', 'EXTRA'), 'CS350', 'CS320', 'CS311', 'CS251', 'MTH253', 'STAT452'], 5),
    ...codesIn('C').slice(0, 7).map((c) => done(c, 6, 8)),
    planned('CS434', 9), planned('CS435', 10), planned('CS468', 12),
  ];

  it('is the last planned semester when the plan satisfies every requirement', () => {
    expect(earliestGraduation(program, record(complete(), { choices: { gradTrack: 'thesis' } }))).toBe(12);
  });

  it('is null when the plan is incomplete', () => {
    expect(earliestGraduation(program, record(complete().slice(1), { choices: { gradTrack: 'thesis' } }))).toBeNull();
  });
});

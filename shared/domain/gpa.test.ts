import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from './courseState';
import { cumulativeGpa, rank, semesterStats, to4, yearLevel } from './gpa';
import { done, inProgress, program } from './testUtils';

describe('to4 (QĐ651)', () => {
  it.each([
    [10, 4], [9.0, 4], [8.9, 3.95], [8.0, 3.5], [5.0, 2], [3.0, 1], [2.9, 0], [0, 0],
  ])('%d → %d', (g, expected) => {
    expect(to4(g)).toBeCloseTo(expected, 10);
  });
});

describe('rank (QC1175 Art. 15.2b)', () => {
  it.each([
    [9.0, 'Xuất sắc'], [8.99, 'Giỏi'], [8, 'Giỏi'], [7.99, 'Khá'], [7, 'Khá'],
    [6.99, 'Trung bình'], [5, 'Trung bình'], [4.99, 'Yếu'], [4, 'Yếu'], [3.99, 'Kém'],
  ])('%d → %s', (g, expected) => {
    expect(rank(g)).toBe(expected);
  });
  it('is empty without a GPA', () => expect(rank(null)).toBe('—'));
});

describe('cumulativeGpa', () => {
  it('weights passed courses by credits and excludes failed and EXTRA courses', () => {
    const states = deriveCourseStates(program, [
      done('CS160', 1, 8),      // 4 cr
      done('BAA00004', 2, 6),   // 3 cr
      done('CS163', 2, 3),      // failed → excluded
      done('BAA00030', 1, 10),  // EXTRA → excluded
      inProgress('CS202', 7),
    ]);
    const g = cumulativeGpa(program, states);
    expect(g.credits).toBe(7);
    expect(g.gpa10).toBeCloseTo((8 * 4 + 6 * 3) / 7, 10);
    expect(g.gpa4).toBeCloseTo((3.5 * 4 + 2.5 * 3) / 7, 10);
    expect(g.allGpa10).toBeCloseTo((8 * 4 + 6 * 3 + 3 * 4) / 11, 10);
  });

  it('returns nulls when nothing is graded', () => {
    expect(cumulativeGpa(program, deriveCourseStates(program, []))).toEqual({
      gpa10: null, gpa4: null, credits: 0, allGpa10: null,
    });
  });
});

describe('semesterStats', () => {
  it('computes per-semester passed credits and ĐTB over completed attempts (EXTRA excluded)', () => {
    const stats = semesterStats(program, [done('CS160', 1, 8), done('MTH251', 1, 2), done('BAA00030', 1, 9), done('CS163', 2, 7)]);
    expect(stats).toEqual([
      { semester: 1, attemptedCredits: 8, passedCredits: 4, gpa10: 5 },
      { semester: 2, attemptedCredits: 4, passedCredits: 4, gpa10: 7 },
    ]);
  });
});

describe('yearLevel (Art. 15.3)', () => {
  it.each([[0, 1], [37, 1], [38, 2], [75, 2], [76, 3], [113, 3], [114, 4]])('%d cr → year %d', (n, y) => {
    expect(yearLevel(n)).toBe(y);
  });
});

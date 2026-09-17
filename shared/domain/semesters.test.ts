import { describe, expect, it } from 'vitest';
import { semesterEndDate, semesterLabel } from './semesters';
import { program } from './testUtils';

describe('semesters', () => {
  it('labels semesters from the intake year', () => {
    expect(semesterLabel(program, 1)).toBe('HK1 2024–2025');
    expect(semesterLabel(program, 3)).toBe('HK3 2024–2025');
    expect(semesterLabel(program, 7)).toBe('HK1 2026–2027');
    expect(semesterLabel(program, 12)).toBe('HK3 2027–2028');
  });

  it('approximates semester end dates', () => {
    expect(semesterEndDate(program, 7)).toBe('2026-12-31');
    expect(semesterEndDate(program, 8)).toBe('2027-04-30');
    expect(semesterEndDate(program, 12)).toBe('2028-08-31');
  });
});

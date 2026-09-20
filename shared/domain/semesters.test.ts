import { describe, expect, it } from 'vitest';
import { currentSemesterOn, semesterEndDate, semesterLabel } from './semesters';
import { program } from './testUtils';

describe('semesters', () => {
  it('labels semesters from the intake year', () => {
    expect(semesterLabel(program, 1)).toBe('HK1 2024–2025');
    expect(semesterLabel(program, 3)).toBe('HK3 2024–2025');
    expect(semesterLabel(program, 7)).toBe('HK1 2026–2027');
    expect(semesterLabel(program, 12)).toBe('HK3 2027–2028');
  });

  it('maps a date to the semester of the intake', () => {
    // September 2026: an APCS 2024 student is in semester 7, a 2026 intake starts at semester 1.
    expect(currentSemesterOn(program, new Date('2026-09-20'))).toBe(7);
    expect(currentSemesterOn(program, new Date('2027-02-10'))).toBe(8);   // HK2 of 2026–2027
    expect(currentSemesterOn(program, new Date('2027-06-10'))).toBe(9);   // HK3
    expect(currentSemesterOn(program, new Date('2024-09-05'))).toBe(1);
    expect(currentSemesterOn(program, new Date('2023-01-05'))).toBe(1);   // before the intake, clamped
    expect(currentSemesterOn(program, new Date('2099-01-05'))).toBe(program.meta.maxSemesters);
  });

  it('approximates semester end dates', () => {
    expect(semesterEndDate(program, 7)).toBe('2026-12-31');
    expect(semesterEndDate(program, 8)).toBe('2027-04-30');
    expect(semesterEndDate(program, 12)).toBe('2028-08-31');
  });
});

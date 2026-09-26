import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from '../../domain/courseState';
import { buildContext } from '../../domain/program';
import type { Attempt, Course, StudentRecord } from '../../domain/types';
import { standardProgram } from './factory';

const course = (code: string, credits: number, group = 'Graduation work'): Course =>
  ({ code, nameEn: '', nameVi: code, credits, group, requirement: 'graduation', prereqs: [] });

const program = standardProgram({
  meta: {
    id: 'test', name: 'Test', shortName: 'Test', intakeYear: 2025, semestersPerYear: 3, standardSemesters: 12,
    maxSemesters: 21, semesterMin: 14, semesterMax: 25, totalCredits: 10, gradEarliestSemester: 11,
    peCourses: [], militaryCourse: '', englishDefaultValidityYears: 2, sources: [],
  },
  courses: [course('THESIS', 10), course('PROJECT', 6), course('A4', 4), course('B4', 4), course('S1', 4, 'Spec')],
  blocks: [],
  specializations: [{ id: 's', nameVi: 'Spec only', compulsory: { minCourses: 0, minCredits: 0, courses: ['S1'] },
    elective: { minCourses: 0, minCredits: 0, courses: [] }, freeChoiceCredits: 0 }],
  graduation: {
    credits: 10,
    options: [
      { id: 'thesis', label: 'Thesis', courses: ['THESIS'] },
      { id: 'project', label: 'Project', courses: ['PROJECT'], pick: [{ count: 1, courses: ['A4', 'B4'] }] },
    ],
  },
});

const gradOf = (codes: string[], gradTrack: string) => {
  const attempts: Attempt[] = codes.map((code, i) => ({ id: i + 1, code, semester: 11, status: 'completed', grade10: 8 }));
  const record: StudentRecord = {
    profile: { programId: 'test', currentSemester: 12, choices: { gradTrack }, militaryCert: false, thesisGpaThreshold: null },
    attempts, english: null, gpaOverrides: {},
  };
  const report = program.progress(buildContext(program, record, deriveCourseStates(program, attempts)));
  return report.groups.find((g) => g.id === 'grad')!.earned;
};

describe('graduation options with a "pick one" part', () => {
  it('needs the fixed course and one course from the list', () => {
    expect(gradOf(['PROJECT'], 'project')).toBe(0);
    expect(gradOf(['A4'], 'project')).toBe(0);
    expect(gradOf(['PROJECT', 'A4'], 'project')).toBe(10);
  });

  it('does not let two list courses replace the project', () => {
    expect(gradOf(['A4', 'B4'], 'project')).toBe(0);
  });

  it('keeps the single-course options working', () => {
    expect(gradOf(['THESIS'], 'thesis')).toBe(10);
    expect(gradOf(['THESIS'], 'project')).toBe(0);
  });
});

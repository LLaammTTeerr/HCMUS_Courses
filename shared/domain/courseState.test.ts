import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from './courseState';
import { done, inProgress, planned, program } from './testUtils';

describe('deriveCourseStates', () => {
  it('marks untouched courses not-taken', () => {
    const s = deriveCourseStates(program, []);
    expect(s.get('CS160')?.status).toBe('not-taken');
    expect(s.size).toBe(program.courses.length);
  });

  it('uses the latest completed attempt as official grade (even if lower)', () => {
    const s = deriveCourseStates(program, [done('CS160', 1, 8), done('CS160', 3, 4)]);
    expect(s.get('CS160')).toMatchObject({ status: 'failed', officialGrade: 4, passedSemester: null });
  });

  it('passes on 5.0 exactly and records the semester', () => {
    const s = deriveCourseStates(program, [done('CS160', 1, 4.9), done('CS160', 2, 5)]);
    expect(s.get('CS160')).toMatchObject({ status: 'passed', officialGrade: 5, passedSemester: 2 });
  });

  it('applies precedence passed > in-progress > planned > failed', () => {
    const s = deriveCourseStates(program, [
      done('CS160', 1, 8), planned('CS160', 9),
      done('CS163', 2, 3), inProgress('CS163', 7), planned('CS163', 8),
      done('CS202', 3, 2), planned('CS202', 8),
    ]);
    expect(s.get('CS160')?.status).toBe('passed');
    expect(s.get('CS163')).toMatchObject({ status: 'in-progress', activeSemester: 7 });
    expect(s.get('CS202')).toMatchObject({ status: 'planned', activeSemester: 8, officialGrade: 2 });
  });

  it('ignores attempts for unknown codes', () => {
    const s = deriveCourseStates(program, [done('XX999', 1, 9)]);
    expect(s.has('XX999')).toBe(false);
  });
});

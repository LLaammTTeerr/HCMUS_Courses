import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from './courseState';
import { prereqStatus } from './prereqs';
import { done, inProgress, planned, program } from './testUtils';
import type { Attempt } from './types';

const status = (attempts: Attempt[], code: string, semester: number) =>
  prereqStatus(program, deriveCourseStates(program, attempts), code, semester);

describe('prereqStatus', () => {
  it('is ok when the prior course passed earlier', () => {
    expect(status([done('CS160', 1, 7)], 'CS163', 2)).toEqual([{ code: 'CS160', status: 'ok' }]);
  });

  it('accepts an in-progress prior course for the next semester', () => {
    expect(status([inProgress('CS160', 7)], 'CS163', 8)).toEqual([{ code: 'CS160', status: 'ok' }]);
  });

  it('accepts a prior course planned in an earlier semester', () => {
    expect(status([planned('CS160', 8)], 'CS163', 9)[0].status).toBe('ok');
  });

  it('reports a prior course in the same semester as missing', () => {
    expect(status([planned('CS160', 8)], 'CS163', 8)[0].status).toBe('missing');
  });

  it('reports a failed prior course as weak (học trước is satisfied by taking it)', () => {
    expect(status([done('CS160', 1, 3)], 'CS163', 2)[0].status).toBe('weak');
  });

  it('reports untaken prior courses as missing', () => {
    expect(status([], 'CS320', 8).map((p) => p.status)).toEqual(['missing', 'missing', 'missing']);
  });

  it('returns nothing for courses without prerequisites', () => {
    expect(status([], 'CS160', 1)).toEqual([]);
  });
});

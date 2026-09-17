import { describe, expect, it } from 'vitest';
import { checklist } from './checklist';
import { codesIn, done, passAll, planned, program, record } from './testUtils';
import type { EnglishCert, StudentRecord } from './types';

const statusOf = (r: StudentRecord) => Object.fromEntries(checklist(program, r).map((i) => [i.id, i.status]));

const graduated = () => passAll([
  ...codesIn('A_REQ', 'NONCS', 'MATH', 'PHYS', 'EXTRA'),
  'CS350', 'CS320', 'CS311', 'CS251', 'MTH253', 'STAT452', ...codesIn('C').slice(0, 9), 'CS468',
], 6);

const ielts = (issued: string, score = 6.5): EnglishCert => ({ type: 'IELTS', score, score2: null, issued, expires: null });

describe('checklist (Art. 17)', () => {
  it('reports everything done for a complete record', () => {
    const s = statusOf(record(graduated(), { gradTrack: 'thesis', militaryCert: true, thesisGpaThreshold: 7 }, ielts('2026-06-01')));
    expect(s).toEqual({
      total: 'done', 'required-courses': 'done', a: 'done', b: 'done', bc: 'done', grad: 'done',
      pe: 'done', military: 'done', english: 'done', it: 'unknown', 'thesis-gpa': 'done',
    });
  });

  it('distinguishes covered-by-plan from missing', () => {
    const attempts = graduated().filter((a) => a.code !== 'BAA00021' && a.code !== 'CS468');
    const s = statusOf(record([...attempts, planned('BAA00021', 8), planned('CS468', 12)], { gradTrack: 'thesis' }));
    expect(s.pe).toBe('covered-by-plan');
    expect(s.grad).toBe('covered-by-plan');
    expect(s.total).toBe('covered-by-plan');
    expect(statusOf(record([])).total).toBe('missing');
  });

  it('requires the military certificate flag', () => {
    expect(statusOf(record(graduated(), { militaryCert: false })).military).toBe('missing');
  });

  it('checks English score and validity against the planned graduation semester', () => {
    expect(statusOf(record(graduated())).english).toBe('missing');
    expect(statusOf(record(graduated(), {}, ielts('2026-06-01', 5.5))).english).toBe('missing');
    // Graduating in semester 7 (ends 2026-12-31): a 2024-01-01 certificate expired on 2026-01-01.
    const expired = checklist(program, record(graduated(), {}, ielts('2024-01-01'))).find((i) => i.id === 'english')!;
    expect(expired.status).toBe('missing');
    expect(expired.detail).toMatch(/2026-01-01/);
  });

  it('only shows the thesis GPA item on the thesis track and needs a threshold', () => {
    expect(statusOf(record(graduated())).hasOwnProperty('thesis-gpa')).toBe(false);
    expect(statusOf(record(graduated(), { gradTrack: 'thesis' }))['thesis-gpa']).toBe('unknown');
    expect(statusOf(record([done('CS160', 1, 6)], { gradTrack: 'thesis', thesisGpaThreshold: 7 }))['thesis-gpa']).toBe('missing');
  });
});

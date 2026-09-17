import { describe, expect, it } from 'vitest';
import { englishMeets, englishValidUntil } from './english';
import { program } from './testUtils';

describe('English standard (QĐ1985)', () => {
  it('checks minimum scores per certificate type', () => {
    expect(englishMeets({ type: 'IELTS', score: 6, score2: null, issued: '2026-01-01', expires: null })).toBe(true);
    expect(englishMeets({ type: 'IELTS', score: 5.5, score2: null, issued: '2026-01-01', expires: null })).toBe(false);
    expect(englishMeets({ type: 'TOEFL_IBT', score: 79, score2: null, issued: '2026-01-01', expires: null })).toBe(true);
    expect(englishMeets({ type: 'TOEFL_IBT', score: 78, score2: null, issued: '2026-01-01', expires: null })).toBe(false);
    expect(englishMeets({ type: 'TOEFL_ITP_TOEIC_SW', score: 550, score2: 270, issued: '2026-01-01', expires: null })).toBe(true);
    expect(englishMeets({ type: 'TOEFL_ITP_TOEIC_SW', score: 550, score2: 260, issued: '2026-01-01', expires: null })).toBe(false);
    expect(englishMeets({ type: 'TOEFL_ITP_TOEIC_SW', score: 550, score2: null, issued: '2026-01-01', expires: null })).toBe(false);
  });

  it('uses the stated expiry, else issued + 2 years', () => {
    expect(englishValidUntil(program, { type: 'IELTS', score: 7, score2: null, issued: '2026-03-15', expires: '2027-01-01' })).toBe('2027-01-01');
    expect(englishValidUntil(program, { type: 'IELTS', score: 7, score2: null, issued: '2026-03-15', expires: null })).toBe('2028-03-15');
  });
});

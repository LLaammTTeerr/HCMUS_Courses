import { parseQuickEntry } from './quickEntry';
import { getProgram } from '../programs/index';
import type { Attempt, StudentRecord } from './types';

/** A realistic APCS record: semesters 1–6 completed (one retake, one fail), semester 7 in progress. */
export const SAMPLE_LINES = `CS160 1 8.5
CM102 1 7.8
MTH251 1 6.9
PH211 1 7
BAA00030 1 8
CS163 2 8
MTH252 2 5.5
PH212 2 6.2
BAA00004 2 7
CS202 3 9
MTH261 3 7.5
PH213 3 4.2
BAA00101 3 6.8
CS201 4 7.7
CS252 4 8.8
CS250 4 7.2
SC203 4 8
BAA00021 4 9
CS251 5 6.5
ECE341 5 7
WR227 5 8.1
STAT451 5 6
BAA00022 5 8.5
CS323 6 8
CS486 6 7.4
STAT452 6 6.6
MTH253 6 7
PH213 6 6
CS300 7
CS311 7
CS420 7
BAA00102 7
CS418 7`;

export function sampleRecord(overrides: Partial<StudentRecord['profile']> = {}): StudentRecord {
  const program = getProgram('apcs-2024');
  const parsed = parseQuickEntry(program, SAMPLE_LINES, 7);
  if (parsed.errors.length) throw new Error(`fixture parse errors: ${JSON.stringify(parsed.errors)}`);
  const attempts: Attempt[] = parsed.rows.map(({ line, ...a }) => ({ ...a, id: line }));
  return {
    profile: {
      programId: 'apcs-2024',
      currentSemester: 7,
      gradTrack: 'thesis',
      militaryCert: true,
      thesisGpaThreshold: 7,
      ...overrides,
    },
    attempts,
    english: { type: 'IELTS', score: 7, score2: null, issued: '2026-03-01', expires: null },
    gpaOverrides: {},
  };
}

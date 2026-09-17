import { getProgram } from '../programs/index';
import type { Attempt, EnglishCert, Profile, StudentRecord } from './types';

export const program = getProgram('apcs-2024');

let nextId = 1;

/** completed attempt with grade */
export function done(code: string, semester: number, grade10: number): Attempt {
  return { id: nextId++, code, semester, status: 'completed', grade10 };
}
export function inProgress(code: string, semester: number): Attempt {
  return { id: nextId++, code, semester, status: 'in-progress', grade10: null };
}
export function planned(code: string, semester: number): Attempt {
  return { id: nextId++, code, semester, status: 'planned', grade10: null };
}

export function record(
  attempts: Attempt[],
  profile: Partial<Profile> = {},
  english: EnglishCert | null = null,
  gpaOverrides: Record<string, boolean> = {},
): StudentRecord {
  return {
    profile: {
      programId: 'apcs-2024',
      currentSemester: 7,
      gradTrack: 'undecided',
      militaryCert: false,
      thesisGpaThreshold: null,
      ...profile,
    },
    attempts,
    english,
    gpaOverrides,
  };
}

/** Passes every course of the given codes in `semester` with `grade`. */
export function passAll(codes: string[], semester = 1, grade = 8): Attempt[] {
  return codes.map((c) => done(c, semester, grade));
}

export const codesIn = (...buckets: string[]) =>
  program.courses.filter((c) => buckets.includes(c.bucket)).map((c) => c.code);

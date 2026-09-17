import type { Course, Program } from '../domain/types';
import apcs2024 from './apcs-2024.json';

// Register new intakes here (see CLAUDE.md → "Adding a program").
const PROGRAMS: Record<string, Program> = {
  'apcs-2024': apcs2024 as Program,
};

export const PROGRAM_IDS = Object.keys(PROGRAMS);
export const DEFAULT_PROGRAM_ID = 'apcs-2024';

export function getProgram(id: string): Program {
  const program = PROGRAMS[id];
  if (!program) throw new Error(`Unknown program: ${id}`);
  return program;
}

const courseIndexCache = new WeakMap<Program, Map<string, Course>>();

/** Course lookup by code (cached per program object). */
export function courseIndex(program: Program): Map<string, Course> {
  let index = courseIndexCache.get(program);
  if (!index) {
    index = new Map(program.courses.map((c) => [c.code, c]));
    courseIndexCache.set(program, index);
  }
  return index;
}

import type { Course } from '../domain/types';
import type { ProgramMeta, ProgramModule } from '../domain/program';
import apcs2024 from './apcs-2024/index';
import clc2026 from './clc-2026/index';
import cntt2025 from './cntt-2025/index';
import khmt2025 from './khmt-2025/index';
import ktpm2025 from './ktpm-2025/index';

// Register new programs here (see CLAUDE.md → "Adding a program").
const PROGRAMS: Record<string, ProgramModule> = {
  [apcs2024.meta.id]: apcs2024,
  [clc2026.meta.id]: clc2026,
  [cntt2025.meta.id]: cntt2025,
  [khmt2025.meta.id]: khmt2025,
  [ktpm2025.meta.id]: ktpm2025,
};

export const PROGRAM_IDS = Object.keys(PROGRAMS);
export const DEFAULT_PROGRAM_ID = apcs2024.meta.id;

export function getProgram(id: string): ProgramModule {
  const program = PROGRAMS[id];
  if (!program) throw new Error(`Unknown program: ${id}`);
  return program;
}

/** Metadata of every registered program, for the program picker. */
export function listPrograms(): ProgramMeta[] {
  return Object.values(PROGRAMS).map((p) => p.meta);
}

const courseIndexCache = new WeakMap<ProgramModule, Map<string, Course>>();

/** Course lookup by code (cached per program object). */
export function courseIndex(program: ProgramModule): Map<string, Course> {
  let index = courseIndexCache.get(program);
  if (!index) {
    index = new Map(program.courses.map((c) => [c.code, c]));
    courseIndexCache.set(program, index);
  }
  return index;
}

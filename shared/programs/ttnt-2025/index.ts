// Trí tuệ nhân tạo — khóa tuyển 2025 — generated from the curriculum with scripts/program-from-extract.mjs.
// The rules come from the shared factory; this file only maps the document's blocks onto it.
import type { ProgramMeta } from '../../domain/program';
import type { Course } from '../../domain/types';
import { standardProgram, type StandardBlock, type StandardProgramConfig } from '../_standard/factory';
import coursesData from './courses.json';
import metaData from './meta.json';
import structure from './structure.json';

export const meta = metaData.meta as ProgramMeta;
const courses = coursesData.courses as Course[];

const blocks = structure.blocks as StandardBlock[];

export const config: StandardProgramConfig = {
  meta,
  courses,
  // Blocks outside the programme total (PE, Military, …) carry countsInTotal: false (CTĐT §3).
  blocks,
  specializations: structure.specializations,
  graduation: { credits: structure.graduation.credits, options: structure.graduation.options },
};

export const program = standardProgram(config);
export default program;

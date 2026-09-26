// Kỹ thuật phần mềm — khóa tuyển 2025 — generated from the curriculum with scripts/program-from-extract.mjs.
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
  blocks: blocks.map((block) => ({
    ...block,
    // Passed but outside the programme total (CTĐT §3).
    countsInTotal: ['language', 'pe', 'military'].includes(block.id) ? false : undefined,
  })),
  specializations: structure.specializations,
  graduation: { credits: structure.graduation.credits, options: structure.graduation.options },
};

export const program = standardProgram(config);
export default program;

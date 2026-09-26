// CLC / Chương trình Tăng cường tiếng Anh ngành Công nghệ thông tin.
// Rules from the 2024 curriculum (QĐ 2693/QĐ-KHTN) §3, §6–7; used for the 2026 intake until the 2026
// document is published, so only the intake year differs (semester labels).
import type { ProgramMeta } from '../../domain/program';
import type { Course } from '../../domain/types';
import { standardProgram, type StandardBlock, type StandardProgramConfig } from '../_standard/factory';
import coursesData from './courses.json';
import metaData from './meta.json';
import structure from './structure.json';

export const meta = metaData.meta as ProgramMeta;
const courses = coursesData.courses as Course[];
const blocks = structure.blocks;

const standardBlocks: StandardBlock[] = [
  { id: 'political', label: 'Political theory & law', credits: blocks.generalPolitical.credits,
    rules: [{ type: 'all', courses: blocks.generalPolitical.courses }] },
  { id: 'social', label: 'Social & skills', credits: blocks.generalSocial.credits,
    rules: [{ type: 'chooseCourses', count: 1, credits: blocks.generalSocial.credits, courses: blocks.generalSocial.courses }] },
  { id: 'mathScience', label: 'Math & natural science', credits: blocks.generalMath.credits,
    rules: [
      { type: 'all', courses: blocks.generalMath.compulsory },
      { type: 'chooseCourses', count: 1, credits: 4, courses: blocks.generalMath.chooseOneOf },
      { type: 'chooseCredits', credits: blocks.generalMath.chooseCreditsFrom.credits, courses: blocks.generalMath.chooseCreditsFrom.courses },
    ] },
  { id: 'informatics', label: 'Informatics', credits: blocks.generalInformatics.credits,
    rules: [{ type: 'all', courses: blocks.generalInformatics.courses }] },
  // Passed but outside the 138 credits (CTĐT §3); the regulation counts them as accumulated credits.
  { id: 'pe', label: 'Physical Education', credits: blocks.pe.credits, countsInTotal: false,
    rules: [{ type: 'all', courses: blocks.pe.courses }] },
  { id: 'military', label: 'Military Education', credits: blocks.military.credits, countsInTotal: false,
    rules: [{ type: 'all', courses: blocks.military.courses }] },
  { id: 'foundation', label: 'Foundation (cơ sở ngành)', credits: blocks.foundation.credits,
    rules: [{ type: 'all', courses: blocks.foundation.courses }] },
];

/** §7.2.3: thesis, graduation internship, or the project plus one more graduation course. */
const graduationPool = courses.filter((c) => c.group === 'Graduation work').map((c) => c.code);

export const config: StandardProgramConfig = {
  meta,
  courses,
  blocks: standardBlocks,
  specializations: structure.specializations,
  graduation: {
    credits: 10,
    options: [
      { id: 'thesis', label: 'Khóa luận tốt nghiệp', note: 'CSC10251 · 10 credits', courses: ['CSC10251'] },
      { id: 'internship', label: 'Thực tập tốt nghiệp', note: 'CSC10252 · 10 credits', courses: ['CSC10252'] },
      { id: 'project', label: 'Thực tập dự án tốt nghiệp', note: 'CSC10204 (6) + a 4-credit graduation course',
        courses: ['CSC10204'], pool: graduationPool.filter((c) => c !== 'CSC10204') },
    ],
  },
};

export const clc2026 = standardProgram(config);

export default clc2026;

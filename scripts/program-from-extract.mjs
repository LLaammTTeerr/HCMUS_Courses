#!/usr/bin/env node
// Turns a curriculum extraction into a programme folder under shared/programs/.
//
//   node scripts/program-from-extract.mjs <extract.json> <id> "<full name>" "<short name>"
//
// The extraction is the JSON shape described in CLAUDE.md → "Adding a program": blocks with rules,
// specializations, a course list and an optional teaching plan. Everything written here is data; the
// rules come from shared/programs/_standard/factory.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const keepCourseMinimums = args.includes('--course-minimums');
const [extractPath, id, name, shortName] = args.filter((a) => !a.startsWith('--'));
if (!extractPath || !id || !name || !shortName) {
  console.error('usage: node scripts/program-from-extract.mjs <extract.json> <id> "<full name>" "<short name>" [--course-minimums]');
  console.error('  --course-minimums  keep minCourses from the extraction (only when the CTĐT prints "≥ N học phần")');
  process.exit(1);
}

const extract = JSON.parse(readFileSync(extractPath, 'utf8'));
const dir = join('shared/programs', id);
mkdirSync(dir, { recursive: true });

const NOT_IN_CREDITS = new Set(['language', 'pe', 'military']);   // outside the programme total
const NOT_IN_GPA = new Set(['language', 'pe', 'military']);       // QC1175 Art. 15.1c

// Anh văn 1–4 are waived for students who meet the English standard, so they are listed but never
// required; the English checklist item covers the standard itself.
const LANGUAGE = 'language';

const blockOf = new Map();
for (const block of extract.blocks) {
  for (const rule of block.rules ?? []) {
    for (const code of rule.courses) {
      if (!blockOf.has(code)) blockOf.set(code, { block, compulsory: rule.type === 'all' });
    }
  }
}
const specCompulsory = new Set(extract.specializations.flatMap((s) => s.compulsory.courses));
const specElective = new Set(extract.specializations.flatMap((s) => s.elective.courses));
const graduation = new Set(
  extract.blocks.find((b) => b.id === 'graduation')?.rules.flatMap((r) => r.courses) ?? [],
);

const creditOf = new Map(extract.courses.map((c) => [c.code, c.credits]));
const nameOf = new Map(extract.courses.map((c) => [c.code, c.nameVi]));
const gradBlock = extract.blocks.find((b) => b.id === 'graduation') ?? null;

/**
 * Graduation options (phương án): either given by the extraction, or derived from the course list —
 * each full-credit course is its own option, and the rest form one "project" option made of one course
 * per credit size (e.g. a 6-credit project plus one 4-credit course).
 */
function graduationOptions() {
  if (!gradBlock) return [];
  if (Array.isArray(gradBlock.options) && gradBlock.options.length) {
    return gradBlock.options.map((o) => ({
      id: o.id, label: o.label, ...(o.note ? { note: o.note } : {}),
      courses: o.courses ?? [],
      ...(o.pick?.length ? { pick: o.pick } : o.pool?.length ? { pick: [{ count: 1, courses: o.pool }] } : {}),
    }));
  }
  const full = gradBlock.credits;
  const all = [...new Set(gradBlock.rules.flatMap((r) => r.courses))];
  const options = all.filter((code) => creditOf.get(code) === full).map((code) => ({
    id: /khóa luận/i.test(nameOf.get(code) ?? '') ? 'thesis' : /thực tập tốt nghiệp/i.test(nameOf.get(code) ?? '') ? 'internship' : code.toLowerCase(),
    label: nameOf.get(code) ?? code,
    note: `${code} · ${full} credits`,
    courses: [code],
  }));
  const rest = all.filter((code) => creditOf.get(code) !== full);
  const sizes = [...new Set(rest.map((code) => creditOf.get(code)))].sort((a, b) => b - a);
  if (sizes.length) {
    const parts = sizes.map((size) => rest.filter((code) => creditOf.get(code) === size));
    const fixed = parts.filter((p) => p.length === 1).flat();
    const pick = parts.filter((p) => p.length > 1).map((courses) => ({ count: 1, courses }));
    const project = rest.find((code) => /dự án tốt nghiệp/i.test(nameOf.get(code) ?? ''));
    options.push({
      id: 'project',
      label: project ? nameOf.get(project) : 'Graduation project',
      note: sizes.map((size) => `${size} cr`).join(' + '),
      courses: fixed,
      ...(pick.length ? { pick } : {}),
    });
  }
  return options;
}

const specializations = extract.specializations.map((spec) => ({
  ...spec,
  compulsory: { ...spec.compulsory, minCourses: keepCourseMinimums ? (spec.compulsory.minCourses ?? 0) : 0 },
  elective: { ...spec.elective, minCourses: keepCourseMinimums ? (spec.elective.minCourses ?? 0) : 0 },
}));

const courses = extract.courses.map((course) => {
  const placement = blockOf.get(course.code);
  const group = placement ? placement.block.label
    : graduation.has(course.code) ? 'Graduation work'
    : specCompulsory.has(course.code) ? 'Specialization courses'
    : specElective.has(course.code) ? 'Specialization electives'
    : 'Free choice & other courses';
  const requirement = placement?.block.id === LANGUAGE ? 'elective'
    : placement ? (placement.compulsory ? 'compulsory' : 'choose')
    : graduation.has(course.code) ? 'graduation'
    : specCompulsory.has(course.code) ? 'choose'
    : 'elective';

  const entry = {
    code: course.code,
    nameEn: course.nameEn ?? '',
    nameVi: course.nameVi,
    credits: course.credits,
    group,
    requirement,
    prereqs: course.prereqs ?? [],
  };
  if (course.suggestedSemester) entry.suggestedSemester = course.suggestedSemester;
  const blockId = placement?.block.id;
  if (blockId && NOT_IN_CREDITS.has(blockId)) entry.countsInCredits = false;
  if (blockId && NOT_IN_GPA.has(blockId)) entry.countsInGpa = false;
  return entry;
});

const order = extract.blocks.map((b) => b.label)
  .concat(['Specialization courses', 'Specialization electives', 'Graduation work', 'Free choice & other courses']);
courses.sort((a, b) =>
  order.indexOf(a.group) - order.indexOf(b.group) ||
  (a.suggestedSemester ?? 99) - (b.suggestedSemester ?? 99) ||
  a.code.localeCompare(b.code));

writeFileSync(join(dir, 'courses.json'), `${JSON.stringify({ courses }, null, 1)}\n`);
writeFileSync(join(dir, 'structure.json'), `${JSON.stringify({
  blocks: extract.blocks.filter((b) => b.id !== 'graduation' && b.id !== LANGUAGE).map((b) => ({
    id: b.id, label: b.label, credits: b.credits, rules: b.rules,
  })),
  graduation: { credits: gradBlock?.credits ?? 10, description: gradBlock?.description ?? '', options: graduationOptions() },
  specializations,
  teachingPlan: extract.teachingPlan ?? [],
  notes: extract.notes ?? [],
}, null, 1)}\n`);

const intakeYear = extract.intakeYear;
writeFileSync(join(dir, 'meta.json'), `${JSON.stringify({
  meta: {
    id, name, shortName, intakeYear,
    semestersPerYear: 3, standardSemesters: 12, maxSemesters: 21,
    semesterMin: 14, semesterMax: 25,          // QC1175 Art. 7.2, chương trình đại trà
    limitCountsExtras: false,                  // …không kể GDQP, GDTC và Ngoại ngữ tổng quát
    totalCredits: extract.totalCredits,
    gradEarliestSemester: 11,
    peCourses: extract.blocks.find((b) => b.id === 'pe')?.rules.flatMap((r) => r.courses) ?? [],
    militaryCourse: (extract.blocks.find((b) => b.id === 'military')?.rules.flatMap((r) => r.courses) ?? [])[0] ?? '',
    englishDefaultValidityYears: 2,
    sources: [
      { id: 'CTDT', title: `Chương trình đào tạo ngành ${extract.programName}, khóa tuyển ${intakeYear}${extract.decision ? ` (${extract.decision})` : ''}`,
        url: 'https://hcmus.edu.vn/chuong-trinh-dao-tao-trinh-do-dai-hoc-khoa-2025/' },
      { id: 'QC1175', title: 'Quy chế đào tạo trình độ đại học (QĐ 1175/QĐ-KHTN, 24/09/2021)',
        url: 'https://www.ctda.hcmus.edu.vn/vi/goc-sinh-vien/so-tay-sinh-vien/' },
    ],
  },
}, null, 1)}\n`);

writeFileSync(join(dir, 'index.ts'), `// ${name} — generated from the curriculum with scripts/program-from-extract.mjs.
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
`);

console.log(`Wrote ${dir}: ${courses.length} courses, ${extract.blocks.length} blocks, ${specializations.length} specializations, ` +
  `graduation options: ${graduationOptions().map((o) => o.id).join(', ')}`);

import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from '../../domain/courseState';
import { buildContext } from '../../domain/program';
import type { StudentRecord } from '../../domain/types';
import { config as clc2026 } from '../clc-2026/index';
import { standardProgram, type StandardProgramConfig } from './factory';

/** Every programme built on the factory is checked here — add a new one to this list. */
const CONFIGS: StandardProgramConfig[] = [clc2026];

const emptyRecord = (programId: string, choices: Record<string, string> = {}): StudentRecord => ({
  profile: { programId, currentSemester: 1, choices, militaryCert: false, thesisGpaThreshold: null },
  attempts: [], english: null, gpaOverrides: {},
});

describe.each(CONFIGS.map((c) => [c.meta.shortName, c] as const))('%s (standard programme)', (_name, config) => {
  const program = standardProgram(config);
  const codes = new Set(config.courses.map((c) => c.code));
  const credits = (list: string[]) => list.reduce((sum, code) => sum + (config.courses.find((c) => c.code === code)?.credits ?? 0), 0);

  it('has unique course codes', () => {
    expect(codes.size).toBe(config.courses.length);
  });

  it('only references courses it defines', () => {
    const referenced = [
      ...config.blocks.flatMap((b) => b.rules.flatMap((r) => r.courses)),
      ...config.specializations.flatMap((s) => [...s.compulsory.courses, ...s.elective.courses]),
      ...config.graduation.options.flatMap((o) => [...o.courses, ...(o.pool ?? [])]),
    ];
    for (const code of referenced) expect(codes.has(code), code).toBe(true);
  });

  it('can reach every block total with the courses it lists', () => {
    for (const block of config.blocks) {
      const available = block.rules.reduce((sum, rule) => {
        const pool = credits(rule.courses);
        return sum + (rule.type === 'all' ? pool : Math.min(rule.credits, pool));
      }, 0);
      expect(available, `${block.id}: pool ${available} < required ${block.credits}`).toBeGreaterThanOrEqual(block.credits);
    }
  });

  it('adds its blocks, specialization and graduation work up to the programme total', () => {
    const counted = config.blocks.filter((b) => b.countsInTotal !== false).reduce((sum, b) => sum + b.credits, 0);
    const spec = config.specializations[0];
    const total = counted + spec.compulsory.minCredits + spec.elective.minCredits + spec.freeChoiceCredits + config.graduation.credits;
    expect(total).toBe(config.meta.totalCredits);
  });

  it('offers specializations whose pools can meet their minimums', () => {
    expect(config.specializations.length).toBeGreaterThan(0);
    for (const s of config.specializations) {
      expect(credits(s.compulsory.courses), `${s.id} compulsory pool`).toBeGreaterThanOrEqual(s.compulsory.minCredits);
      expect(s.compulsory.courses.length, `${s.id} compulsory count`).toBeGreaterThanOrEqual(s.compulsory.minCourses);
      expect(credits(s.elective.courses) + credits(s.compulsory.courses) - s.compulsory.minCredits,
        `${s.id} elective pool`).toBeGreaterThanOrEqual(s.elective.minCredits);
      expect(s.nameVi.length).toBeGreaterThan(3);
    }
  });

  it('offers graduation options that can reach the required credits', () => {
    for (const option of config.graduation.options) {
      const reachable = credits(option.courses) + credits(option.pool ?? []);
      expect(reachable, option.id).toBeGreaterThanOrEqual(config.graduation.credits);
    }
  });

  it('reports an empty record as nothing earned and nothing satisfied', () => {
    const record = emptyRecord(config.meta.id);
    const report = program.progress(buildContext(program, record, deriveCourseStates(program, [])));
    expect(report.total.earned).toBe(0);
    expect(report.satisfied.earned).toBe(false);
    expect(report.groups.length).toBeGreaterThan(3);
  });

  it('needs every choice it declares before graduation is possible', () => {
    for (const choice of program.choices) {
      expect(choice.options.length, choice.id).toBeGreaterThan(0);
      expect(choice.required).toBe(true);
    }
  });

  it('keeps semesters of the suggested plan inside the programme length', () => {
    for (const course of config.courses) {
      if (course.suggestedSemester === undefined) continue;
      expect(course.suggestedSemester).toBeGreaterThanOrEqual(1);
      expect(course.suggestedSemester).toBeLessThanOrEqual(config.meta.standardSemesters);
    }
  });
});

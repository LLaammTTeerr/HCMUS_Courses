import { describe, expect, it } from 'vitest';
import { deriveCourseStates } from '../../domain/courseState';
import { buildContext } from '../../domain/program';
import type { StudentRecord } from '../../domain/types';
import { config as clc2026 } from '../clc-2026/index';
import { config as cntt2025 } from '../cntt-2025/index';
import { config as httt2025 } from '../httt-2025/index';
import { config as khdl2025 } from '../khdl-2025/index';
import { config as khmt2025 } from '../khmt-2025/index';
import { config as ktpm2025 } from '../ktpm-2025/index';
import { config as ttnt2025 } from '../ttnt-2025/index';
import { progressOf } from '../../domain/planner';
import { suggestedPlanAttempts } from '../../domain/suggestedPlan';
import { standardProgram, type StandardProgramConfig } from './factory';

/** Every programme built on the factory is checked here — add a new one to this list. */
const CONFIGS: StandardProgramConfig[] = [clc2026, cntt2025, httt2025, khdl2025, khmt2025, ktpm2025, ttnt2025];

import { readdirSync } from 'node:fs';
import { PROGRAM_IDS } from '../index';

describe('programme registration', () => {
  it('registers and validates every programme folder', () => {
    const folders = readdirSync(new URL('..', import.meta.url)).filter((f) => /^[a-z]+-\d{4}$/.test(f));
    for (const folder of folders) expect(PROGRAM_IDS, `${folder} is not in shared/programs/index.ts`).toContain(folder);
    const standard = folders.filter((f) => f !== 'apcs-2024');
    for (const folder of standard) {
      expect(CONFIGS.map((c) => c.meta.id), `${folder} is not in CONFIGS`).toContain(folder);
    }
  });
});

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
      const picked = (option.pick ?? []).reduce((sum, part) => {
        const best = part.courses.map((code) => credits([code])).sort((a, b) => b - a).slice(0, part.count);
        return sum + best.reduce((a, b) => a + b, 0);
      }, 0);
      const reachable = credits(option.courses) + picked + credits(option.pool ?? []);
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

  it.each(config.graduation.options.map((o) => o.id))('can plan a complete programme (graduation: %s)', (gradTrack) => {
    const spec = config.specializations[0];
    const choices: Record<string, string> = { gradTrack };
    if (config.specializations.length > 1) choices.specialization = spec.id;
    const base = emptyRecord(config.meta.id, choices);
    const plan = suggestedPlanAttempts(program, base);
    const withPlan: StudentRecord = { ...base, attempts: plan.map((a, i) => ({ ...a, id: i + 1 })) };
    const report = progressOf(program, withPlan);
    const short = report.groups.filter((g) => g.planned < g.required).map((g) => `${g.id} ${g.planned}/${g.required}`);
    expect(report.satisfied.planned, short.join(', ')).toBe(true);
    expect(report.total.planned).toBeGreaterThanOrEqual(config.meta.totalCredits);
  });

  it('keeps semesters of the suggested plan inside the programme length', () => {
    for (const course of config.courses) {
      if (course.suggestedSemester === undefined) continue;
      expect(course.suggestedSemester).toBeGreaterThanOrEqual(1);
      expect(course.suggestedSemester).toBeLessThanOrEqual(config.meta.standardSemesters);
    }
  });
});

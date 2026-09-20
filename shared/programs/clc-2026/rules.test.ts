import { describe, expect, it } from 'vitest';
import { checklist } from '../../domain/checklist';
import { deriveCourseStates } from '../../domain/courseState';
import { cumulativeGpa } from '../../domain/gpa';
import { planWarnings, progressOf } from '../../domain/planner';
import { buildContext } from '../../domain/program';
import { recommend } from '../../domain/recommend';
import { suggestedPlanAttempts } from '../../domain/suggestedPlan';
import type { Attempt, StudentRecord } from '../../domain/types';
import clc2026 from './index';
import structure from './structure.json';

const program = clc2026;
const spec = structure.specializations.find((s) => s.id === 'networks')!;
let nextId = 1;

const pass = (codes: string[], semester = 1): Attempt[] =>
  codes.map((code) => ({ id: nextId++, code, semester, status: 'completed', grade10: 8 }));

function record(attempts: Attempt[], choices: Record<string, string> = {}): StudentRecord {
  return {
    profile: { programId: 'clc-2026', currentSemester: 3, choices, militaryCert: false, thesisGpaThreshold: null },
    attempts,
    english: null,
    gpaOverrides: {},
  };
}

const groups = (r: StudentRecord) => {
  const report = progressOf(program, r);
  return Object.fromEntries(report.groups.map((g) => [g.id, g.earned]));
};
const totalOf = (r: StudentRecord) => progressOf(program, r).total.earned;

describe('CLC rules', () => {
  it('counts a choose-1-of-3 group only once', () => {
    const one = record(pass(['BAA00005']));
    const two = record(pass(['BAA00005', 'BAA00006']));
    expect(groups(one).social).toBe(2);
    expect(groups(two).social).toBe(2);
    // The second course is not wasted: it falls into free choice.
    expect(groups(two).free).toBe(2);
  });

  it('caps the science electives at 8 credits and moves the surplus to free choice', () => {
    const r = record(pass(['PHY00005', 'PHY00007', 'GEO00002']));   // 4 + 4 + 2
    expect(groups(r).science).toBe(8);
    expect(groups(r).free).toBe(2);
    expect(totalOf(r)).toBe(10);
  });

  it('ignores specialization courses until a specialization is chosen', () => {
    const attempts = pass(spec.compulsory.courses.slice(0, 4));
    expect(groups(record(attempts)).specComp).toBe(0);
    expect(groups(record(attempts, { specialization: 'networks' })).specComp).toBe(16);
  });

  it('needs both credits and course count in the specialization (≥ 4 courses, ≥ 16 credits)', () => {
    const three = record(pass(spec.compulsory.courses.slice(0, 3)), { specialization: 'networks' });
    const ids = planWarnings(program, three).map((w) => w.id);
    expect(groups(three).specComp).toBe(12);
    expect(ids).toContain('spec-compulsory-courses');
  });

  it('lets unused compulsory-list courses count as specialization electives (§7.2.2.x.2)', () => {
    const r = record(pass(spec.compulsory.courses.slice(0, 6)), { specialization: 'networks' });
    expect(groups(r).specComp).toBe(16);
    expect(groups(r).specElec).toBe(8);
  });

  it('counts each graduation option and warns when the project is short', () => {
    expect(groups(record(pass(['CSC10251']), { gradTrack: 'thesis' })).grad).toBe(10);
    expect(groups(record(pass(['CSC10252']), { gradTrack: 'internship' })).grad).toBe(10);
    const project = record(pass(['CSC10204']), { gradTrack: 'project' });
    expect(groups(project).grad).toBe(6);
    expect(planWarnings(program, project).map((w) => w.id)).toContain('grad-project-short');
    expect(groups(record(pass(['CSC10204', 'CSC15201']), { gradTrack: 'project' })).grad).toBe(10);
  });

  it('keeps PE and Military Education out of the total and out of the GPA', () => {
    const r = record(pass(['BAA00021', 'BAA00022', 'BAA00030', 'CSC00004']));
    expect(totalOf(r)).toBe(4);
    expect(cumulativeGpa(program, deriveCourseStates(program, r.attempts), {}).credits).toBe(4);
  });

  it('asks for the specialization and the graduation track on the checklist', () => {
    const items = Object.fromEntries(checklist(program, record([])).map((i) => [i.id, i.status]));
    expect(items.specialization).toBe('missing');
    expect(items.english).toBe('unknown');
    expect(items.it).toBe('unknown');
  });

  it('recommends compulsory courses first and no specialization courses before the choice', () => {
    const list = recommend(program, record([]), 4);
    expect(list[0].tier).toBe(0);
    expect(list.map((x) => x.code)).toContain('CSC10012');
    expect(list.some((x) => spec.compulsory.courses.includes(x.code))).toBe(false);
    const chosen = recommend(program, record([], { specialization: 'networks' }), 4);
    expect(chosen.some((x) => spec.compulsory.courses.includes(x.code))).toBe(true);
  });

  it('plans a complete programme for a chosen specialization and track', () => {
    const base = record([], { specialization: 'networks', gradTrack: 'thesis' });
    const plan = suggestedPlanAttempts(program, base);
    const withPlan: StudentRecord = { ...base, attempts: plan.map((a, i) => ({ ...a, id: 10_000 + i })) };
    const report = progressOf(program, withPlan);
    expect(report.satisfied.planned, JSON.stringify(report.groups.map((g) => [g.id, g.planned, g.required]))).toBe(true);
    expect(report.total.planned).toBeGreaterThanOrEqual(138);
  });

  it('exposes the two program choices', () => {
    expect(program.choices.map((c) => c.id)).toEqual(['specialization', 'gradTrack']);
    expect(buildContext(program, record([], { specialization: 'data-science' }), new Map()).choice('specialization')).toBe('data-science');
  });
});

import { describe, expect, it } from 'vitest';
import { checklist } from './checklist';
import { deriveCourseStates } from './courseState';
import { cumulativeGpa } from './gpa';
import { sampleRecord } from './fixtures';
import { earliestGraduation, planWarnings } from './planner';
import { recommend } from './recommend';
import { suggestedPlanAttempts } from './suggestedPlan';
import { computeProgress } from './credits';
import { getProgram } from '../programs/index';
import type { GradTrack, StudentRecord } from './types';

/**
 * Behaviour lock for the APCS program, captured before the move to program modules
 * (docs/superpowers/specs/2026-09-20-multi-program-support-design.md §6.1).
 * These numbers come from the engine as it was; a refactor must not change them.
 */
const EXPECTED = {"thesis": {"a": {"required": 56, "earned": 40, "inProgress": 52, "planned": 52}, "nonCs": {"required": 26, "earned": 18, "inProgress": 20, "planned": 20}, "math": {"required": 16, "earned": 16, "inProgress": 16, "planned": 16}, "phys": {"required": 12, "earned": 12, "inProgress": 12, "planned": 12}, "b": {"required": 8, "earned": 8, "inProgress": 8, "planned": 8}, "c": {"required": 35, "earned": 0, "inProgress": 4, "planned": 4}, "bc": {"required": 43, "earned": 8, "inProgress": 12, "planned": 12}, "grad": {"required": 10, "earned": 0, "inProgress": 0, "planned": 0}, "total": {"required": 163, "earned": 94, "inProgress": 112, "planned": 112}}, "capstone": {"a": {"required": 56, "earned": 40, "inProgress": 52, "planned": 52}, "nonCs": {"required": 26, "earned": 18, "inProgress": 20, "planned": 20}, "math": {"required": 16, "earned": 16, "inProgress": 16, "planned": 16}, "phys": {"required": 12, "earned": 12, "inProgress": 12, "planned": 12}, "b": {"required": 8, "earned": 8, "inProgress": 8, "planned": 8}, "c": {"required": 35, "earned": 0, "inProgress": 4, "planned": 4}, "bc": {"required": 43, "earned": 8, "inProgress": 12, "planned": 12}, "grad": {"required": 10, "earned": 0, "inProgress": 0, "planned": 0}, "total": {"required": 163, "earned": 94, "inProgress": 112, "planned": 112}}} as const;

const GPA = {"gpa10": 7.304545454545454, "gpa4": 3.152272727272727, "credits": 88, "allGpa10": 7.304545454545454, "excluded": ["BAA00004", "BAA00021", "BAA00022", "BAA00030", "BAA00101"]};

const CHECKLIST = [["total", "missing"], ["required-courses", "missing"], ["a", "missing"], ["b", "done"], ["bc", "missing"], ["grad", "missing"], ["pe", "done"], ["military", "done"], ["english", "missing"], ["it", "unknown"], ["thesis-gpa", "done"]];

const WARNINGS = [["track-thesis-missing", "warning"], ["short-total", "warning"], ["short-a", "warning"], ["short-bc", "warning"], ["short-required", "warning"]];

const RECOMMEND = [["CS333", 0, 2], ["BAA00103", 0, 0], ["BAA00003", 0, 0], ["BAA00104", 0, 0], ["CS320", 1, 2], ["CS350", 1, 2], ["CS494", 3, 1], ["CS424", 3, 1], ["CS426", 3, 0], ["CS419", 3, 0]];

const PLAN = {"thesis": [["BAA00003", 10], ["BAA00103", 8], ["BAA00104", 11], ["CS333", 9], ["CS404", 11], ["CS405", 11], ["CS411", 9], ["CS414", 8], ["CS419", 8], ["CS422", 10], ["CS426", 9], ["CS468", 12], ["CS494", 10]], "capstone": [["BAA00003", 10], ["BAA00103", 12], ["BAA00104", 11], ["CS320", 9], ["CS333", 9], ["CS350", 10], ["CS404", 8], ["CS411", 10], ["CS419", 8], ["CS422", 11], ["CS426", 9], ["CS431", 12], ["CS469", 11], ["CS470", 12], ["CS494", 8]]};

const program = getProgram('apcs-2024');

/** Reads the credit groups through whatever API the engine currently exposes. */
function progressOf(record: StudentRecord, track: GradTrack) {
  const p = computeProgress(program, deriveCourseStates(program, record.attempts), track);
  const pick = (g: { required: number; earned: number; inProgress: number; planned: number }) =>
    ({ required: g.required, earned: g.earned, inProgress: g.inProgress, planned: g.planned });
  return {
    a: pick(p.a), nonCs: pick(p.nonCs), math: pick(p.math), phys: pick(p.phys),
    b: pick(p.b), c: pick(p.c), bc: pick(p.bc), grad: pick(p.grad), total: pick(p.total),
  };
}

describe('APCS golden behaviour', () => {

  it.each(['thesis', 'capstone'] as GradTrack[])('reports the same credit groups (%s)', (track) => {
    const record = sampleRecord({ gradTrack: track });
    const report = progressOf(record, track);
    expect(report).toEqual(EXPECTED[track]);
  });

  it('reports the same GPA and exclusions', () => {
    const record = sampleRecord();
    const gpa = cumulativeGpa(program, deriveCourseStates(program, record.attempts), record.gpaOverrides);
    expect(gpa.credits).toBe(GPA.credits);
    expect(gpa.gpa10).toBeCloseTo(GPA.gpa10, 10);
    expect(gpa.gpa4).toBeCloseTo(GPA.gpa4, 10);
    expect(gpa.excluded).toEqual(GPA.excluded);
  });

  it('reports the same checklist statuses', () => {
    expect(checklist(program, sampleRecord()).map((i) => [i.id, i.status])).toEqual(CHECKLIST);
  });

  it('reports the same warnings', () => {
    expect(planWarnings(program, sampleRecord()).map((w) => [w.id, w.severity])).toEqual(WARNINGS);
  });

  it('recommends the same courses in the same order', () => {
    const rows = recommend(program, sampleRecord(), 8).slice(0, 10);
    expect(rows.map((r) => [r.code, r.tier, r.unlocks])).toEqual(RECOMMEND);
  });

  it.each(['thesis', 'capstone'] as GradTrack[])('builds the same suggested plan (%s)', (track) => {
    const plan = suggestedPlanAttempts(program, sampleRecord({ gradTrack: track }));
    expect(plan.map((a) => [a.code, a.semester]).sort()).toEqual(PLAN[track]);
  });

  it('reports no graduation semester while the plan is incomplete', () => {
    expect(earliestGraduation(program, sampleRecord())).toBeNull();
  });
});

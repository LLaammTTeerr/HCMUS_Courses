import { describe, expect, it } from 'vitest';
import { progressOf } from './planner';
import { planWarnings, semesterCredits } from './planner';
import { parseQuickEntry } from './quickEntry';
import { suggestedPlanAttempts } from './suggestedPlan';
import { program, record } from './testUtils';
import type { Attempt, StudentRecord } from './types';

type GradTrack = 'thesis' | 'capstone' | 'undecided';

/** A student who followed the official plan for semesters 1–6 and takes semester 7's courses now. */
function onTrackRecord(track: GradTrack): StudentRecord {
  let id = 1;
  const attempts: Attempt[] = program.courses
    .filter((c) => c.suggestedSemester !== undefined && c.suggestedSemester <= 7 && c.requirement !== 'graduation')
    .filter((c) => !['MTH253', 'CS426', 'MTH346', 'CS418', 'CS419'].includes(c.code)) // skip optional electives
    .map((c) => ({
      id: id++, code: c.code, semester: c.suggestedSemester!,
      status: c.suggestedSemester! < 7 ? 'completed' : 'in-progress',
      grade10: c.suggestedSemester! < 7 ? 8 : null,
    }));
  return record(attempts, { choices: { gradTrack: track }, currentSemester: 7 });
}

function apply(r: StudentRecord): StudentRecord {
  let id = 1000;
  const added = suggestedPlanAttempts(program, r).map((a) => ({ ...a, id: id++ }));
  return { ...r, attempts: [...r.attempts, ...added] };
}

describe('suggestedPlanAttempts', () => {
  it.each(['thesis', 'capstone'] as GradTrack[])('completes every requirement for the %s track', (track) => {
    const r = apply(onTrackRecord(track));
    expect(progressOf(program, r).satisfied.planned).toBe(true);
  });

  it('only plans future semesters and respects the credit maximum', () => {
    const before = onTrackRecord('thesis');
    const added = suggestedPlanAttempts(program, before);
    expect(added.length).toBeGreaterThan(0);
    for (const a of added) {
      expect(a.status).toBe('planned');
      expect(a.semester).toBeGreaterThan(7);
    }
    for (const [sem, cr] of semesterCredits(program, apply(before).attempts)) {
      if (sem > 7) expect(cr, `semester ${sem}`).toBeLessThanOrEqual(program.meta.semesterMax);
    }
  });

  it('spreads credits so no semester before the final one drops below the minimum', () => {
    for (const track of ['thesis', 'capstone'] as GradTrack[]) {
      const r = apply(onTrackRecord(track));
      const ids = planWarnings(program, r).map((w) => w.id);
      expect(ids.filter((id) => id.startsWith('credits-')), track).toEqual([]);
    }
  });

  it('balances a realistic record with retakes and off-plan electives', () => {
    const lines = `CS160 1 8.5\nCM102 1 7.8\nMTH251 1 6.9\nPH211 1 7\nBAA00030 1 8\nCS163 2 8\nMTH252 2 5.5\nPH212 2 6.2
BAA00004 2 7\nCS202 3 9\nMTH261 3 7.5\nPH213 3 4.2\nBAA00101 3 6.8\nCS201 4 7.7\nCS252 4 8.8\nCS250 4 7.2\nSC203 4 8
BAA00021 4 9\nCS251 5 6.5\nECE341 5 7\nWR227 5 8.1\nSTAT451 5 6\nBAA00022 5 8.5\nCS323 6 8\nCS486 6 7.4\nSTAT452 6 6.6
MTH253 6 7\nPH213 6 6\nCS300 7\nCS311 7\nCS420 7\nBAA00102 7\nCS418 7`;
    const parsed = parseQuickEntry(program, lines, 7);
    expect(parsed.errors).toEqual([]);
    for (const track of ['thesis', 'capstone'] as GradTrack[]) {
      const base = record(parsed.rows.map(({ line, ...a }) => ({ ...a, id: line })), { choices: { gradTrack: track } });
      const r = apply(base);
      const ids = planWarnings(program, r).map((w) => w.id);
      expect(ids, track).toEqual([]);
    }
  });

  it('keeps graduation work in its suggested semesters', () => {
    const cap = suggestedPlanAttempts(program, onTrackRecord('capstone'));
    expect(cap.find((a) => a.code === 'CS469')?.semester).toBe(11);
    expect(cap.find((a) => a.code === 'CS470')?.semester).toBe(12);
    expect(suggestedPlanAttempts(program, onTrackRecord('thesis')).find((a) => a.code === 'CS468')?.semester).toBe(12);
  });

  it('places prior courses before the courses that need them', () => {
    const r = apply(onTrackRecord('capstone'));
    const ids = planWarnings(program, r).map((w) => w.id);
    expect(ids.filter((id) => id.startsWith('prereq-') || id === 'capstone-order')).toEqual([]);
  });

  it('includes CS320 and CS350 for the capstone track', () => {
    const codes = suggestedPlanAttempts(program, onTrackRecord('capstone')).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['CS320', 'CS350', 'CS469', 'CS470']));
    expect(codes).not.toContain('CS468');
  });

  it('skips graduation work when the track is undecided and adds nothing already covered', () => {
    const r = onTrackRecord('undecided');
    const codes = suggestedPlanAttempts(program, r).map((a) => a.code);
    expect(codes.some((c) => ['CS468', 'CS469', 'CS470'].includes(c))).toBe(false);
    const taken = new Set(r.attempts.map((a) => a.code));
    expect(codes.filter((c) => taken.has(c))).toEqual([]);
  });
});

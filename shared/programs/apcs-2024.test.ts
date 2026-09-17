import { describe, expect, it } from 'vitest';
import { courseIndex, getProgram } from './index';
import type { BucketId } from '../domain/types';

// Every number here is copied from CTĐT_APCS_2024 (docs/sources) — if a test fails,
// the JSON drifted from the official document.
const program = getProgram('apcs-2024');
const byBucket = (b: BucketId) => program.courses.filter((c) => c.bucket === b);
const credits = (b: BucketId) => byBucket(b).reduce((s, c) => s + c.credits, 0);

describe('apcs-2024 program data', () => {
  it('has the 69 courses of the appendix, unique codes', () => {
    expect(program.courses).toHaveLength(69);
    expect(new Set(program.courses.map((c) => c.code)).size).toBe(69);
  });

  it('matches the bucket structure of §6–7', () => {
    expect(byBucket('A_REQ')).toHaveLength(10);
    expect(credits('A_REQ')).toBe(40);
    expect(program.rules.aReqCredits).toBe(40);
    expect(byBucket('A_ELEC').map((c) => c.code).sort()).toEqual(['CS251', 'CS252', 'CS311', 'CS320', 'CS350', 'CS420']);
    expect(byBucket('NONCS')).toHaveLength(9);
    expect(credits('NONCS')).toBe(26);
    expect(byBucket('MATH')).toHaveLength(4);
    expect(credits('MATH')).toBe(16);
    expect(byBucket('PHYS')).toHaveLength(3);
    expect(credits('PHYS')).toBe(12);
    expect(byBucket('B').map((c) => c.code).sort()).toEqual(['MTH253', 'MTH344', 'MTH346', 'STAT452']);
    expect(byBucket('C')).toHaveLength(27);
    expect(byBucket('EXTRA').map((c) => c.code).sort()).toEqual(['BAA00021', 'BAA00022', 'BAA00030']);
  });

  it('has the graduation-work credits of §7.3', () => {
    const idx = courseIndex(program);
    expect(idx.get('CS468')?.credits).toBe(10);
    expect(idx.get('CS469')?.credits).toBe(5);
    expect(idx.get('CS470')?.credits).toBe(5);
  });

  it('has required totals: 110 compulsory + 43 elective + 10 graduation = 163', () => {
    const r = program.rules;
    expect(credits('A_REQ') + 16 + credits('NONCS') + credits('MATH') + credits('PHYS')).toBe(110);
    expect(110 + r.bcMin + r.gradCredits).toBe(r.totalCredits);
  });

  it('leaves Physical/Military Education and the political theory courses out of the GPA by default', () => {
    // PE/Military: CTĐT §7.1.2 note. Political theory (lý luận chính trị): excluded at the student's
    // direction under QC1175 Art. 15.1c ("other courses as specified"); BAA00004 (law) still counts.
    const excluded = program.courses
      .filter((c) => (c.countsInGpa ?? c.bucket !== 'EXTRA') === false)
      .map((c) => c.code)
      .sort();
    expect(excluded).toEqual(['BAA00003', 'BAA00021', 'BAA00022', 'BAA00030', 'BAA00101', 'BAA00102', 'BAA00103', 'BAA00104']);
  });

  it('only references existing courses in prerequisites and rules', () => {
    const idx = courseIndex(program);
    for (const c of program.courses) {
      for (const p of c.prereqs) expect(idx.has(p), `${c.code} → ${p}`).toBe(true);
      expect(c.prereqs).not.toContain(c.code);
    }
    const r = program.rules;
    for (const code of [...r.thesis, ...r.capstone, ...r.peCourses, r.militaryCourse]) {
      expect(idx.has(code), code).toBe(true);
    }
  });

  it('has an acyclic prerequisite graph', () => {
    const idx = courseIndex(program);
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (code: string, path: string[]) => {
      if (state.get(code) === 'done') return;
      expect(state.get(code), `cycle: ${[...path, code].join(' → ')}`).not.toBe('visiting');
      state.set(code, 'visiting');
      for (const p of idx.get(code)!.prereqs) visit(p, [...path, code]);
      state.set(code, 'done');
    };
    for (const c of program.courses) visit(c.code, []);
  });

  it('keeps suggested semesters inside the 12-semester plan', () => {
    for (const c of program.courses) {
      if (c.suggestedSemester === undefined) continue;
      expect(c.suggestedSemester).toBeGreaterThanOrEqual(1);
      expect(c.suggestedSemester).toBeLessThanOrEqual(program.rules.standardSemesters);
    }
  });

  it('documents every prerequisite that was not a same-name course reference', () => {
    // DESC21 named these prerequisites by the exact course (same code or same title).
    const direct = new Set(['CS251', 'CS311', 'MTH252', 'MTH261', 'PH212', 'PH213', 'MTH253', 'STAT452']);
    for (const c of program.courses) {
      if (c.prereqs.length === 0 || direct.has(c.code)) continue;
      expect(c.prereqNote, `${c.code} needs prereqNote`).toBeTruthy();
    }
  });
});

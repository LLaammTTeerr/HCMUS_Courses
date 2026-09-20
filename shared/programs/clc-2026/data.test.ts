import { describe, expect, it } from 'vitest';
import { courseIndex } from '../index';
import clc2026 from './index';
import coursesData from './courses.json';
import structure from './structure.json';

// Numbers copied from the CTĐT (QĐ 2693/QĐ-KHTN, 30/09/2024) §3 and §6–7.
const courses = coursesData.courses;
const byCode = new Map(courses.map((c) => [c.code, c]));
const credits = (codes: string[]) => codes.reduce((s, c) => s + (byCode.get(c)?.credits ?? 0), 0);

describe('clc-2026 program data', () => {
  it('has unique course codes and no orphan references', () => {
    expect(new Set(courses.map((c) => c.code)).size).toBe(courses.length);
    const index = courseIndex(clc2026);
    const referenced = [
      ...structure.blocks.generalPolitical.courses,
      ...structure.blocks.generalSocial.courses,
      ...structure.blocks.generalMath.compulsory,
      ...structure.blocks.generalMath.chooseOneOf,
      ...structure.blocks.generalMath.chooseCreditsFrom.courses,
      ...structure.blocks.generalInformatics.courses,
      ...structure.blocks.pe.courses,
      ...structure.blocks.military.courses,
      ...structure.blocks.foundation.courses,
      ...structure.specializations.flatMap((s) => [...s.compulsory.courses, ...s.elective.courses]),
      ...Object.values(structure.graduationOptions).flat(),
    ];
    for (const code of referenced) expect(index.has(code), code).toBe(true);
  });

  it('matches the printed block subtotals (§7)', () => {
    expect(credits(structure.blocks.generalPolitical.courses)).toBe(14);
    expect(structure.blocks.generalSocial.courses).toHaveLength(3);
    expect(structure.blocks.generalSocial.credits).toBe(2);
    expect(credits(structure.blocks.generalMath.compulsory)).toBe(24);
    expect(structure.blocks.generalMath.chooseOneOf).toHaveLength(3);
    expect(structure.blocks.generalMath.chooseCreditsFrom.credits).toBe(8);
    expect(credits(structure.blocks.generalInformatics.courses)).toBe(4);
    expect(credits(structure.blocks.pe.courses)).toBe(4);
    expect(credits(structure.blocks.military.courses)).toBe(4);
    expect(credits(structure.blocks.foundation.courses)).toBe(38);
  });

  it('adds up to the printed 138 credits (§3, §6)', () => {
    const general = 14 + 2 + 24 + 4 + 8 + 4;          // §7.1.1–7.1.4
    const specialization = 16 + 8 + 10;               // §7.2.2
    expect(general).toBe(56);
    expect(specialization).toBe(34);
    expect(general + 38 + specialization + 10).toBe(clc2026.meta.totalCredits);
    expect(clc2026.meta.totalCredits).toBe(138);
  });

  it('has the nine specializations with their printed minimums', () => {
    expect(structure.specializations).toHaveLength(9);
    for (const s of structure.specializations) {
      expect(s.compulsory.minCredits, s.id).toBe(16);
      expect(s.compulsory.minCourses, s.id).toBe(4);
      expect(s.elective.minCredits, s.id).toBe(8);
      expect(s.elective.minCourses, s.id).toBe(2);
      expect(credits(s.compulsory.courses), `${s.id} compulsory pool`).toBeGreaterThanOrEqual(16);
      expect(credits(s.elective.courses), `${s.id} elective pool`).toBeGreaterThanOrEqual(8);
      expect(s.nameVi.length).toBeGreaterThan(3);
    }
    expect(clc2026.choices.find((c) => c.id === 'specialization')!.options).toHaveLength(9);
  });

  it('keeps PE and Military Education out of the 138 credits and out of the GPA (§7.1.5–7.1.6)', () => {
    for (const code of [...structure.blocks.pe.courses, ...structure.blocks.military.courses]) {
      expect(byCode.get(code)!.countsInCredits, code).toBe(false);
      expect(byCode.get(code)!.countsInGpa, code).toBe(false);
    }
  });

  it('places the graduation options with their credits (§7.2.3)', () => {
    expect(byCode.get('CSC10251')!.credits).toBe(10);
    expect(byCode.get('CSC10252')!.credits).toBe(10);
    expect(byCode.get('CSC10204')!.credits).toBe(6);
    expect(clc2026.courses.filter((c) => c.requirement === 'graduation').map((c) => c.code).sort())
      .toEqual(['CSC10204', 'CSC10251', 'CSC10252', 'CSC15201', 'CSC15202']);
  });

  it('keeps suggested semesters inside the 12-semester plan', () => {
    for (const c of courses) {
      if (c.suggestedSemester === undefined) continue;
      expect(c.suggestedSemester).toBeGreaterThanOrEqual(1);
      expect(c.suggestedSemester).toBeLessThanOrEqual(clc2026.meta.standardSemesters);
    }
  });
});

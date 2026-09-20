import { describe, expect, it } from 'vitest';
import { recommend } from './recommend';
import { codesIn, done, passAll, planned, program, record } from './testUtils';

const firstYear = () => passAll(['CS160', 'CM102', 'MTH251', 'PH211', 'BAA00030', 'CS163', 'MTH252', 'PH212', 'BAA00004'], 1);

describe('recommend', () => {
  it('ranks required courses above electives', () => {
    const list = recommend(program, record(firstYear(), { currentSemester: 3 }), 3);
    const firstElective = list.findIndex((x) => x.tier > 0);
    expect(firstElective).toBeGreaterThan(0);
    expect(list.slice(0, firstElective).every((x) => x.tier === 0)).toBe(true);
    expect(list.find((x) => x.code === 'CS202')?.tier).toBe(0);
  });

  it('only lists courses whose prior courses are taken before the target', () => {
    const codes = recommend(program, record(firstYear(), { currentSemester: 3 }), 3).map((x) => x.code);
    expect(codes).toContain('CS202');
    expect(codes).not.toContain('CS333'); // needs CS201
    expect(codes).not.toContain('CS160'); // passed
  });

  it('excludes planned and in-progress courses', () => {
    const codes = recommend(program, record([...firstYear(), planned('CS202', 8)]), 8).map((x) => x.code);
    expect(codes).not.toContain('CS202');
  });

  it('demotes A electives once A reaches 56', () => {
    const base = [...firstYear(), ...passAll([...codesIn('A_REQ'), 'CS252', 'CS251', 'CS311', 'CS420'], 2)];
    const list = recommend(program, record(base), 8);
    const cs350 = list.find((x) => x.code === 'CS350');
    const mth253 = list.find((x) => x.code === 'MTH253');
    expect(cs350?.tier).toBe(3);
    expect(mth253?.tier).toBe(2);
    expect(list.indexOf(mth253!)).toBeLessThan(list.indexOf(cs350!));
  });

  it('counts how many courses each one unlocks and explains the rank', () => {
    const cs202 = recommend(program, record(firstYear(), { currentSemester: 3 }), 3).find((x) => x.code === 'CS202');
    expect(cs202?.unlocks).toBeGreaterThanOrEqual(5);
    expect(cs202?.reason).toMatch(/required · unlocks \d+/);
  });

  it('offers graduation work only from semester 11 and for the chosen track', () => {
    const base = passAll(['CS350', 'CS320', 'CS333', 'CS300', 'MTH251', 'CS251', 'CS311', 'CS202', 'CS201', 'CS160', 'CS163', 'CS250'], 3);
    expect(recommend(program, record(base), 10).map((x) => x.code)).not.toContain('CS469');
    expect(recommend(program, record(base, { choices: { gradTrack: 'capstone' } }), 11).map((x) => x.code)).toContain('CS469');
    expect(recommend(program, record(base, { choices: { gradTrack: 'capstone' } }), 11).map((x) => x.code)).not.toContain('CS468');
    expect(recommend(program, record(base, { choices: { gradTrack: 'thesis' } }), 11).map((x) => x.code)).not.toContain('CS469');
  });

  it('keeps failed courses eligible for retake and flags weak prior courses', () => {
    const list = recommend(program, record([done('CS160', 1, 3)], { currentSemester: 2 }), 2);
    expect(list.map((x) => x.code)).toContain('CS160');
    expect(list.find((x) => x.code === 'CS163')?.reason).toMatch(/CS160 not passed/);
  });
});

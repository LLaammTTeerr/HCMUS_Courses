import { describe, expect, it } from 'vitest';
import { requirementKind } from './requirement';
import { program } from './testUtils';

const kind = (code: string) => requirementKind(program.courses.find((c) => c.code === code)!);

describe('requirementKind (CTĐT §7: BB = compulsory, TC = elective)', () => {
  it('marks compulsory courses, including PE and Military Education', () => {
    for (const code of ['CS160', 'ECE341', 'CM102', 'BAA00101', 'BAA00004', 'MTH251', 'STAT451', 'PH213', 'BAA00021', 'BAA00030']) {
      expect(kind(code), code).toBe('compulsory');
    }
  });

  it('distinguishes electives chosen within a group from free CS electives and graduation work', () => {
    expect(kind('CS350')).toBe('choose');
    expect(kind('MTH346')).toBe('choose');
    expect(kind('CS414')).toBe('elective');
    expect(kind('CS468')).toBe('graduation');
    expect(kind('CS469')).toBe('graduation');
  });

  it('counts exactly the 29 compulsory courses of the program', () => {
    expect(program.courses.filter((c) => requirementKind(c) === 'compulsory')).toHaveLength(10 + 9 + 4 + 3 + 3);
  });
});

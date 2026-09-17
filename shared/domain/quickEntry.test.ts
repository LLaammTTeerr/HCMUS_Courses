import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from './quickEntry';
import { program } from './testUtils';

const parse = (text: string, current = 7) => parseQuickEntry(program, text, current);

describe('parseQuickEntry', () => {
  it('parses whitespace, tab, semicolon and comma-separated rows', () => {
    const { rows, errors } = parse('CS160 1 8.5\ncs163\t2\t7\nMTH251;1;9\nPH211,1,6.5');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 1, code: 'CS160', semester: 1, status: 'completed', grade10: 8.5 },
      { line: 2, code: 'CS163', semester: 2, status: 'completed', grade10: 7 },
      { line: 3, code: 'MTH251', semester: 1, status: 'completed', grade10: 9 },
      { line: 4, code: 'PH211', semester: 1, status: 'completed', grade10: 6.5 },
    ]);
  });

  it('accepts a decimal comma when fields are space-separated', () => {
    expect(parse('CS160 1 8,5').rows[0].grade10).toBe(8.5);
  });

  it('derives in-progress / planned status when no grade is given', () => {
    const { rows, errors } = parse('CS300 7\nCS333 8');
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['in-progress', 'planned']);
  });

  it('skips blank and comment lines', () => {
    expect(parse('\n# header\n  \nCS160 1 8').rows).toHaveLength(1);
  });

  it('reports errors with line numbers', () => {
    const { rows, errors } = parse('XX999 1 8\nCS160 0 8\nCS163 2 11\nCS202 2\nCS250 abc 5\nCS160\nCS201 3 8\nCS201 3 9');
    expect(rows.map((r) => r.code)).toEqual(['CS201']);
    expect(errors).toEqual([
      { line: 1, message: 'Unknown course code XX999' },
      { line: 2, message: 'Semester must be a whole number from 1 to 21' },
      { line: 3, message: 'Grade must be a number from 0 to 10' },
      { line: 4, message: 'Grade is required for a past semester' },
      { line: 5, message: 'Semester must be a whole number from 1 to 21' },
      { line: 6, message: 'Expected: CODE SEMESTER [GRADE]' },
      { line: 8, message: 'CS201 is listed twice for semester 3' },
    ]);
  });
});

import { courseIndex } from '../programs/index';
import type { NewAttempt, Program } from './types';

export interface QuickEntryRow extends NewAttempt {
  line: number;
}

export interface QuickEntryResult {
  rows: QuickEntryRow[];
  errors: { line: number; message: string }[];
}

/**
 * Parses bulk course entry, one attempt per line: `CODE SEMESTER [GRADE]`.
 * Fields may be separated by spaces, tabs, semicolons, or commas (CSV). With space/tab/semicolon
 * separators a decimal comma is accepted (8,5). Without a grade the attempt is in progress for the
 * current semester and planned for a later one. Lines starting with # are ignored.
 */
export function parseQuickEntry(program: Program, text: string, currentSemester: number): QuickEntryResult {
  const index = courseIndex(program);
  const max = program.rules.maxSemesters;
  const rows: QuickEntryRow[] = [];
  const errors: QuickEntryResult['errors'] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const fail = (message: string) => errors.push({ line, message });

    const fields = /[\s;]/.test(trimmed) ? trimmed.split(/[\s;]+/) : trimmed.split(',');
    if (fields.length < 2 || fields.length > 3) return fail('Expected: CODE SEMESTER [GRADE]');

    const code = fields[0].toUpperCase();
    if (!index.has(code)) return fail(`Unknown course code ${code}`);

    const semester = Number(fields[1]);
    if (!Number.isInteger(semester) || semester < 1 || semester > max) {
      return fail(`Semester must be a whole number from 1 to ${max}`);
    }

    let grade10: number | null = null;
    if (fields[2] !== undefined) {
      grade10 = Number(fields[2].replace(',', '.'));
      if (!Number.isFinite(grade10) || grade10 < 0 || grade10 > 10) return fail('Grade must be a number from 0 to 10');
    } else if (semester < currentSemester) {
      return fail('Grade is required for a past semester');
    }

    const key = `${code}@${semester}`;
    if (seen.has(key)) return fail(`${code} is listed twice for semester ${semester}`);
    seen.add(key);

    const status = grade10 !== null ? 'completed' : semester === currentSemester ? 'in-progress' : 'planned';
    rows.push({ line, code, semester, status, grade10 });
  });

  return { rows, errors };
}

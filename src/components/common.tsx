import type { Program } from '../../shared/domain/program';
import { REQUIREMENT_LABELS, requirementKind } from '../../shared/domain/requirement';
import type { Course, CourseStatus } from '../../shared/domain/types';

/** Display groups of a program, in the order its course list defines them. */
export function courseGroups(program: Program): string[] {
  const seen: string[] = [];
  for (const c of program.courses) if (!seen.includes(c.group)) seen.push(c.group);
  return seen;
}

export const STATUS_LABELS: Record<CourseStatus, string> = {
  passed: 'Passed',
  'in-progress': 'In progress',
  planned: 'Planned',
  failed: 'Failed',
  'not-taken': 'Not taken',
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}

export const fmt = (n: number | null, digits = 2) => (n === null ? '—' : n.toFixed(digits));

export const shortSemester = (n: number) => `S${n}`;

/** Compulsory / elective marker (CTĐT "Loại HP"). `compact` shows only compulsory courses, as a short pill. */
export function RequirementBadge({ course, compact = false }: { course: Course; compact?: boolean }) {
  const kind = requirementKind(course);
  const label = REQUIREMENT_LABELS[kind];
  if (compact) {
    return kind === 'compulsory'
      ? <span className="req-pill" title={label.long} aria-label={label.long}>Req</span>
      : null;
  }
  return <span className={`badge req-${kind}`} title={label.long}>{label.short}</span>;
}

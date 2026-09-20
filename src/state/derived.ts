import { useMemo } from 'react';
import { checklist } from '../../shared/domain/checklist';
import { deriveCourseStates } from '../../shared/domain/courseState';
import { cumulativeGpa, yearLevel } from '../../shared/domain/gpa';
import { academicWarnings, earliestGraduation, planWarnings, progressOf } from '../../shared/domain/planner';
import type { Program } from '../../shared/domain/program';
import type { StudentRecord } from '../../shared/domain/types';
import { getProgram } from '../../shared/programs/index';

export type Derived = ReturnType<typeof derive>;

function derive(record: StudentRecord) {
  const program: Program = getProgram(record.profile.programId);
  const states = deriveCourseStates(program, record.attempts);
  const report = progressOf(program, record, states);
  const gpa = cumulativeGpa(program, states, record.gpaOverrides);
  const warnings = [...planWarnings(program, record), ...academicWarnings(program, record)];
  return {
    program,
    states,
    report,
    gpa,
    yearLevel: yearLevel(report.total.earned),
    warnings,
    checklist: checklist(program, record),
    graduation: earliestGraduation(program, record),
  };
}

/** Everything the pages show, computed from the record by the shared rules engine. */
export function useDerived(record: StudentRecord): Derived {
  return useMemo(() => derive(record), [record]);
}

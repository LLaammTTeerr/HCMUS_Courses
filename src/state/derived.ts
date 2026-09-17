import { useMemo } from 'react';
import { checklist } from '../../shared/domain/checklist';
import { deriveCourseStates } from '../../shared/domain/courseState';
import { computeProgress } from '../../shared/domain/credits';
import { cumulativeGpa, yearLevel } from '../../shared/domain/gpa';
import { academicWarnings, earliestGraduation, planWarnings } from '../../shared/domain/planner';
import type { Program, StudentRecord } from '../../shared/domain/types';
import { getProgram } from '../../shared/programs/index';

export type Derived = ReturnType<typeof derive>;

function derive(record: StudentRecord) {
  const program: Program = getProgram(record.profile.programId);
  const states = deriveCourseStates(program, record.attempts);
  const progress = computeProgress(program, states, record.profile.gradTrack);
  const gpa = cumulativeGpa(program, states);
  const warnings = [...planWarnings(program, record), ...academicWarnings(program, record)];
  return {
    program,
    states,
    progress,
    gpa,
    yearLevel: yearLevel(progress.total.earned),
    warnings,
    checklist: checklist(program, record),
    graduation: earliestGraduation(program, record),
  };
}

/** Everything the pages show, computed from the record by the shared rules engine. */
export function useDerived(record: StudentRecord): Derived {
  return useMemo(() => derive(record), [record]);
}

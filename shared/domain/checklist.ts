import { deriveCourseStates } from './courseState';
import { isCovered, buildContext, type Program } from './program';
import type { StudentRecord } from './types';

export type ChecklistStatus = 'done' | 'covered-by-plan' | 'missing' | 'unknown';

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
  /** Where the requirement comes from. */
  source: string;
}

const levelStatus = (earned: boolean, planned: boolean): ChecklistStatus =>
  earned ? 'done' : planned ? 'covered-by-plan' : 'missing';

/**
 * Graduation conditions (QC1175 Art. 17). Credit items come from the program's requirement report,
 * the rest are university-wide; anything program-specific is added by the program module.
 */
export function checklist(program: Program, record: StudentRecord): ChecklistItem[] {
  const meta = program.meta;
  const states = deriveCourseStates(program, record.attempts);
  const ctx = buildContext(program, record, states);
  const report = program.progress(ctx);
  const items: ChecklistItem[] = [];

  const creditItem = (id: string, label: string, g: { earned: number; planned: number; required: number }, source: string) =>
    items.push({
      id, label, source,
      status: levelStatus(g.earned >= g.required, g.planned >= g.required),
      detail: `${g.earned} / ${g.required} credits earned · ${g.planned} with plan`,
    });

  creditItem('total', `At least ${meta.totalCredits} credits`, report.total, 'CTĐT — total credits');

  const extraCodes = [...meta.peCourses, meta.militaryCourse];
  const missingAt = (level: 'earned' | 'planned') =>
    report.groups.flatMap((g) => g.missing?.[level] ?? []).filter((c) => !extraCodes.includes(c));
  const missingEarned = missingAt('earned');
  items.push({
    id: 'required-courses', label: 'All compulsory courses passed', source: 'CTĐT — compulsory courses',
    status: levelStatus(missingEarned.length === 0, missingAt('planned').length === 0),
    detail: missingEarned.length === 0 ? 'All passed' : `Not passed: ${missingEarned.join(', ')}`,
  });

  for (const g of report.groups) {
    if (!g.checklist) continue;   // course-list groups are covered by "All compulsory courses passed"
    creditItem(g.id, `${g.label} ≥ ${g.required} credits`, g, 'CTĐT — credit blocks');
  }

  const pe = meta.peCourses;
  items.push({
    id: 'pe', label: 'Physical Education passed', source: 'QC1175 Art. 17.3c',
    status: levelStatus(pe.every((c) => isCovered(states.get(c), 'earned')), pe.every((c) => isCovered(states.get(c), 'planned'))),
    detail: pe.map((c) => `${c}: ${states.get(c)?.status ?? 'unknown'}`).join(' · '),
  });

  const military = states.get(meta.militaryCourse);
  const militaryPassed = military?.status === 'passed';
  items.push({
    id: 'military', label: 'Military Education passed with certificate', source: 'QC1175 Art. 17.3c',
    status: militaryPassed && record.profile.militaryCert ? 'done'
      : isCovered(military, 'planned') && !militaryPassed ? 'covered-by-plan' : 'missing',
    detail: `${meta.militaryCourse}: ${military?.status ?? 'unknown'} · certificate ${record.profile.militaryCert ? 'received' : 'not recorded'}`,
  });

  items.push({
    id: 'it', label: 'IT standard (chuẩn tin học)', source: 'QC1175 Art. 17.3e', status: 'unknown',
    detail: 'Not defined in the program document — confirm with giáo vụ (likely not required for IT students)',
  });

  items.push(...program.checklistItems(ctx));
  return items;
}

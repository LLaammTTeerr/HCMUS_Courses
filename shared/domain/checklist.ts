import { deriveCourseStates } from './courseState';
import { computeProgress, isCovered, type BucketProgress } from './credits';
import { englishMeets, englishValidUntil, ENGLISH_MINIMUMS } from './english';
import { cumulativeGpa } from './gpa';
import { earliestGraduation } from './planner';
import { semesterEndDate, semesterLabel } from './semesters';
import type { Program, StudentRecord } from './types';

export type ChecklistStatus = 'done' | 'covered-by-plan' | 'missing' | 'unknown';

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
  /** Where the requirement comes from. */
  source: string;
}

/** Graduation conditions (QC1175 Art. 17 + CTĐT §5.2 + QĐ1985). */
export function checklist(program: Program, record: StudentRecord): ChecklistItem[] {
  const r = program.rules;
  const { profile } = record;
  const states = deriveCourseStates(program, record.attempts);
  const p = computeProgress(program, states, profile.gradTrack);
  const items: ChecklistItem[] = [];

  const levelStatus = (earned: boolean, planned: boolean): ChecklistStatus =>
    earned ? 'done' : planned ? 'covered-by-plan' : 'missing';
  const creditItem = (id: string, label: string, b: BucketProgress, source: string) =>
    items.push({
      id, label, source,
      status: levelStatus(b.earned >= b.required, b.planned >= b.required),
      detail: `${b.earned} / ${b.required} credits earned · ${b.planned} with plan`,
    });

  creditItem('total', `At least ${r.totalCredits} credits`, p.total, 'CTĐT §3, §6');
  const missing = p.missingRequired;
  const requiredOnly = (codes: string[]) => codes.filter((c) => ![...r.peCourses, r.militaryCourse].includes(c));
  items.push({
    id: 'required-courses', label: 'All compulsory courses passed', source: 'CTĐT §7.1',
    status: levelStatus(requiredOnly(missing.earned).length === 0, requiredOnly(missing.planned).length === 0),
    detail: requiredOnly(missing.earned).length === 0
      ? 'All passed'
      : `Not passed: ${requiredOnly(missing.earned).join(', ')}`,
  });
  creditItem('a', `Computer Science (A) ≥ ${r.aMin} credits`, p.a, 'CTĐT §7.1.1');
  creditItem('b', `Math electives (B) ≥ ${r.bMin} credits`, p.b, 'CTĐT §7.2.1');
  creditItem('bc', `B + C electives ≥ ${r.bcMin} credits`, p.bc, 'CTĐT §6, §7.2.2');
  creditItem('grad', `Graduation work ${r.gradCredits} credits`, p.grad, 'CTĐT §7.3');

  const pe = r.peCourses;
  items.push({
    id: 'pe', label: 'Physical Education 1 and 2 passed', source: 'QC1175 Art. 17.3c',
    status: levelStatus(pe.every((c) => isCovered(states.get(c), 'earned')), pe.every((c) => isCovered(states.get(c), 'planned'))),
    detail: pe.map((c) => `${c}: ${states.get(c)!.status}`).join(' · '),
  });

  const military = states.get(r.militaryCourse)!;
  const militaryPassed = military.status === 'passed';
  items.push({
    id: 'military', label: 'Military Education passed with certificate', source: 'QC1175 Art. 17.3c',
    status: militaryPassed && profile.militaryCert ? 'done' : isCovered(military, 'planned') && !militaryPassed ? 'covered-by-plan' : 'missing',
    detail: `${r.militaryCourse}: ${military.status} · certificate ${profile.militaryCert ? 'received' : 'not recorded'}`,
  });

  const gradSemester = earliestGraduation(program, record) ?? Math.max(r.standardSemesters, profile.currentSemester);
  const gradEnd = semesterEndDate(program, gradSemester);
  const cert = record.english;
  let english: Pick<ChecklistItem, 'status' | 'detail'>;
  if (!cert) {
    english = { status: 'missing', detail: 'No certificate recorded (IELTS 6.0 / TOEFL iBT 79 / TOEFL ITP 550 + TOEIC S&W 270)' };
  } else {
    const min = ENGLISH_MINIMUMS[cert.type];
    const until = englishValidUntil(program, cert);
    if (!englishMeets(cert)) {
      english = { status: 'missing', detail: `${min.label} score below the minimum` };
    } else if (until < gradEnd) {
      english = { status: 'missing', detail: `Valid until ${until}, before graduation (${semesterLabel(program, gradSemester)} ends ${gradEnd})` };
    } else {
      english = { status: 'done', detail: `${min.label} valid until ${until}` };
    }
  }
  items.push({ id: 'english', label: 'English standard', source: 'QĐ1985 Art. 2', ...english });

  items.push({
    id: 'it', label: 'IT standard (chuẩn tin học)', source: 'QC1175 Art. 17.3e', status: 'unknown',
    detail: 'Not defined in the APCS 2024 program — confirm with giáo vụ (likely not required for CS)',
  });

  if (profile.gradTrack === 'thesis') {
    const { gpa10 } = cumulativeGpa(program, states, record.gpaOverrides);
    const threshold = profile.thesisGpaThreshold;
    items.push({
      id: 'thesis-gpa', label: 'GPA eligible for thesis', source: 'QC1175 Art. 10.1d (threshold set by the faculty)',
      status: threshold === null ? 'unknown' : gpa10 !== null && gpa10 >= threshold ? 'done' : 'missing',
      detail: threshold === null
        ? 'Enter the faculty threshold'
        : `ĐTB tích lũy ${gpa10?.toFixed(2) ?? '—'} vs threshold ${threshold}`,
    });
  }
  return items;
}

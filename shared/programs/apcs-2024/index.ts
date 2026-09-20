// APCS — Advanced Program in Computer Science, intake 2024.
// Rules from CTĐT_APCS_2024 §6–7 (credit blocks) and QĐ1985 (English standard); see meta.json sources.
import type { ChecklistItem } from '../../domain/checklist';
import { englishMeets, englishValidUntil, ENGLISH_MINIMUMS } from '../../domain/english';
import { cumulativeGpa } from '../../domain/gpa';
import { earliestGraduation } from '../../domain/planner';
import {
  buildContext, creditsOf, group, isCovered,
  type CourseNeed, type GroupProgress, type Level, type ProgramChoice, type ProgramMeta,
  type ProgramModule, type ProgressReport, type RuleContext,
} from '../../domain/program';
import { semesterEndDate, semesterLabel } from '../../domain/semesters';
import type { Course, CourseState, Warning } from '../../domain/types';
import coursesData from './courses.json';
import metaData from './meta.json';

/** Credit blocks of the 2024 curriculum (CTĐT §6). */
type Bucket = 'A_REQ' | 'A_ELEC' | 'NONCS' | 'MATH' | 'PHYS' | 'B' | 'C' | 'GRAD' | 'EXTRA';
type ApcsCourse = Course & { bucket: Bucket };

export const meta = metaData.meta as ProgramMeta;
const rules = metaData.rules;
const courses = coursesData.courses as ApcsCourse[];
const inBucket = (bucket: Bucket) => courses.filter((c) => c.bucket === bucket);
const bucketOf = new Map(courses.map((c) => [c.code, c.bucket]));

/** Courses that must be passed individually (the rest are credit totals). */
const REQUIRED_BUCKETS: Bucket[] = ['A_REQ', 'NONCS', 'MATH', 'PHYS', 'EXTRA'];

const choices: ProgramChoice[] = [
  {
    id: 'gradTrack',
    label: 'Graduation work',
    required: true,
    options: [
      { id: 'thesis', label: 'Thesis (CS468)', note: '10 credits in the final semester' },
      { id: 'capstone', label: 'Capstone (CS469 → CS470)', note: 'both halves required; CS469 alone earns nothing' },
      { id: 'undecided', label: 'Undecided' },
    ],
  },
];

const track = (ctx: RuleContext) => ctx.choice('gradTrack') ?? 'undecided';

function gradCredits(states: Map<string, CourseState>, chosen: string, level: Level): number {
  const covered = (code: string) => isCovered(states.get(code), level);
  const sum = (codes: string[]) => codes.reduce((s, c) => s + (courses.find((x) => x.code === c)?.credits ?? 0), 0);
  const thesis = rules.thesis.every(covered) ? sum(rules.thesis) : 0;
  const capstone = rules.capstone.every(covered) ? sum(rules.capstone) : 0;
  const value = chosen === 'thesis' ? thesis : chosen === 'capstone' ? capstone : Math.max(thesis, capstone);
  return Math.min(value, rules.gradCredits);
}

/** Credits per block at a projection level, with the A surplus spilling into C (CTĐT §7.1.1 note). */
function blocks(states: Map<string, CourseState>, chosen: string) {
  const a = (l: Level) => creditsOf(inBucket('A_REQ'), states, l) + creditsOf(inBucket('A_ELEC'), states, l);
  const overflowA = (l: Level) => Math.max(0, a(l) - rules.aMin);
  const c = (l: Level) => creditsOf(inBucket('C'), states, l) + overflowA(l);
  const b = (l: Level) => creditsOf(inBucket('B'), states, l);
  const grad = (l: Level) => gradCredits(states, chosen, l);
  const plain = (bucket: Bucket) => (l: Level) => creditsOf(inBucket(bucket), states, l);
  const total = (l: Level) =>
    a(l) + plain('NONCS')(l) + plain('MATH')(l) + plain('PHYS')(l) + b(l) + plain('C')(l) + grad(l);
  return { a, b, c, overflowA, grad, total, plain, bc: (l: Level) => b(l) + c(l) };
}

function missingRequired(states: Map<string, CourseState>) {
  const at = (level: Level) =>
    courses.filter((c) => REQUIRED_BUCKETS.includes(c.bucket) && !isCovered(states.get(c.code), level)).map((c) => c.code);
  return { earned: at('earned'), planned: at('planned') };
}

function progress(ctx: RuleContext): ProgressReport {
  const { states } = ctx;
  const chosen = track(ctx);
  const f = blocks(states, chosen);
  const bucketCredits = (bucket: Bucket) => inBucket(bucket).reduce((s, c) => s + c.credits, 0);
  const missing = missingRequired(states);
  const overflow = f.overflowA('earned');

  const groups: GroupProgress[] = [
    group('a', 'Computer Science (A)', rules.aMin, f.a, {
      checklist: true,
      note: `required ${creditsOf(inBucket('A_REQ'), states, 'earned')}/${rules.aReqCredits}` +
        ` · electives ${creditsOf(inBucket('A_ELEC'), states, 'earned')}/${rules.aMin - rules.aReqCredits}` +
        (overflow > 0 ? ` · +${overflow} surplus counts toward C` : ''),
      missing: {
        earned: missing.earned.filter((c) => bucketOf.get(c) === 'A_REQ'),
        planned: missing.planned.filter((c) => bucketOf.get(c) === 'A_REQ'),
      },
    }),
    group('nonCs', 'Non Computer Science', bucketCredits('NONCS'), f.plain('NONCS'), {
      warn: false,
      missing: {
        earned: missing.earned.filter((c) => bucketOf.get(c) === 'NONCS'),
        planned: missing.planned.filter((c) => bucketOf.get(c) === 'NONCS'),
      },
    }),
    group('math', 'Math', bucketCredits('MATH'), f.plain('MATH'), { warn: false }),
    group('phys', 'Physics', bucketCredits('PHYS'), f.plain('PHYS'), { warn: false }),
    group('b', 'Math electives (B)', rules.bMin, f.b, { checklist: true }),
    group('c', 'CS electives (C)', rules.bcMin - rules.bMin, f.c, {
      approx: true,
      note: overflow > 0 ? `includes +${overflow} surplus from A` : undefined,
    }),
    group('bc', 'B + C electives', rules.bcMin, f.bc, { checklist: true }),
    // The track warnings below say more than a credit shortfall would.
    group('grad', `Graduation work (${chosen})`, rules.gradCredits, f.grad, { checklist: true, warn: false }),
  ];

  const total = group('total', 'Total', meta.totalCredits, f.total);
  const satisfiedAt = (level: Level, missingCodes: string[]) =>
    missingCodes.length === 0 && groups.every((g) => g[level] >= g.required) && total[level] >= total.required;

  return {
    groups,
    total,
    satisfied: {
      earned: satisfiedAt('earned', missing.earned),
      planned: satisfiedAt('planned', missing.planned),
    },
  };
}

function courseNeed(code: string, ctx: RuleContext): CourseNeed | null {
  const bucket = bucketOf.get(code);
  if (!bucket) return null;
  if (bucket === 'GRAD') {
    const chosen = track(ctx);
    const allowed = chosen === 'thesis' ? rules.thesis : chosen === 'capstone' ? rules.capstone : [...rules.thesis, ...rules.capstone];
    if (!allowed.includes(code)) return null;
  }
  const report = progress(ctx);
  const value = (id: string) => report.groups.find((g) => g.id === id)!;
  if (REQUIRED_BUCKETS.includes(bucket) || bucket === 'GRAD') return { tier: 0, label: 'required' };
  if (bucket === 'A_ELEC' && value('a').planned < rules.aMin) return { tier: 1, label: 'A elective needed' };
  if (bucket === 'B' && value('b').planned < rules.bMin) return { tier: 2, label: 'math elective needed' };
  if (['A_ELEC', 'B', 'C'].includes(bucket) && value('bc').planned < rules.bcMin) {
    return { tier: 3, label: 'counts toward B + C' };
  }
  return { tier: 4, label: 'extra (requirement already covered)' };
}

/**
 * Courses the plan still needs, in official suggested order: required courses, electives only while
 * their block is short, and the graduation work of the chosen track with its prior courses.
 */
function coursesToPlan(ctx: RuleContext): Course[] {
  const { states } = ctx;
  const chosen = track(ctx);
  const covered = (code: string) => isCovered(states.get(code), 'planned');
  const trackCourses = chosen === 'thesis' ? rules.thesis : chosen === 'capstone' ? rules.capstone : [];
  const byCode = new Map(courses.map((c) => [c.code, c]));

  const forced = new Set<string>();
  const force = (code: string) => {
    if (forced.has(code)) return;
    forced.add(code);
    byCode.get(code)!.prereqs.forEach(force);
  };
  trackCourses.forEach(force);

  const order = (c: ApcsCourse) => (REQUIRED_BUCKETS.includes(c.bucket) ? 0 : c.bucket === 'GRAD' ? 2 : 1);
  const pending = courses
    .filter((c) => !covered(c.code) && (c.bucket !== 'GRAD' || trackCourses.includes(c.code)))
    .sort((x, y) =>
      (x.suggestedSemester ?? 99) - (y.suggestedSemester ?? 99) || order(x) - order(y) || x.code.localeCompare(y.code));

  const f = blocks(states, chosen);
  let a = f.a('planned'), b = f.b('planned'), c = creditsOf(inBucket('C'), states, 'planned');
  const bc = () => b + c + Math.max(0, a - rules.aMin);
  const needed = (course: ApcsCourse) => {
    if (REQUIRED_BUCKETS.includes(course.bucket) || course.bucket === 'GRAD' || forced.has(course.code)) return true;
    if (course.bucket === 'A_ELEC') return a < rules.aMin;
    if (course.bucket === 'B') return b < rules.bMin;
    if (course.bucket === 'C') return bc() < rules.bcMin;
    return false;
  };

  const selected = new Set(pending.filter(needed).map((x) => x.code));
  const chosenCourses: Course[] = [];
  while (pending.length > 0) {
    const i = pending.findIndex((course) => course.prereqs.every((p) => !selected.has(p) || !pending.some((q) => q.code === p)));
    const course = pending.splice(i === -1 ? 0 : i, 1)[0];
    if (!needed(course)) {
      selected.delete(course.code);
      continue;
    }
    chosenCourses.push(course);
    if (course.bucket === 'A_REQ' || course.bucket === 'A_ELEC') a += course.credits;
    if (course.bucket === 'B') b += course.credits;
    if (course.bucket === 'C') c += course.credits;
  }
  return chosenCourses;
}

/** English standard for APCS K2024 (QĐ1985 Art. 2). */
function englishItem(ctx: RuleContext): ChecklistItem[] {
  const { program, record } = ctx;
  const cert = record.english;
  const gradSemester = earliestGraduation(program, record) ?? Math.max(meta.standardSemesters, record.profile.currentSemester);
  const gradEnd = semesterEndDate(program, gradSemester);
  const source = 'QĐ1985 Art. 2';

  if (!cert) {
    return [{
      id: 'english', label: 'English standard', source, status: 'missing',
      detail: 'No certificate recorded (IELTS 6.0 / TOEFL iBT 79 / TOEFL ITP 550 + TOEIC S&W 270)',
    }];
  }
  const min = ENGLISH_MINIMUMS[cert.type];
  const until = englishValidUntil(program, cert);
  if (!englishMeets(cert)) {
    return [{ id: 'english', label: 'English standard', source, status: 'missing', detail: `${min.label} score below the minimum` }];
  }
  if (until < gradEnd) {
    return [{
      id: 'english', label: 'English standard', source, status: 'missing',
      detail: `Valid until ${until}, before graduation (${semesterLabel(program, gradSemester)} ends ${gradEnd})`,
    }];
  }
  return [{ id: 'english', label: 'English standard', source, status: 'done', detail: `${min.label} valid until ${until}` }];
}

/** Thesis eligibility: the faculty's GPA threshold is not published, so the student enters it. */
function thesisGpaItem(ctx: RuleContext): ChecklistItem[] {
  if (track(ctx) !== 'thesis') return [];
  const { gpa10 } = cumulativeGpa(ctx.program, ctx.states, ctx.record.gpaOverrides);
  const threshold = ctx.record.profile.thesisGpaThreshold;
  return [{
    id: 'thesis-gpa', label: 'GPA eligible for thesis', source: 'QC1175 Art. 10.1d (threshold set by the faculty)',
    status: threshold === null ? 'unknown' : gpa10 !== null && gpa10 >= threshold ? 'done' : 'missing',
    detail: threshold === null ? 'Enter the faculty threshold' : `ĐTB tích lũy ${gpa10?.toFixed(2) ?? '—'} vs threshold ${threshold}`,
  }];
}

function warnings(ctx: RuleContext): Warning[] {
  const { states } = ctx;
  const chosen = track(ctx);
  const covered = (code: string) => isCovered(states.get(code), 'planned');
  const touched = (code: string) => (states.get(code)?.attempts.length ?? 0) > 0;
  const out: Warning[] = [];

  if (chosen === 'thesis') {
    if (!rules.thesis.every(covered)) {
      out.push({ id: 'track-thesis-missing', severity: 'warning', link: 'planner', message: `Thesis track: plan ${rules.thesis.join(', ')}` });
    }
    for (const code of rules.capstone.filter(touched)) {
      out.push({ id: `track-other-${code}`, severity: 'warning', code, link: 'planner',
        message: `${code} belongs to the capstone track, but the track is set to thesis` });
    }
  } else if (chosen === 'capstone') {
    if (!rules.capstone.every(covered)) {
      out.push({ id: 'track-capstone-missing', severity: 'warning', link: 'planner',
        message: `Capstone track: plan both ${rules.capstone.join(' and ')} (${rules.capstone[0]} alone earns no credit)` });
    }
    for (const code of rules.thesis.filter(touched)) {
      out.push({ id: `track-other-${code}`, severity: 'warning', code, link: 'planner',
        message: `${code} belongs to the thesis track, but the track is set to capstone` });
    }
  } else if (!rules.thesis.every(covered) && !rules.capstone.every(covered)) {
    out.push({ id: 'track-undecided', severity: 'info', link: 'planner',
      message: `Graduation work: choose thesis (${rules.thesis.join(', ')}) or capstone (${rules.capstone.join(' + ')})` });
  }

  const [first, second] = rules.capstone;
  const semesterOf = (code: string) => states.get(code)?.passedSemester ?? states.get(code)?.activeSemester ?? null;
  const s1 = semesterOf(first);
  const s2 = semesterOf(second);
  if (s2 !== null && (s1 === null || s2 <= s1)) {
    out.push({ id: 'capstone-order', severity: 'error', code: second, link: 'planner',
      message: `${second} must be taken in a semester after ${first} (${first} must be completed first)` });
  }
  return out;
}

const checklistItems = (ctx: RuleContext): ChecklistItem[] => [...englishItem(ctx), ...thesisGpaItem(ctx)];

export const apcs2024: ProgramModule = {
  meta,
  courses,
  choices,
  progress,
  courseNeed,
  coursesToPlan,
  checklistItems,
  warnings,
};

export { buildContext };
export default apcs2024;

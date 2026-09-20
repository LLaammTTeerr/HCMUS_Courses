// CLC / Chương trình Tăng cường tiếng Anh ngành Công nghệ thông tin.
// Rules from the 2024 curriculum (QĐ 2693/QĐ-KHTN) §3, §6–7; used for the 2026 intake until the 2026
// document is published, so only the intake year differs (semester labels).
import type { ChecklistItem } from '../../domain/checklist';
import {
  creditsOf, group, isCovered,
  type CourseNeed, type GroupProgress, type Level, type ProgramChoice, type ProgramMeta,
  type ProgramModule, type ProgressReport, type RuleContext,
} from '../../domain/program';
import type { Course, CourseState, Warning } from '../../domain/types';
import coursesData from './courses.json';
import metaData from './meta.json';
import structureData from './structure.json';

export const meta = metaData.meta as ProgramMeta;
const courses = coursesData.courses as Course[];
const byCode = new Map(courses.map((c) => [c.code, c]));
const s = structureData;
const blocks = s.blocks;

const list = (codes: string[]): Course[] => codes.map((c) => byCode.get(c)!).filter(Boolean);
const creditsFor = (codes: string[], states: Map<string, CourseState>, level: Level) =>
  creditsOf(list(codes), states, level);
const countCovered = (codes: string[], states: Map<string, CourseState>, level: Level) =>
  codes.filter((c) => isCovered(states.get(c), level)).length;

const specialization = (id: string | null) => s.specializations.find((x) => x.id === id) ?? null;

const choices: ProgramChoice[] = [
  {
    id: 'specialization',
    label: 'Specialization (chuyên ngành)',
    required: true,
    options: s.specializations.map((x) => ({ id: x.id, label: x.nameVi })),
  },
  {
    id: 'gradTrack',
    label: 'Graduation work',
    required: true,
    options: [
      { id: 'thesis', label: 'Khóa luận tốt nghiệp', note: 'CSC10251 · 10 credits' },
      { id: 'internship', label: 'Thực tập tốt nghiệp', note: 'CSC10252 · 10 credits' },
      { id: 'project', label: 'Thực tập dự án tốt nghiệp', note: 'CSC10204 (6) + a 4-credit graduation course' },
    ],
  },
];

const GRAD_OPTIONS: Record<string, string[]> = s.graduationOptions;
/** Project option: the 6-credit project plus any other graduation-group course (Phụ lục 3). */
const PROJECT_POOL = courses.filter((c) => c.group === 'Graduation work').map((c) => c.code);

function gradCredits(states: Map<string, CourseState>, chosen: string | null, level: Level): number {
  const value = (codes: string[]) => (codes.every((c) => isCovered(states.get(c), level)) ? creditsFor(codes, states, level) : 0);
  const project = () => Math.min(10, creditsFor(PROJECT_POOL, states, level));
  if (chosen === 'project') return project();
  if (chosen && GRAD_OPTIONS[chosen]) return Math.min(10, value(GRAD_OPTIONS[chosen]));
  return Math.min(10, Math.max(value(GRAD_OPTIONS.thesis), value(GRAD_OPTIONS.internship), project()));
}

/** Credits per requirement block at one projection level, each capped at what the block can grant. */
function counts(ctx: RuleContext, level: Level) {
  const { states } = ctx;
  const spec = specialization(ctx.choice('specialization'));
  const political = creditsFor(blocks.generalPolitical.courses, states, level);
  const social = Math.min(blocks.generalSocial.credits, creditsFor(blocks.generalSocial.courses, states, level));
  const mathCore = creditsFor(blocks.generalMath.compulsory, states, level);
  const mathChoice = Math.min(4, creditsFor(blocks.generalMath.chooseOneOf, states, level));
  const science = Math.min(blocks.generalMath.chooseCreditsFrom.credits,
    creditsFor(blocks.generalMath.chooseCreditsFrom.courses, states, level));
  const informatics = creditsFor(blocks.generalInformatics.courses, states, level);
  const foundation = creditsFor(blocks.foundation.courses, states, level);

  const specCompAll = spec ? creditsFor(spec.compulsory.courses, states, level) : 0;
  const specCompCourses = spec ? countCovered(spec.compulsory.courses, states, level) : 0;
  const specComp = spec ? Math.min(spec.compulsory.minCredits, specCompAll) : 0;
  // Electives may also come from unused courses of the specialization's compulsory list (§7.2.2.x.2).
  const specElecAll = spec ? creditsFor(spec.elective.courses, states, level) + (specCompAll - specComp) : 0;
  const specElec = spec ? Math.min(spec.elective.minCredits, specElecAll) : 0;
  const specElecCourses = spec
    ? countCovered(spec.elective.courses, states, level) + Math.max(0, specCompCourses - spec.compulsory.minCourses)
    : 0;

  const grad = gradCredits(states, ctx.choice('gradTrack'), level);

  const counted = political + social + mathCore + mathChoice + science + informatics + foundation + specComp + specElec + grad;
  const allCredits = courses
    .filter((c) => (c.countsInCredits ?? true) && isCovered(states.get(c.code), level))
    .reduce((sum, c) => sum + c.credits, 0);
  const free = Math.min(10, Math.max(0, allCredits - counted));

  return { political, social, mathCore, mathChoice, science, informatics, foundation,
    specComp, specCompCourses, specElec, specElecCourses, grad, free, total: counted + free };
}

const missingOf = (codes: string[], states: Map<string, CourseState>) => ({
  earned: codes.filter((c) => !isCovered(states.get(c), 'earned')),
  planned: codes.filter((c) => !isCovered(states.get(c), 'planned')),
});

function progress(ctx: RuleContext): ProgressReport {
  const { states } = ctx;
  const spec = specialization(ctx.choice('specialization'));
  const at = (level: Level) => counts(ctx, level);
  const pick = (key: keyof ReturnType<typeof counts>) => (level: Level) => at(level)[key] as number;

  const specNote = spec
    ? `${spec.nameVi} · ${at('earned').specCompCourses}/${spec.compulsory.minCourses} courses`
    : 'choose a specialization first';

  const groups: GroupProgress[] = [
    group('political', 'Political theory & law', blocks.generalPolitical.credits, pick('political'),
      { missing: missingOf(blocks.generalPolitical.courses, states), warn: false }),
    group('social', 'Social & skills (choose 1)', blocks.generalSocial.credits, pick('social'), { checklist: true }),
    group('mathCore', 'Math & natural science', 24, pick('mathCore'),
      { missing: missingOf(blocks.generalMath.compulsory, states), warn: false }),
    group('mathChoice', 'Math elective (choose 1)', 4, pick('mathChoice'), { checklist: true }),
    group('science', 'Science electives', blocks.generalMath.chooseCreditsFrom.credits, pick('science'), { checklist: true }),
    group('informatics', 'Informatics', blocks.generalInformatics.credits, pick('informatics'),
      { missing: missingOf(blocks.generalInformatics.courses, states), warn: false }),
    group('foundation', 'Foundation (cơ sở ngành)', blocks.foundation.credits, pick('foundation'),
      { missing: missingOf(blocks.foundation.courses, states), warn: false }),
    group('specComp', 'Specialization — compulsory', spec?.compulsory.minCredits ?? 16, pick('specComp'),
      { checklist: true, note: specNote }),
    group('specElec', 'Specialization — electives', spec?.elective.minCredits ?? 8, pick('specElec'),
      { checklist: true, note: spec ? `${at('earned').specElecCourses}/${spec.elective.minCourses} courses` : specNote }),
    group('free', 'Free choice (tự chọn tự do)', 10, pick('free'), { checklist: true }),
    group('grad', 'Graduation work', 10, pick('grad'), { checklist: true, warn: false }),
  ];

  const total = group('total', 'Total', meta.totalCredits, pick('total'));
  // PE and Military Education are outside the 138 credits but must still be passed (QC1175 Art. 17.3c).
  const extrasPassed = (level: Level) =>
    [...meta.peCourses, meta.militaryCourse].every((code) => isCovered(states.get(code), level));
  const courseCountsOk = (level: Level) =>
    !!spec &&
    at(level).specCompCourses >= spec.compulsory.minCourses &&
    at(level).specElecCourses >= spec.elective.minCourses;
  const satisfiedAt = (level: Level) =>
    groups.every((g) => g[level] >= g.required) && total[level] >= total.required &&
    courseCountsOk(level) && extrasPassed(level);

  return { groups, total, satisfied: { earned: satisfiedAt('earned'), planned: satisfiedAt('planned') } };
}

function courseNeed(code: string, ctx: RuleContext): CourseNeed | null {
  const course = byCode.get(code);
  if (!course) return null;
  const spec = specialization(ctx.choice('specialization'));
  const c = counts(ctx, 'planned');
  const inList = (codes: string[]) => codes.includes(code);

  if (course.requirement === 'compulsory') return { tier: 0, label: 'required' };
  if (inList(blocks.generalSocial.courses)) return c.social < blocks.generalSocial.credits ? { tier: 1, label: 'social & skills (choose 1)' } : null;
  if (inList(blocks.generalMath.chooseOneOf)) return c.mathChoice < 4 ? { tier: 1, label: 'math elective (choose 1)' } : null;
  if (inList(blocks.generalMath.chooseCreditsFrom.courses)) {
    return c.science < blocks.generalMath.chooseCreditsFrom.credits ? { tier: 1, label: 'science electives needed' } : freeChoiceNeed(c);
  }
  if (course.requirement === 'graduation') {
    const chosen = ctx.choice('gradTrack');
    const allowed = chosen === 'project' ? PROJECT_POOL : chosen ? GRAD_OPTIONS[chosen] : PROJECT_POOL.concat(GRAD_OPTIONS.thesis, GRAD_OPTIONS.internship);
    if (!allowed?.includes(code)) return null;
    return c.grad < 10 ? { tier: 2, label: 'graduation work' } : null;
  }
  if (spec) {
    if (inList(spec.compulsory.courses)) {
      if (c.specComp < spec.compulsory.minCredits || c.specCompCourses < spec.compulsory.minCourses) {
        return { tier: 3, label: 'specialization — compulsory' };
      }
      return c.specElec < spec.elective.minCredits ? { tier: 4, label: 'specialization — elective' } : freeChoiceNeed(c);
    }
    if (inList(spec.elective.courses)) {
      return c.specElec < spec.elective.minCredits ? { tier: 4, label: 'specialization — elective' } : freeChoiceNeed(c);
    }
    // A course of another specialization only helps as free choice.
    return freeChoiceNeed(c);
  }
  if (course.group === 'Specialization courses' || course.group === 'Specialization electives') return null;
  return freeChoiceNeed(c);
}

const freeChoiceNeed = (c: ReturnType<typeof counts>): CourseNeed | null =>
  c.free < 10 ? { tier: 5, label: 'free choice' } : { tier: 6, label: 'extra (requirement already covered)' };

function coursesToPlan(ctx: RuleContext): Course[] {
  const { states } = ctx;
  const spec = specialization(ctx.choice('specialization'));
  const chosenTrack = ctx.choice('gradTrack');
  const covered = (code: string) => isCovered(states.get(code), 'planned');
  const picked: Course[] = [];
  const bySuggested = (a: Course, b: Course) =>
    (a.suggestedSemester ?? 99) - (b.suggestedSemester ?? 99) || a.code.localeCompare(b.code);

  const take = (codes: string[], need: () => number, cap: number) => {
    let have = 0;
    for (const course of list(codes).sort(bySuggested)) {
      if (have >= cap - need()) break;
      if (covered(course.code) || picked.includes(course)) continue;
      picked.push(course);
      have += course.credits;
    }
  };

  // Compulsory blocks first, in the order of the official teaching plan.
  const compulsory = courses.filter((c) => c.requirement === 'compulsory' && !covered(c.code)).sort(bySuggested);
  picked.push(...compulsory);

  const c = counts(ctx, 'planned');
  take(blocks.generalSocial.courses, () => c.social, blocks.generalSocial.credits);
  take(blocks.generalMath.chooseOneOf, () => c.mathChoice, 4);
  take(blocks.generalMath.chooseCreditsFrom.courses, () => c.science, blocks.generalMath.chooseCreditsFrom.credits);

  if (spec) {
    take(spec.compulsory.courses, () => c.specComp, spec.compulsory.minCredits);
    take(spec.elective.courses, () => c.specElec, spec.elective.minCredits);
  }

  if (chosenTrack) {
    const codes = chosenTrack === 'project' ? GRAD_OPTIONS.project : GRAD_OPTIONS[chosenTrack] ?? [];
    for (const course of list(codes)) if (!covered(course.code)) picked.push(course);
  }

  // Free choice: whatever is left of the specialization pools, cheapest use of the remaining 10 credits.
  if (c.free < 10 && spec) {
    take([...spec.elective.courses, ...spec.compulsory.courses], () => c.free, 10);
  }
  return picked;
}

function checklistItems(ctx: RuleContext): ChecklistItem[] {
  const spec = specialization(ctx.choice('specialization'));
  const items: ChecklistItem[] = [{
    id: 'specialization', label: 'Specialization chosen', source: 'CTĐT §7.2.2',
    status: spec ? 'done' : 'missing',
    detail: spec ? spec.nameVi : 'Choose one of the nine specializations (usually in year 3)',
  }];
  items.push({
    id: 'english', label: 'English standard', source: 'Program decision — not found online',
    status: 'unknown',
    detail: ctx.record.english
      ? `Recorded: ${ctx.record.english.type} ${ctx.record.english.score}. The required level for this program is not published — confirm with giáo vụ.`
      : 'The required level for this program is not published — confirm with giáo vụ (the APCS standard is IELTS 6.0 / TOEFL iBT 79).',
  });
  return items;
}

function warnings(ctx: RuleContext): Warning[] {
  const out: Warning[] = [];
  const spec = specialization(ctx.choice('specialization'));
  if (!spec) {
    out.push({ id: 'specialization-unset', severity: 'info', link: 'planner',
      message: 'Choose a specialization to see its requirements (students normally choose in year 3)' });
  }
  const chosen = ctx.choice('gradTrack');
  if (!chosen) {
    out.push({ id: 'grad-track-unset', severity: 'info', link: 'planner',
      message: 'Graduation work: choose khóa luận, thực tập tốt nghiệp or thực tập dự án' });
  }
  const c = counts(ctx, 'planned');
  if (chosen === 'project' && c.grad < 10) {
    out.push({ id: 'grad-project-short', severity: 'warning', link: 'planner',
      message: `Graduation project: ${c.grad} / 10 credits — CSC10204 needs a 4-credit graduation course from your specialization (Phụ lục 3)` });
  }
  if (spec) {
    if (c.specCompCourses < spec.compulsory.minCourses) {
      out.push({ id: 'spec-compulsory-courses', severity: 'warning', link: 'planner',
        message: `Specialization: ${c.specCompCourses} / ${spec.compulsory.minCourses} compulsory courses planned` });
    }
    if (c.specElecCourses < spec.elective.minCourses) {
      out.push({ id: 'spec-elective-courses', severity: 'warning', link: 'planner',
        message: `Specialization: ${c.specElecCourses} / ${spec.elective.minCourses} elective courses planned` });
    }
  }
  return out;
}

export const clc2026: ProgramModule = { meta, courses, choices, progress, courseNeed, coursesToPlan, checklistItems, warnings };
export default clc2026;

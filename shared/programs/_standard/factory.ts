// Most HCMUS programmes share one shape: general-education blocks, a foundation block, one chosen
// specialization (compulsory + elective + free choice) and graduation work. This factory turns that
// shape plus a programme's data into a ProgramModule, so a new programme is data + a few lines.
import type { ChecklistItem } from '../../domain/checklist';
import {
  group, isCovered,
  type CourseNeed, type GroupProgress, type Level, type ProgramChoice, type ProgramMeta,
  type ProgramModule, type ProgressReport, type RuleContext,
} from '../../domain/program';
import type { Course, CourseState, Warning } from '../../domain/types';

/** How a block's courses are chosen (CTĐT §7 tables). */
export type BlockRule =
  | { type: 'all'; courses: string[] }
  /** "Chọn 01 học phần (04 tín chỉ) trong các học phần sau". */
  | { type: 'chooseCourses'; count: number; credits: number; courses: string[] }
  /** "Chọn 08 tín chỉ từ các học phần sau". */
  | { type: 'chooseCredits'; credits: number; courses: string[] };

export interface StandardBlock {
  id: string;
  label: string;
  /** Printed TỔNG CỘNG for the block. */
  credits: number;
  rules: BlockRule[];
  /** Counts toward the programme total. Default true (language, PE and military are false). */
  countsInTotal?: boolean;
  /** Must every course be passed individually? True for "all" blocks by default. */
  note?: string;
}

export interface SpecializationPool {
  minCourses: number;
  minCredits: number;
  courses: string[];
}

export interface StandardSpecialization {
  id: string;
  nameVi: string;
  compulsory: SpecializationPool;
  elective: SpecializationPool;
  freeChoiceCredits: number;
}

export interface GraduationOption {
  id: string;
  label: string;
  note?: string;
  /** Courses that must all be covered for this option. */
  courses: string[];
  /** Extra courses that may fill the remaining credits (e.g. a project plus one elective). */
  pool?: string[];
}

export interface StandardProgramConfig {
  meta: ProgramMeta;
  courses: Course[];
  blocks: StandardBlock[];
  specializations: StandardSpecialization[];
  graduation: { credits: number; options: GraduationOption[] };
}

const sum = (courses: Course[]) => courses.reduce((total, c) => total + c.credits, 0);

export function standardProgram(config: StandardProgramConfig): ProgramModule {
  const { meta, courses, blocks, specializations } = config;
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const list = (codes: string[]) => codes.map((code) => byCode.get(code)!).filter(Boolean);
  const covered = (codes: string[], states: Map<string, CourseState>, level: Level) =>
    list(codes).filter((c) => isCovered(states.get(c.code), level));

  const specialization = (id: string | null) => specializations.find((s) => s.id === id) ?? null;
  const onlySpecialization = specializations.length === 1 ? specializations[0] : null;
  const chosenSpecialization = (ctx: RuleContext) =>
    onlySpecialization ?? specialization(ctx.choice('specialization'));

  const choices: ProgramChoice[] = [];
  if (specializations.length > 1) {
    choices.push({
      id: 'specialization',
      label: 'Specialization (chuyên ngành)',
      required: true,
      options: specializations.map((s) => ({ id: s.id, label: s.nameVi })),
    });
  }
  choices.push({
    id: 'gradTrack',
    label: 'Graduation work',
    required: true,
    options: config.graduation.options.map((o) => ({ id: o.id, label: o.label, note: o.note })),
  });

  /** Credits a block grants at one level: each rule capped at what it can award. */
  const blockCredits = (block: StandardBlock, states: Map<string, CourseState>, level: Level) => {
    const total = block.rules.reduce((value, rule) => {
      const earned = sum(covered(rule.courses, states, level));
      return value + (rule.type === 'all' ? earned : Math.min(rule.credits, earned));
    }, 0);
    return Math.min(block.credits, total);
  };

  /** Courses of "all" rules that are not covered — the ones a student must pass individually. */
  const blockMissing = (block: StandardBlock, states: Map<string, CourseState>, level: Level) =>
    block.rules
      .filter((r): r is Extract<BlockRule, { type: 'all' }> => r.type === 'all')
      .flatMap((r) => r.courses)
      .filter((code) => !isCovered(states.get(code), level));

  const gradOption = (ctx: RuleContext) =>
    config.graduation.options.find((o) => o.id === ctx.choice('gradTrack')) ?? null;

  const gradCredits = (ctx: RuleContext, level: Level) => {
    const { states } = ctx;
    const value = (option: GraduationOption) => {
      if (!option.courses.every((code) => isCovered(states.get(code), level))) return 0;
      const base = sum(covered(option.courses, states, level));
      const extra = option.pool ? sum(covered(option.pool, states, level)) : 0;
      return Math.min(config.graduation.credits, base + extra);
    };
    const chosen = gradOption(ctx);
    return chosen ? value(chosen) : Math.max(0, ...config.graduation.options.map(value));
  };

  interface Counts {
    blocks: Map<string, number>;
    specCompulsory: number;
    specCompulsoryCourses: number;
    specElective: number;
    specElectiveCourses: number;
    graduation: number;
    free: number;
    total: number;
  }

  const counts = (ctx: RuleContext, level: Level): Counts => {
    const { states } = ctx;
    const spec = chosenSpecialization(ctx);
    const blockValues = new Map(blocks.map((b) => [b.id, blockCredits(b, states, level)]));

    const compulsoryAll = spec ? sum(covered(spec.compulsory.courses, states, level)) : 0;
    const specCompulsory = spec ? Math.min(spec.compulsory.minCredits, compulsoryAll) : 0;
    const specCompulsoryCourses = spec ? covered(spec.compulsory.courses, states, level).length : 0;
    // Electives may also come from unused courses of the compulsory pool (CTĐT §7.2.2.x.2).
    const electiveAll = spec
      ? sum(covered(spec.elective.courses, states, level)) + (compulsoryAll - specCompulsory)
      : 0;
    const specElective = spec ? Math.min(spec.elective.minCredits, electiveAll) : 0;
    const specElectiveCourses = spec
      ? covered(spec.elective.courses, states, level).length +
        Math.max(0, specCompulsoryCourses - spec.compulsory.minCourses)
      : 0;

    const graduation = gradCredits(ctx, level);
    const countedBlocks = blocks
      .filter((b) => b.countsInTotal !== false)
      .reduce((value, b) => value + (blockValues.get(b.id) ?? 0), 0);
    const counted = countedBlocks + specCompulsory + specElective + graduation;

    const allCredits = courses
      .filter((c) => (c.countsInCredits ?? true) && isCovered(states.get(c.code), level))
      .reduce((value, c) => value + c.credits, 0);
    const free = spec ? Math.min(spec.freeChoiceCredits, Math.max(0, allCredits - counted)) : 0;

    return {
      blocks: blockValues, specCompulsory, specCompulsoryCourses, specElective, specElectiveCourses,
      graduation, free, total: counted + free,
    };
  };

  function progress(ctx: RuleContext): ProgressReport {
    const { states } = ctx;
    const spec = chosenSpecialization(ctx);
    const at = (level: Level) => counts(ctx, level);
    const specNote = spec ? spec.nameVi : 'choose a specialization first';

    const groups: GroupProgress[] = blocks.map((block) => {
      const hasAll = block.rules.some((r) => r.type === 'all');
      return group(block.id, block.label, block.credits, (level) => at(level).blocks.get(block.id) ?? 0, {
        note: block.note,
        checklist: !hasAll,
        warn: !hasAll,
        ...(hasAll
          ? { missing: { earned: blockMissing(block, states, 'earned'), planned: blockMissing(block, states, 'planned') } }
          : {}),
      });
    });

    groups.push(
      group('specComp', 'Specialization — compulsory', spec?.compulsory.minCredits ?? 16,
        (level) => at(level).specCompulsory,
        { checklist: true, note: spec ? `${specNote} · ${at('earned').specCompulsoryCourses}/${spec.compulsory.minCourses} courses` : specNote }),
      group('specElec', 'Specialization — electives', spec?.elective.minCredits ?? 8,
        (level) => at(level).specElective,
        { checklist: true, note: spec ? `${at('earned').specElectiveCourses}/${spec.elective.minCourses} courses` : specNote }),
      group('free', 'Free choice (tự chọn tự do)', spec?.freeChoiceCredits ?? 10, (level) => at(level).free, { checklist: true }),
      group('grad', 'Graduation work', config.graduation.credits, (level) => at(level).graduation, { checklist: true, warn: false }),
    );

    const total = group('total', 'Total', meta.totalCredits, (level) => at(level).total);
    const extras = blocks.filter((b) => b.countsInTotal === false).flatMap((b) => b.rules.flatMap((r) => (r.type === 'all' ? r.courses : [])));
    const satisfiedAt = (level: Level) =>
      !!spec &&
      groups.every((g) => g[level] >= g.required) &&
      total[level] >= total.required &&
      at(level).specCompulsoryCourses >= spec.compulsory.minCourses &&
      at(level).specElectiveCourses >= spec.elective.minCourses &&
      extras.every((code) => isCovered(states.get(code), level));

    return { groups, total, satisfied: { earned: satisfiedAt('earned'), planned: satisfiedAt('planned') } };
  }

  const blockOf = (code: string) => blocks.find((b) => b.rules.some((r) => r.courses.includes(code))) ?? null;

  function courseNeed(code: string, ctx: RuleContext): CourseNeed | null {
    const course = byCode.get(code);
    if (!course) return null;
    const spec = chosenSpecialization(ctx);
    const c = counts(ctx, 'planned');
    const freeNeed = (): CourseNeed | null =>
      spec && c.free < spec.freeChoiceCredits
        ? { tier: 5, label: 'free choice' }
        : { tier: 6, label: 'extra (requirement already covered)' };

    const block = blockOf(code);
    if (block) {
      const isCompulsory = block.rules.some((r) => r.type === 'all' && r.courses.includes(code));
      if (isCompulsory) return { tier: 0, label: 'required' };
      const value = c.blocks.get(block.id) ?? 0;
      return value < block.credits ? { tier: 1, label: `${block.label.toLowerCase()} — choose` } : freeNeed();
    }

    if (course.requirement === 'graduation') {
      const option = gradOption(ctx);
      const allowed = option
        ? [...option.courses, ...(option.pool ?? [])]
        : config.graduation.options.flatMap((o) => [...o.courses, ...(o.pool ?? [])]);
      if (!allowed.includes(code)) return null;
      return c.graduation < config.graduation.credits ? { tier: 2, label: 'graduation work' } : null;
    }

    if (!spec) return null;   // specialization courses only matter once a specialization is chosen
    if (spec.compulsory.courses.includes(code)) {
      if (c.specCompulsory < spec.compulsory.minCredits || c.specCompulsoryCourses < spec.compulsory.minCourses) {
        return { tier: 3, label: 'specialization — compulsory' };
      }
      return c.specElective < spec.elective.minCredits ? { tier: 4, label: 'specialization — elective' } : freeNeed();
    }
    if (spec.elective.courses.includes(code)) {
      return c.specElective < spec.elective.minCredits ? { tier: 4, label: 'specialization — elective' } : freeNeed();
    }
    return freeNeed();
  }

  function coursesToPlan(ctx: RuleContext): Course[] {
    const { states } = ctx;
    const spec = chosenSpecialization(ctx);
    const isCovered_ = (code: string) => isCovered(states.get(code), 'planned');
    const bySuggested = (a: Course, b: Course) =>
      (a.suggestedSemester ?? 99) - (b.suggestedSemester ?? 99) || a.code.localeCompare(b.code);
    const picked: Course[] = [];
    const add = (course: Course) => {
      if (!isCovered_(course.code) && !picked.includes(course)) picked.push(course);
    };

    for (const block of blocks) {
      for (const rule of block.rules) {
        if (rule.type === 'all') {
          list(rule.courses).sort(bySuggested).forEach(add);
          continue;
        }
        let have = sum(covered(rule.courses, states, 'planned'));
        for (const course of list(rule.courses).sort(bySuggested)) {
          if (have >= rule.credits) break;
          if (isCovered_(course.code)) continue;
          add(course);
          have += course.credits;
        }
      }
    }

    if (spec) {
      const fill = (pool: SpecializationPool, already: number) => {
        let have = already;
        let taken = 0;
        for (const course of list(pool.courses).sort(bySuggested)) {
          if (have >= pool.minCredits && taken >= pool.minCourses) break;
          if (isCovered_(course.code) || picked.includes(course)) continue;
          add(course);
          have += course.credits;
          taken += 1;
        }
      };
      const planned = counts(ctx, 'planned');
      fill(spec.compulsory, planned.specCompulsory);
      fill(spec.elective, planned.specElective);

      // Free choice: whatever is left of the specialization pools.
      let free = counts(ctx, 'planned').free;
      for (const course of list([...spec.elective.courses, ...spec.compulsory.courses]).sort(bySuggested)) {
        if (free >= spec.freeChoiceCredits) break;
        if (isCovered_(course.code) || picked.includes(course)) continue;
        add(course);
        free += course.credits;
      }
    }

    const option = gradOption(ctx);
    if (option) list(option.courses).forEach(add);

    return picked;
  }

  function checklistItems(ctx: RuleContext): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    if (specializations.length > 1) {
      const spec = chosenSpecialization(ctx);
      items.push({
        id: 'specialization', label: 'Specialization chosen', source: 'CTĐT §7.2.2',
        status: spec ? 'done' : 'missing',
        detail: spec ? spec.nameVi : `Choose one of the ${specializations.length} specializations (usually in year 3)`,
      });
    }
    items.push({
      id: 'english', label: 'English standard', source: 'Program decision — not published online',
      status: 'unknown',
      detail: ctx.record.english
        ? `Recorded: ${ctx.record.english.type} ${ctx.record.english.score}. The level this programme requires is not published — confirm with giáo vụ.`
        : 'The level this programme requires is not published — confirm with giáo vụ.',
    });
    return items;
  }

  function warnings(ctx: RuleContext): Warning[] {
    const out: Warning[] = [];
    const spec = chosenSpecialization(ctx);
    if (!spec) {
      out.push({ id: 'specialization-unset', severity: 'info', link: 'planner',
        message: 'Choose a specialization to see its requirements (students normally choose in year 3)' });
    }
    if (!gradOption(ctx)) {
      out.push({ id: 'grad-track-unset', severity: 'info', link: 'planner',
        message: `Graduation work: choose ${config.graduation.options.map((o) => o.label).join(', ')}` });
    }
    const c = counts(ctx, 'planned');
    const option = gradOption(ctx);
    if (option && c.graduation > 0 && c.graduation < config.graduation.credits) {
      out.push({ id: 'grad-short', severity: 'warning', link: 'planner',
        message: `Graduation work: ${c.graduation} / ${config.graduation.credits} credits — ${option.label} needs another course from its list` });
    }
    if (spec) {
      if (c.specCompulsoryCourses < spec.compulsory.minCourses) {
        out.push({ id: 'spec-compulsory-courses', severity: 'warning', link: 'planner',
          message: `Specialization: ${c.specCompulsoryCourses} / ${spec.compulsory.minCourses} compulsory courses planned` });
      }
      if (c.specElectiveCourses < spec.elective.minCourses) {
        out.push({ id: 'spec-elective-courses', severity: 'warning', link: 'planner',
          message: `Specialization: ${c.specElectiveCourses} / ${spec.elective.minCourses} elective courses planned` });
      }
    }
    return out;
  }

  return { meta, courses, choices, progress, courseNeed, coursesToPlan, checklistItems, warnings };
}

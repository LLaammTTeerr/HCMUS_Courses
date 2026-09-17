import { courseIndex } from '../programs/index';
import { deriveCourseStates } from './courseState';
import { computeProgress, isCovered, REQUIRED_BUCKETS } from './credits';
import { courseSemester, semesterCredits } from './planner';
import type { Course, NewAttempt, Program, StudentRecord } from './types';

/**
 * Builds planned attempts that complete the program, following the official suggested semesters:
 * - every uncovered required course (A_REQ, NONCS, MATH, PHYS, EXTRA),
 * - electives only while their requirement is short (A ≥ aMin, B ≥ bMin, B + C ≥ bcMin),
 * - graduation work for the chosen track in its suggested semester, plus its prior courses
 *   (no graduation work when the track is undecided).
 * Courses go no earlier than the next semester and after their prior courses. Credits are spread
 * evenly over the remaining standard semesters (see `balance`); when the courses cannot fill every
 * semester to the minimum, up to three extra electives are added.
 */
export function suggestedPlanAttempts(program: Program, record: StudentRecord): NewAttempt[] {
  const r = program.rules;
  const { currentSemester } = record.profile;
  const first = currentSemester + 1;
  const last = Math.max(r.standardSemesters, first);

  const selection = selectCourses(program, record);
  const gradCourses = selection.filter((c) => c.bucket === 'GRAD');
  const others = selection.filter((c) => c.bucket !== 'GRAD');

  const states = deriveCourseStates(program, record.attempts);
  const load = semesterCredits(program, record.attempts);
  const placedAt = new Map<string, number>();
  const result: NewAttempt[] = [];
  const addLoad = (semester: number, credits: number) => load.set(semester, (load.get(semester) ?? 0) + credits);

  // Even target over the remaining standard semesters (existing future attempts count too).
  let totalCredits = selection.reduce((sum, c) => sum + c.credits, 0);
  for (let s = first; s <= last; s++) totalCredits += load.get(s) ?? 0;
  const target = Math.min(r.semesterMax, Math.max(r.semesterMin, Math.ceil(totalCredits / (last - first + 1))));

  // Reserve graduation work first so it keeps its suggested semesters.
  const gradSemesters = new Map<string, number>();
  let previous = first - 1;
  for (const course of gradCourses) {
    const semester = Math.max(course.suggestedSemester ?? last, previous + 1);
    gradSemesters.set(course.code, semester);
    addLoad(semester, course.credits);
    previous = semester;
  }

  for (const course of others) {
    let earliest = first;
    for (const p of course.prereqs) {
      const s = placedAt.get(p) ?? courseSemester(states.get(p));
      if (s !== null) earliest = Math.max(earliest, s + 1);
    }
    const preferred = Math.max(earliest, course.suggestedSemester ?? earliest);
    const fits = (cap: number) => (s: number) => (load.get(s) ?? 0) + course.credits <= cap;
    const semester = findSemester(preferred, last, fits(target))
      ?? findSemester(earliest, last, fits(target))
      ?? findSemester(earliest, Number.MAX_SAFE_INTEGER, fits(r.semesterMax))!;
    addLoad(semester, course.credits);
    placedAt.set(course.code, semester);
    result.push({ code: course.code, semester, status: 'planned', grade10: null });
  }

  const inPlan = new Map(result.map((a) => [a.code, a]));
  balance(program, {
    plan: result,
    load,
    first,
    last,
    semesterOf: (code) => inPlan.get(code)?.semester ?? gradSemesters.get(code) ?? courseSemester(states.get(code)),
    fillers: program.courses.filter((c) =>
      ['A_ELEC', 'B', 'C'].includes(c.bucket) && !inPlan.has(c.code) && !isCovered(states.get(c.code), 'planned')),
    onAdd: (a) => inPlan.set(a.code, a),
  });

  for (const course of gradCourses) {
    result.push({ code: course.code, semester: gradSemesters.get(course.code)!, status: 'planned', grade10: null });
  }
  return result;
}

interface BalanceInput {
  plan: NewAttempt[];
  load: Map<number, number>;
  first: number;
  last: number;
  semesterOf: (code: string) => number | null;
  /** Electives that may be added when moving courses alone cannot reach the minimum. */
  fillers: Course[];
  onAdd: (attempt: NewAttempt) => void;
}

/**
 * Local search over the planned (non-graduation) courses so that no semester in [first, last] is below
 * the credit minimum or above the maximum. Tries single moves and pairwise swaps that keep prior courses
 * earlier and dependent courses later, taking the best strict improvement of (total shortfall,
 * spread around the average). If a shortfall remains, adds one extra elective to the lightest
 * semester and searches again.
 */
function balance(program: Program, input: BalanceInput): void {
  const r = program.rules;
  const index = courseIndex(program);
  const { plan, load, first, last, semesterOf } = input;
  const loadOf = (s: number) => load.get(s) ?? 0;
  const creditsOf = (a: NewAttempt) => index.get(a.code)!.credits;
  const semesters = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const score = (): [number, number] => {
    const used = semesters.filter((s) => loadOf(s) > 0);
    const mean = used.reduce((sum, s) => sum + loadOf(s), 0) / Math.max(1, used.length);
    let shortfall = 0, spread = 0;
    for (const s of used) {
      const l = loadOf(s);
      if (l < r.semesterMin) shortfall += r.semesterMin - l;
      if (l > r.semesterMax) shortfall += l - r.semesterMax;
      spread += (l - mean) ** 2;
    }
    return [shortfall, spread];
  };
  const better = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-9);

  const orderOk = (a: NewAttempt) => {
    const course = index.get(a.code)!;
    if (course.prereqs.some((p) => { const s = semesterOf(p); return s !== null && s >= a.semester; })) return false;
    return program.courses.every((d) => {
      if (!d.prereqs.includes(a.code)) return true;
      const s = semesterOf(d.code);
      return s === null || s > a.semester;
    });
  };
  const setSemester = (a: NewAttempt, to: number) => {
    load.set(a.semester, loadOf(a.semester) - creditsOf(a));
    load.set(to, loadOf(to) + creditsOf(a));
    a.semester = to;
  };
  const withinMax = (...ss: number[]) => ss.every((s) => loadOf(s) <= r.semesterMax);

  const improve = () => {
    for (let round = 0; round < 200; round++) {
      let best = score();
      let bestOp: (() => void) | null = null;
      for (const a of plan) {
        const from = a.semester;
        for (const to of semesters) {
          if (to === from) continue;
          setSemester(a, to);
          const sc = score();
          if (withinMax(to) && orderOk(a) && better(sc, best)) {
            best = sc;
            bestOp = () => setSemester(a, to);
          }
          setSemester(a, from);
        }
        for (const b of plan) {
          if (b === a || b.semester === from || b.code <= a.code) continue;
          const other = b.semester;
          setSemester(a, other);
          setSemester(b, from);
          const sc = score();
          if (withinMax(from, other) && orderOk(a) && orderOk(b) && better(sc, best)) {
            best = sc;
            bestOp = () => { setSemester(a, other); setSemester(b, from); };
          }
          setSemester(b, other);
          setSemester(a, from);
        }
      }
      if (!bestOp) return;
      bestOp();
    }
  };

  improve();
  const fillers = [...input.fillers];
  for (let added = 0; added < 3 && score()[0] > 0; added++) {
    const light = semesters.filter((s) => loadOf(s) > 0 && loadOf(s) < r.semesterMin).sort((x, y) => loadOf(x) - loadOf(y))[0];
    if (light === undefined) return;
    const pick = fillers
      .filter((c) => loadOf(light) + c.credits <= r.semesterMax &&
        c.prereqs.every((p) => { const s = semesterOf(p); return s !== null && s < light; }))
      .sort((x, y) => Math.abs((x.suggestedSemester ?? 99) - light) - Math.abs((y.suggestedSemester ?? 99) - light) || x.code.localeCompare(y.code))[0];
    if (!pick) return;
    fillers.splice(fillers.indexOf(pick), 1);
    const attempt: NewAttempt = { code: pick.code, semester: light, status: 'planned', grade10: null };
    plan.push(attempt);
    load.set(light, loadOf(light) + pick.credits);
    input.onAdd(attempt);
    improve();
  }
}

function findSemester(from: number, to: number, ok: (s: number) => boolean): number | null {
  for (let s = from; s <= to; s++) if (ok(s)) return s;
  return null;
}

/** Chooses which uncovered courses the plan needs, in prerequisite-respecting suggested order. */
function selectCourses(program: Program, record: StudentRecord): Course[] {
  const r = program.rules;
  const index = courseIndex(program);
  const { gradTrack } = record.profile;
  const states = deriveCourseStates(program, record.attempts);
  const progress = computeProgress(program, states, gradTrack);
  const covered = (code: string) => isCovered(states.get(code), 'planned');

  const trackCourses = gradTrack === 'thesis' ? r.thesis : gradTrack === 'capstone' ? [...r.capstone] : [];
  const forced = new Set<string>();
  const force = (code: string) => {
    if (forced.has(code)) return;
    forced.add(code);
    index.get(code)!.prereqs.forEach(force);
  };
  trackCourses.forEach(force);

  const bucketOrder = (c: Course) => (REQUIRED_BUCKETS.includes(c.bucket) ? 0 : c.bucket === 'GRAD' ? 2 : 1);
  const pending = program.courses
    .filter((c) => !covered(c.code) && (c.bucket !== 'GRAD' || trackCourses.includes(c.code)))
    .sort((x, y) =>
      (x.suggestedSemester ?? 99) - (y.suggestedSemester ?? 99) || bucketOrder(x) - bucketOrder(y) || x.code.localeCompare(y.code));

  let a = progress.a.planned, b = progress.b.planned, c = progress.c.planned - progress.overflowA.planned;
  const bc = () => b + c + Math.max(0, a - r.aMin);
  const needed = (course: Course) => {
    if (REQUIRED_BUCKETS.includes(course.bucket) || course.bucket === 'GRAD' || forced.has(course.code)) return true;
    if (course.bucket === 'A_ELEC') return a < r.aMin;
    if (course.bucket === 'B') return b < r.bMin;
    if (course.bucket === 'C') return bc() < r.bcMin;
    return false;
  };

  // Walk candidates in suggested order, taking a course only after its selected prior courses.
  const selected = new Set(pending.filter(needed).map((x) => x.code));
  const chosen: Course[] = [];
  while (pending.length > 0) {
    const i = pending.findIndex((course) => course.prereqs.every((p) => !selected.has(p) || !pending.some((q) => q.code === p)));
    const course = pending.splice(i === -1 ? 0 : i, 1)[0];
    if (!needed(course)) {
      selected.delete(course.code);
      continue;
    }
    chosen.push(course);
    if (course.bucket === 'A_REQ' || course.bucket === 'A_ELEC') a += course.credits;
    if (course.bucket === 'B') b += course.credits;
    if (course.bucket === 'C') c += course.credits;
  }
  return chosen;
}

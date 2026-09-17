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
 * evenly over the remaining standard semesters; the semester maximum is only used when needed.
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

  for (const course of gradCourses) {
    result.push({ code: course.code, semester: gradSemesters.get(course.code)!, status: 'planned', grade10: null });
  }
  return result;
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

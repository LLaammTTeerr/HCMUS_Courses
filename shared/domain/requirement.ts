import type { Course, RequirementKind } from './types';

/**
 * How a course is required (CTĐT column "Loại HP": BB = bắt buộc, TC = tự chọn):
 * - compulsory: must be passed
 * - choose: chosen inside a group with a minimum ("tự chọn bắt buộc")
 * - elective: free elective counted toward a credit total
 * - graduation: graduation work (thesis / capstone / graduation courses)
 */
export type { RequirementKind } from './types';

export function requirementKind(course: Course): RequirementKind {
  return course.requirement;
}

export const REQUIREMENT_LABELS: Record<RequirementKind, { short: string; long: string }> = {
  compulsory: { short: 'Compulsory', long: 'Compulsory (bắt buộc) — must be passed' },
  choose: { short: 'Choose', long: 'Chosen within a group (tự chọn bắt buộc) — choose enough credits' },
  elective: { short: 'Elective', long: 'Elective (tự chọn) — counts toward an elective total' },
  graduation: { short: 'Grad work', long: 'Graduation work — thesis, capstone or graduation courses' },
};

import type { Course } from './types';

/**
 * How a course is required (CTĐT §7, column "Loại HP": BB = bắt buộc, TC = tự chọn):
 * - compulsory: must be passed (A required, Non-CS, Math, Physics, PE and Military Education)
 * - group-elective: choose within a group with a minimum (A: 16 cr from 6 courses, B: ≥ 8 cr)
 * - elective: CS electives (C), count toward B + C ≥ 43
 * - graduation: thesis or capstone track, choose one
 */
export type RequirementKind = 'compulsory' | 'group-elective' | 'elective' | 'graduation';

export function requirementKind(course: Course): RequirementKind {
  switch (course.bucket) {
    case 'A_ELEC':
    case 'B':
      return 'group-elective';
    case 'C':
      return 'elective';
    case 'GRAD':
      return 'graduation';
    default:
      return 'compulsory';
  }
}

export const REQUIREMENT_LABELS: Record<RequirementKind, { short: string; long: string }> = {
  compulsory: { short: 'Compulsory', long: 'Compulsory (bắt buộc) — must be passed' },
  'group-elective': { short: 'Choose', long: 'Elective within a group (tự chọn bắt buộc) — choose enough credits' },
  elective: { short: 'Elective', long: 'CS elective (tự chọn) — counts toward B + C' },
  graduation: { short: 'Grad track', long: 'Graduation work — thesis or capstone, choose one' },
};

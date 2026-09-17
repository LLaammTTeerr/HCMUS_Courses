import type { BucketId, CourseStatus } from '../../shared/domain/types';

export const BUCKET_LABELS: Record<BucketId, string> = {
  A_REQ: 'CS (A) — required',
  A_ELEC: 'CS (A) — choose 16 cr',
  NONCS: 'Non Computer Science',
  MATH: 'Math',
  PHYS: 'Physics',
  B: 'Math electives (B)',
  C: 'CS electives (C)',
  GRAD: 'Graduation work',
  EXTRA: 'PE & Military (not counted)',
};

export const BUCKET_ORDER: BucketId[] = ['A_REQ', 'A_ELEC', 'NONCS', 'MATH', 'PHYS', 'B', 'C', 'GRAD', 'EXTRA'];

export const STATUS_LABELS: Record<CourseStatus, string> = {
  passed: 'Passed',
  'in-progress': 'In progress',
  planned: 'Planned',
  failed: 'Failed',
  'not-taken': 'Not taken',
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}

export const fmt = (n: number | null, digits = 2) => (n === null ? '—' : n.toFixed(digits));

export const shortSemester = (n: number) => `S${n}`;

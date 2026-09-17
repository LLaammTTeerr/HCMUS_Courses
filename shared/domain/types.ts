// Core domain types. Pure data shapes — no runtime dependencies.

/** Credit bucket a course belongs to (CTĐT §6–7). */
export type BucketId = 'A_REQ' | 'A_ELEC' | 'NONCS' | 'MATH' | 'PHYS' | 'B' | 'C' | 'GRAD' | 'EXTRA';

export interface Course {
  code: string;
  nameEn: string;
  nameVi: string;
  credits: number;
  bucket: BucketId;
  /** Prior courses ("học phần học trước") — soft requirement. */
  prereqs: string[];
  /** Original wording when prereqs were mapped by hand from prose or old course codes. */
  prereqNote?: string;
  /** Semester in the official suggested plan (CTĐT §8). */
  suggestedSemester?: number;
  /** Counts toward ĐTB / graduation classification. Defaults to true except EXTRA (QC1175 Art. 15.1c). */
  countsInGpa?: boolean;
}

export interface ProgramRules {
  totalCredits: number;
  /** Minimum credits in A_REQ + A_ELEC; surplus counts toward C. */
  aMin: number;
  aReqCredits: number;
  bMin: number;
  /** Minimum B + C (+ A overflow). */
  bcMin: number;
  gradCredits: number;
  semesterMin: number;
  semesterMax: number;
  standardSemesters: number;
  maxSemesters: number;
  semestersPerYear: number;
  intakeYear: number;
  /** Graduation-work courses are recommended only from this semester on. */
  gradEarliestSemester: number;
  thesis: string[];
  capstone: [string, string];
  peCourses: string[];
  militaryCourse: string;
  /** Validity of an English certificate without an expiry date, in years. */
  englishDefaultValidityYears: number;
}

export interface SourceRef {
  id: string;
  title: string;
  file?: string;
  url?: string;
}

export interface Program {
  id: string;
  name: string;
  sources: SourceRef[];
  rules: ProgramRules;
  courses: Course[];
}

export type AttemptStatus = 'completed' | 'in-progress' | 'planned';

export interface Attempt {
  id: number;
  code: string;
  semester: number;
  status: AttemptStatus;
  /** 10-point grade; required when status is 'completed'. */
  grade10: number | null;
}

export type NewAttempt = Omit<Attempt, 'id'>;

export type GradTrack = 'thesis' | 'capstone' | 'undecided';

export interface Profile {
  programId: string;
  currentSemester: number;
  gradTrack: GradTrack;
  militaryCert: boolean;
  thesisGpaThreshold: number | null;
}

export type EnglishType = 'IELTS' | 'TOEFL_IBT' | 'TOEFL_ITP_TOEIC_SW';

export interface EnglishCert {
  type: EnglishType;
  /** IELTS band, TOEFL iBT score, or TOEFL ITP score. */
  score: number;
  /** TOEIC Speaking + Writing score (only for TOEFL_ITP_TOEIC_SW). */
  score2: number | null;
  /** ISO date (YYYY-MM-DD). */
  issued: string;
  expires: string | null;
}

/** Per-course choice whether a course counts toward the GPA, overriding the program default. */
export type GpaOverrides = Record<string, boolean>;

export interface StudentRecord {
  profile: Profile;
  attempts: Attempt[];
  english: EnglishCert | null;
  gpaOverrides: GpaOverrides;
}

export type CourseStatus = 'passed' | 'in-progress' | 'planned' | 'failed' | 'not-taken';

export interface CourseState {
  code: string;
  status: CourseStatus;
  /** Grade of the latest completed attempt. */
  officialGrade: number | null;
  /** Semester of the latest completed attempt when it passed. */
  passedSemester: number | null;
  /** Semester of the in-progress attempt, else the earliest planned attempt. */
  activeSemester: number | null;
  attempts: Attempt[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Warning {
  id: string;
  severity: Severity;
  message: string;
  semester?: number;
  code?: string;
  link: 'planner' | 'courses' | 'checklist';
}

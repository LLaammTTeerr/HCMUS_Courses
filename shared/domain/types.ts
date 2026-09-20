// Core domain types. Pure data shapes — no runtime dependencies.

/** How a course is required (CTĐT column "Loại HP"). */
export type RequirementKind = 'compulsory' | 'choose' | 'elective' | 'graduation';

export interface Course {
  code: string;
  nameEn: string;
  nameVi: string;
  credits: number;
  /** Display group inside the program, e.g. "Foundation" or "CS (A) — required". */
  group: string;
  requirement: RequirementKind;
  /** Prior courses ("học phần học trước") — soft requirement. */
  prereqs: string[];
  /** Original wording when prereqs were mapped by hand from prose or old course codes. */
  prereqNote?: string;
  /** Semester in the official suggested plan. */
  suggestedSemester?: number;
  /** Counts toward accumulated credits. Default true (APCS excludes PE/Military; CLC does not). */
  countsInCredits?: boolean;
  /** Counts toward ĐTB / graduation classification (QC1175 Art. 15.1c). Default true. */
  countsInGpa?: boolean;
}

export interface SourceRef {
  id: string;
  title: string;
  file?: string;
  url?: string;
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

export interface Profile {
  programId: string;
  currentSemester: number;
  /** Selected options of the program's choices, e.g. { choices: { gradTrack: 'thesis' } }. */
  choices: Record<string, string>;
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

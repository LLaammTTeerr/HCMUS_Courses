// Request/response contract shared by the server and the React client.
import { z } from 'zod';
import type { Attempt, EnglishCert, Profile, StudentRecord } from './domain/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date YYYY-MM-DD');

export const attemptInput = z
  .object({
    code: z.string().trim().toUpperCase().min(1),
    semester: z.number().int().min(1),
    status: z.enum(['completed', 'in-progress', 'planned']),
    grade10: z.number().min(0).max(10).nullable().default(null),
  })
  .refine((a) => a.status !== 'completed' || a.grade10 !== null, {
    message: 'A completed attempt needs a grade',
    path: ['grade10'],
  });

export const attemptPatch = z.object({
  semester: z.number().int().min(1).optional(),
  status: z.enum(['completed', 'in-progress', 'planned']).optional(),
  grade10: z.number().min(0).max(10).nullable().optional(),
});

export const batchInput = z.object({ attempts: z.array(attemptInput).min(1) });
export const batchDeleteInput = z.object({ ids: z.array(z.number().int()).min(1) });

export const profilePatch = z.object({
  programId: z.string().optional(),
  currentSemester: z.number().int().min(1).optional(),
  /** Whole map of program choices, e.g. { gradTrack: 'thesis', specialization: 'networks' }. */
  choices: z.record(z.string(), z.string()).optional(),
  militaryCert: z.boolean().optional(),
  thesisGpaThreshold: z.number().min(0).max(10).nullable().optional(),
});

export const englishInput = z
  .object({
    type: z.enum(['IELTS', 'TOEFL_IBT', 'TOEFL_ITP_TOEIC_SW']),
    score: z.number().min(0),
    score2: z.number().min(0).nullable().default(null),
    issued: isoDate,
    expires: isoDate.nullable().default(null),
  })
  .refine((e) => e.type !== 'TOEFL_ITP_TOEIC_SW' || e.score2 !== null, {
    message: 'TOEIC Speaking & Writing score is required',
    path: ['score2'],
  });

export const gpaOverrideInput = z.object({ counts: z.boolean() });

export type AttemptInput = z.infer<typeof attemptInput>;
export type AttemptPatch = z.infer<typeof attemptPatch>;
export type ProfilePatch = z.infer<typeof profilePatch>;
export type EnglishInput = z.infer<typeof englishInput>;

export type RecordResponse = StudentRecord;
export type { Attempt, EnglishCert, Profile };

export interface ApiError {
  error: string;
}

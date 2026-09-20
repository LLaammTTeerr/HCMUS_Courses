import type { Program } from './program';
import type { EnglishCert, EnglishType } from './types';

/** Minimum scores for APCS K2024 (QĐ1985/QĐ-KHTN, Art. 2). */
export const ENGLISH_MINIMUMS: Record<EnglishType, { label: string; score: number; score2?: number }> = {
  IELTS: { label: 'IELTS', score: 6.0 },
  TOEFL_IBT: { label: 'TOEFL iBT', score: 79 },
  TOEFL_ITP_TOEIC_SW: { label: 'TOEFL ITP + TOEIC Speaking & Writing', score: 550, score2: 270 },
};

export function englishMeets(cert: EnglishCert): boolean {
  const min = ENGLISH_MINIMUMS[cert.type];
  if (cert.score < min.score) return false;
  if (min.score2 !== undefined) return cert.score2 !== null && cert.score2 >= min.score2;
  return true;
}

/** Last valid date (ISO): stated expiry, else issue date + default validity (QĐ1985 Art. 2.2). */
export function englishValidUntil(program: Program, cert: EnglishCert): string {
  if (cert.expires) return cert.expires;
  const [y, m, d] = cert.issued.split('-');
  return `${Number(y) + program.meta.englishDefaultValidityYears}-${m}-${d}`;
}

// Context and types live apart from the provider so editing store.tsx during development keeps the
// same context object (Vite hot reload would otherwise orphan already-mounted consumers).
import { createContext, useContext } from 'react';
import type { AttemptPatch, EnglishInput, ProfilePatch } from '../../shared/api';
import type { Attempt, NewAttempt, StudentRecord } from '../../shared/domain/types';

export type LoadStatus = 'loading' | 'ready' | 'offline' | 'error';

export interface FailedOp {
  key: number;
  label: string;
  message: string;
  retry: () => void;
}

export interface StoreValue {
  record: StudentRecord | null;
  status: LoadStatus;
  loadError: string | null;
  failures: FailedOp[];
  /** Attempt ids whose last save failed. */
  failedIds: Set<number>;
  reload: () => void;
  addAttempts: (attempts: NewAttempt[]) => Promise<Attempt[] | null>;
  updateAttempt: (id: number, patch: AttemptPatch) => void;
  deleteAttempts: (ids: number[]) => void;
  updateProfile: (patch: ProfilePatch) => void;
  putEnglish: (cert: EnglishInput) => void;
  deleteEnglish: () => void;
  /** `null` resets the course to the program default. */
  setGpaOverride: (code: string, counts: boolean | null) => void;
  dismissFailure: (key: number) => void;
  openCourse: (code: string | null) => void;
  openCode: string | null;
}

export const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AttemptPatch, EnglishInput, ProfilePatch } from '../../shared/api';
import type { Attempt, NewAttempt, StudentRecord } from '../../shared/domain/types';
import { api, ApiUnavailable } from '../api/client';

export type LoadStatus = 'loading' | 'ready' | 'offline' | 'error';

export interface FailedOp {
  key: number;
  label: string;
  message: string;
  retry: () => void;
}

interface StoreValue {
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
  dismissFailure: (key: number) => void;
  openCourse: (code: string | null) => void;
  openCode: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * Holds the student record. Mutations update the UI immediately, then persist through the API.
 * A failed save keeps the change on screen and registers a retry action instead of losing it.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<StudentRecord | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failures, setFailures] = useState<FailedOp[]>([]);
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());
  const [openCode, setOpenCode] = useState<string | null>(null);
  const tempId = useRef(-1);
  const recordRef = useRef(record);
  recordRef.current = record;
  const failureKey = useRef(1);

  const reload = useCallback(() => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    api.getRecord().then(
      (r) => {
        setRecord(r);
        setStatus('ready');
        setLoadError(null);
      },
      (err) => {
        setStatus(err instanceof ApiUnavailable ? 'offline' : 'error');
        setLoadError(err.message);
      },
    );
  }, []);

  useEffect(reload, [reload]);

  const markIds = (ids: number[], failed: boolean) =>
    setFailedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) failed ? next.add(id) : next.delete(id);
      return next;
    });

  /** Runs a save; on failure records a retry that re-runs the same save. */
  const persist = useCallback(<T,>(label: string, run: () => Promise<T>, ids: number[] = []): Promise<T | null> => {
    const attempt = (key?: number): Promise<T | null> =>
      run().then(
        (value) => {
          if (key !== undefined) setFailures((f) => f.filter((x) => x.key !== key));
          markIds(ids, false);
          return value;
        },
        (err: Error) => {
          markIds(ids, true);
          const k = key ?? failureKey.current++;
          setFailures((f) => [
            ...f.filter((x) => x.key !== k),
            { key: k, label, message: err instanceof ApiUnavailable ? 'server not reachable' : err.message, retry: () => void attempt(k) },
          ]);
          return null;
        },
      );
    return attempt();
  }, []);

  const addAttempts = useCallback(async (attempts: NewAttempt[]) => {
    if (attempts.length === 0) return [];
    const temps: Attempt[] = attempts.map((a) => ({ ...a, id: tempId.current-- }));
    setRecord((r) => r && { ...r, attempts: [...r.attempts, ...temps] });
    const tempIds = temps.map((t) => t.id);
    const saved = await persist(
      attempts.length === 1 ? `Add ${attempts[0].code}` : `Add ${attempts.length} courses`,
      () => api.createAttempts(attempts),
      tempIds,
    );
    if (saved) {
      setRecord((r) => r && { ...r, attempts: [...r.attempts.filter((a) => !tempIds.includes(a.id)), ...saved] });
    }
    return saved;
  }, [persist]);

  const updateAttempt = useCallback((id: number, patch: AttemptPatch) => {
    const code = recordRef.current?.attempts.find((a) => a.id === id)?.code ?? 'attempt';
    setRecord((r) => r && { ...r, attempts: r.attempts.map((a) => (a.id === id ? ({ ...a, ...patch } as Attempt) : a)) });
    void persist(`Update ${code}`, () => api.updateAttempt(id, patch), [id]);
  }, [persist]);

  const deleteAttempts = useCallback((ids: number[]) => {
    setRecord((r) => r && { ...r, attempts: r.attempts.filter((a) => !ids.includes(a.id)) });
    const persisted = ids.filter((id) => id > 0);
    if (persisted.length) void persist(`Remove ${ids.length} attempt(s)`, () => api.deleteAttempts(persisted));
  }, [persist]);

  const updateProfile = useCallback((patch: ProfilePatch) => {
    setRecord((r) => r && { ...r, profile: { ...r.profile, ...patch } });
    void persist('Update settings', () => api.updateProfile(patch));
  }, [persist]);

  const putEnglish = useCallback((cert: EnglishInput) => {
    setRecord((r) => r && { ...r, english: { ...cert, score2: cert.score2 ?? null, expires: cert.expires ?? null } });
    void persist('Save English certificate', () => api.putEnglish(cert));
  }, [persist]);

  const deleteEnglish = useCallback(() => {
    setRecord((r) => r && { ...r, english: null });
    void persist('Remove English certificate', () => api.deleteEnglish());
  }, [persist]);

  const value = useMemo<StoreValue>(() => ({
    record, status, loadError, failures, failedIds, reload,
    addAttempts, updateAttempt, deleteAttempts, updateProfile, putEnglish, deleteEnglish,
    dismissFailure: (key) => setFailures((f) => f.filter((x) => x.key !== key)),
    openCourse: setOpenCode,
    openCode,
  }), [record, status, loadError, failures, failedIds, reload, addAttempts, updateAttempt, deleteAttempts, updateProfile, putEnglish, deleteEnglish, openCode]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

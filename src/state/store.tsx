import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AttemptPatch, EnglishInput, ProfilePatch } from '../../shared/api';
import type { Attempt, NewAttempt, StudentRecord } from '../../shared/domain/types';
import { api, ApiUnavailable } from '../api/client';
import { StoreContext, type FailedOp, type LoadStatus, type StoreValue } from './storeContext';

export { useStore } from './storeContext';

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

  const setGpaOverride = useCallback((code: string, counts: boolean | null) => {
    setRecord((r) => {
      if (!r) return r;
      const next = { ...r.gpaOverrides };
      if (counts === null) delete next[code];
      else next[code] = counts;
      return { ...r, gpaOverrides: next };
    });
    void persist(`GPA setting for ${code}`, () =>
      counts === null ? api.resetGpaOverride(code) : api.setGpaOverride(code, counts));
  }, [persist]);

  const value = useMemo<StoreValue>(() => ({
    record, status, loadError, failures, failedIds, reload,
    addAttempts, updateAttempt, deleteAttempts, updateProfile, putEnglish, deleteEnglish, setGpaOverride,
    dismissFailure: (key) => setFailures((f) => f.filter((x) => x.key !== key)),
    openCourse: setOpenCode,
    openCode,
  }), [record, status, loadError, failures, failedIds, reload, addAttempts, updateAttempt, deleteAttempts, updateProfile, putEnglish, deleteEnglish, setGpaOverride, openCode]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

import type { AttemptInput, AttemptPatch, EnglishInput, ProfilePatch } from '../../shared/api';
import type { Attempt, EnglishCert, GpaOverrides, Profile, StudentRecord } from '../../shared/domain/types';

/** The API could not be reached (server not running). */
export class ApiUnavailable extends Error {}

/** The API answered with an error status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiUnavailable('Server not reachable');
  }
  if (res.status === 502 || res.status === 504) throw new ApiUnavailable('Server not reachable');
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(data.error ?? res.statusText, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  getRecord: () => request<StudentRecord>('GET', '/record'),
  updateProfile: (patch: ProfilePatch) => request<Profile>('PUT', '/profile', patch),
  createAttempts: (attempts: AttemptInput[]) => request<Attempt[]>('POST', '/attempts/batch', { attempts }),
  updateAttempt: (id: number, patch: AttemptPatch) => request<Attempt>('PATCH', `/attempts/${id}`, patch),
  deleteAttempts: (ids: number[]) => request<void>('POST', '/attempts/batch-delete', { ids }),
  putEnglish: (cert: EnglishInput) => request<EnglishCert>('PUT', '/english', cert),
  deleteEnglish: () => request<void>('DELETE', '/english'),
  setGpaOverride: (code: string, counts: boolean) => request<GpaOverrides>('PUT', `/gpa-overrides/${code}`, { counts }),
  resetGpaOverride: (code: string) => request<GpaOverrides>('DELETE', `/gpa-overrides/${code}`),
};

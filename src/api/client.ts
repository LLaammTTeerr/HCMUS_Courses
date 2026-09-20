import type {
  AttemptInput, AttemptPatch, AuthUser, EnglishInput, InviteRow, ProfilePatch,
} from '../../shared/api';
import type { Attempt, EnglishCert, GpaOverrides, Profile, StudentRecord } from '../../shared/domain/types';

/** The API could not be reached (server not running). */
export class ApiUnavailable extends Error {}

/** No valid session: the caller must sign in again. */
export class ApiUnauthorized extends Error {}

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
    if (res.status === 401) throw new ApiUnauthorized(data.error ?? 'Sign in required');
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

  // ---- accounts ----
  me: () => request<{ user: AuthUser }>('GET', '/auth/me'),
  login: (username: string, password: string) => request<{ user: AuthUser }>('POST', '/auth/login', { username, password }),
  register: (input: { username: string; displayName: string; password: string; inviteCode: string }) =>
    request<{ user: AuthUser }>('POST', '/auth/register', input),
  logout: () => request<void>('POST', '/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ user: AuthUser }>('POST', '/auth/password', { currentPassword, newPassword }),

  // ---- admin ----
  listUsers: () => request<AuthUser[]>('GET', '/admin/users'),
  listInvites: () => request<InviteRow[]>('GET', '/admin/invites'),
  createInvite: (note: string, expiresInDays: number | null) =>
    request<{ code: string; invites: InviteRow[] }>('POST', '/admin/invites', { note, expiresInDays }),
  revokeInvite: (codeHash: string) => request<InviteRow[]>('DELETE', `/admin/invites/${codeHash}`),
  resetPassword: (id: number) => request<{ temporaryPassword: string; user: AuthUser }>('POST', `/admin/users/${id}/reset-password`),
};

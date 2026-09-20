import { useEffect, useState } from 'react';
import type { AuthUser, InviteRow } from '../../shared/api';
import { api } from '../api/client';

/** Admin page: hand out invite codes, see who used them, reset a forgotten password. */
export function InvitesPage() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('14');
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.listInvites().then(setInvites, (e: Error) => setError(e.message));
    api.listUsers().then(setUsers, (e: Error) => setError(e.message));
  };
  useEffect(load, []);

  const create = async () => {
    setError(null);
    try {
      const { code, invites: next } = await api.createInvite(note, expires === 'never' ? null : Number(expires));
      setFreshCode(code);
      setInvites(next);
      setNote('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const revoke = async (codeHash: string) => {
    try {
      setInvites(await api.revokeInvite(codeHash));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reset = async (user: AuthUser) => {
    try {
      const { temporaryPassword } = await api.resetPassword(user.id);
      setTempPassword({ username: user.username, password: temporaryPassword });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => undefined);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invites & accounts</h1>
          <p>Anyone registering needs a code from here. Codes work once and are never shown again.</p>
        </div>
      </div>

      {error && <div className="banner error"><span>{error}</span></div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <h2>New invite</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1 }}>
              Note <span className="faint">(who is it for?)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mai — CLC 2026" />
            </label>
            <label className="field">
              Expires
              <select className="input" value={expires} onChange={(e) => setExpires(e.target.value)}>
                <option value="7">in 7 days</option>
                <option value="14">in 14 days</option>
                <option value="90">in 90 days</option>
                <option value="never">never</option>
              </select>
            </label>
            <button className="btn primary" onClick={create}>Create code</button>
          </div>

          {freshCode && (
            <div className="banner" style={{ background: 'var(--passed-soft)', marginBottom: 0 }}>
              <div>
                <div className="small muted">Share this code — it is shown only now:</div>
                <strong className="mono" style={{ fontSize: 18 }}>{freshCode}</strong>
              </div>
              <span className="spacer" />
              <button className="btn small" onClick={() => copy(freshCode)}>Copy</button>
              <button className="icon-btn" onClick={() => setFreshCode(null)} aria-label="Dismiss">✕</button>
            </div>
          )}

          <h2 style={{ marginTop: 8 }}>Outstanding & used</h2>
          {invites.length === 0 ? <p className="muted small">No invites yet.</p> : (
            <table className="list">
              <thead><tr><th>Note</th><th>Created</th><th>Status</th><th /></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.codeHash}>
                    <td>{i.note ?? <span className="faint">—</span>}</td>
                    <td className="small muted">{i.createdAt.slice(0, 10)}</td>
                    <td>
                      {i.usedBy
                        ? <span className="badge passed">used by {i.usedBy}</span>
                        : i.expiresAt && i.expiresAt < new Date().toISOString()
                          ? <span className="badge failed">expired</span>
                          : <span className="badge planned">unused</span>}
                    </td>
                    <td className="num">
                      {!i.usedBy && <button className="btn small danger" onClick={() => revoke(i.codeHash)}>Revoke</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card stack">
          <h2>Accounts</h2>
          {tempPassword && (
            <div className="banner" style={{ background: 'var(--warn-soft)', marginBottom: 0 }}>
              <div>
                <div className="small muted">Temporary password for <b>{tempPassword.username}</b> — shown once:</div>
                <strong className="mono" style={{ fontSize: 18 }}>{tempPassword.password}</strong>
              </div>
              <span className="spacer" />
              <button className="btn small" onClick={() => copy(tempPassword.password)}>Copy</button>
              <button className="icon-btn" onClick={() => setTempPassword(null)} aria-label="Dismiss">✕</button>
            </div>
          )}
          <table className="list">
            <thead><tr><th>User</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="course-name">
                      <span>{u.displayName} {u.isAdmin && <span className="badge bucket">admin</span>}</span>
                      <span className="vi">{u.username}{u.mustChangePassword ? ' · must change password' : ''}</span>
                    </div>
                  </td>
                  <td className="small muted">{u.lastLogin ? u.lastLogin.slice(0, 16).replace('T', ' ') : 'never'}</td>
                  <td className="num"><button className="btn small" onClick={() => reset(u)}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small faint" style={{ margin: 0 }}>
            A reset signs that person out everywhere and makes them choose a new password.
          </p>
        </div>
      </div>
    </>
  );
}

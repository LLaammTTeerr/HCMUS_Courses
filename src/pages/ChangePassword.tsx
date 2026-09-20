import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store';

export function ChangePassword({ onDone, forced = false }: { onDone: () => void; forced?: boolean }) {
  const { changePassword } = useStore();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const message = await changePassword(currentPassword, newPassword);
    setBusy(false);
    if (message) setError(message);
    else onDone();
  };

  return (
    <form className="card stack" style={{ maxWidth: 420 }} onSubmit={submit}>
      <h2>{forced ? 'Choose a new password' : 'Change password'}</h2>
      {forced && <p className="muted" style={{ margin: 0 }}>Your password was reset, so pick your own before continuing.</p>}
      <label className="field">
        Current password
        <input className="input" type="password" autoComplete="current-password" value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        New password <span className="faint">(at least 10 characters)</span>
        <input className="input" type="password" autoComplete="new-password" value={newPassword}
          onChange={(e) => setNext(e.target.value)} required />
      </label>
      {error && <div className="errors" style={{ paddingLeft: 0 }}>{error}</div>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>Save</button>
        {!forced && <button className="btn" type="button" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

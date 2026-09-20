import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store';

/** Sign-in and invite-only registration. Shown instead of the app while signed out. */
export function AuthPage() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = mode === 'signin'
      ? await signIn(username.trim(), password)
      : await signUp({ username: username.trim().toLowerCase(), displayName: displayName.trim(), password, inviteCode: inviteCode.trim().toUpperCase() });
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className="auth-screen">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>🎓 HCMUS Progress</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mode === 'signin' ? 'Sign in to see your courses.' : 'Registration needs an invite code.'}
          </p>
        </div>

        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''}
            onClick={() => { setMode('signin'); setError(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''}
            onClick={() => { setMode('register'); setError(null); }}>Register</button>
        </div>

        <label className="field">
          Username
          <input className="input" autoComplete="username" autoFocus value={username}
            onChange={(e) => setUsername(e.target.value)} required />
        </label>

        {mode === 'register' && (
          <>
            <label className="field">
              Display name <span className="faint">(optional)</span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="field">
              Invite code
              <input className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)} required />
            </label>
          </>
        )}

        <label className="field">
          Password
          <input className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} required />
          {mode === 'register' && <span className="faint">At least 10 characters.</span>}
        </label>

        {error && <div className="errors" style={{ paddingLeft: 0 }}>{error}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p className="small faint" style={{ margin: 0 }}>
          Forgot your password? Ask the person who runs this site to reset it.
        </p>
      </form>
    </div>
  );
}

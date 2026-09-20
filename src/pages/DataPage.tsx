import { useRef, useState } from 'react';
import { exportPayload } from '../../shared/api';
import { api } from '../api/client';
import { useStore } from '../state/store';

/** Download a copy of your data, or restore one. */
export function DataPage() {
  const { record, reload } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; attempts: number; json: unknown } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File) => {
    setError(null);
    setMessage(null);
    try {
      const parsed = exportPayload.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setError('That file is not an export from this app.');
        return;
      }
      setPending({ name: file.name, attempts: parsed.data.attempts.length, json: parsed.data });
    } catch {
      setError('That file is not valid JSON.');
    }
  };

  const restore = async () => {
    if (!pending) return;
    try {
      await api.importRecord(pending.json);
      setPending(null);
      setMessage('Restored. Your courses now match the file.');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your data</h1>
          <p>Everything you enter stays on this machine. Take a copy whenever you like.</p>
        </div>
      </div>

      {message && <div className="banner" style={{ background: 'var(--passed-soft)' }}><span>{message}</span></div>}
      {error && <div className="banner error"><span>{error}</span></div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <h2>Download</h2>
          <p className="muted" style={{ margin: 0 }}>
            {record?.attempts.length ?? 0} course attempts, your programme, choices, certificate and GPA settings.
          </p>
          <div className="row">
            <a className="btn primary" href="/api/export">Download JSON (full backup)</a>
            <a className="btn" href="/api/export.csv">Download CSV (courses only)</a>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            The JSON file is what a restore reads. The CSV is for spreadsheets and cannot be restored.
          </p>
        </div>

        <div className="card stack">
          <h2>Restore</h2>
          <p className="muted" style={{ margin: 0 }}>
            Reading a backup <b>replaces</b> everything in your account — courses, programme, choices and
            certificate. Other people's accounts are untouched.
          </p>
          <input ref={fileInput} className="input" type="file" accept="application/json,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); }} aria-label="Backup file" />
          {pending && (
            <div className="banner" style={{ background: 'var(--warn-soft)', marginBottom: 0 }}>
              <span>
                Replace your data with <b>{pending.name}</b> ({pending.attempts} attempts)?
              </span>
              <span className="spacer" />
              <button className="btn danger" onClick={restore}>Replace</button>
              <button className="btn" onClick={() => { setPending(null); if (fileInput.current) fileInput.current.value = ''; }}>Cancel</button>
            </div>
          )}
          <p className="small faint" style={{ margin: 0 }}>
            The server also copies its database to <code>data/backups/</code> once a day and keeps the last seven.
          </p>
        </div>
      </div>
    </>
  );
}

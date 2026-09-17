import { useMemo, useState } from 'react';
import { parseQuickEntry } from '../../shared/domain/quickEntry';
import type { Program } from '../../shared/domain/types';
import { courseIndex } from '../../shared/programs/index';
import { useStore } from '../state/store';
import { StatusBadge } from './common';

const EXAMPLE = `# CODE SEMESTER GRADE — one course per line
CS160 1 8.5
MTH251 1 7
CS163 2 9`;

export function QuickEntry({ program, currentSemester, onDone }: { program: Program; currentSemester: number; onDone: () => void }) {
  const { addAttempts } = useStore();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseQuickEntry(program, text, currentSemester), [program, text, currentSemester]);
  const index = courseIndex(program);

  const save = async () => {
    setSaving(true);
    const saved = await addAttempts(parsed.rows.map(({ line: _line, ...a }) => a));
    setSaving(false);
    if (saved) {
      setText('');
      onDone();
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div>
          <h2>Quick entry</h2>
          <div className="small muted">
            One attempt per line: <code>CODE SEMESTER [GRADE]</code>. Semester 1 = HK1 2024–2025. Without a grade the course is
            in progress (current semester) or planned. Separators: space, tab, “;” or CSV commas — pasting from a spreadsheet works.
          </div>
        </div>
      </div>
      <div className="quick">
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="input" value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} aria-label="Quick entry lines" />
          {parsed.errors.length > 0 && (
            <ul className="errors">
              {parsed.errors.map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}
            </ul>
          )}
          <div className="row">
            <button className="btn primary" disabled={saving || parsed.rows.length === 0 || parsed.errors.length > 0} onClick={save}>
              Save {parsed.rows.length || ''} {parsed.rows.length === 1 ? 'attempt' : 'attempts'}
            </button>
            <button className="btn" onClick={onDone}>Close</button>
            {parsed.errors.length > 0 && <span className="small faint">Fix the errors to save.</span>}
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 340 }}>
          {parsed.rows.length === 0 ? <p className="muted small">Preview appears here.</p> : (
            <table className="list">
              <thead><tr><th>Line</th><th>Course</th><th className="num">Sem</th><th className="num">Grade</th><th>Status</th></tr></thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="faint">{r.line}</td>
                    <td><b>{r.code}</b> <span className="muted small">{index.get(r.code)?.nameEn}</span></td>
                    <td className="num">{r.semester}</td>
                    <td className="num">{r.grade10 ?? '—'}</td>
                    <td>
                      <StatusBadge status={r.status === 'completed' ? (r.grade10! >= 5 ? 'passed' : 'failed') : r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { EnglishInput } from '../../shared/api';
import { ENGLISH_MINIMUMS } from '../../shared/domain/english';
import type { EnglishType } from '../../shared/domain/types';
import type { PageProps } from '../App';
import { useStore } from '../state/store';

const ICON = { done: '✓', 'covered-by-plan': '◷', missing: '✕', unknown: '?' } as const;
const STATUS_TEXT = { done: 'Done', 'covered-by-plan': 'Covered by plan', missing: 'Missing', unknown: 'Unknown' } as const;

export function ChecklistPage({ record, derived }: PageProps) {
  const { updateProfile } = useStore();
  const { profile } = record;
  const [threshold, setThreshold] = useState(profile.thesisGpaThreshold?.toString() ?? '');
  useEffect(() => setThreshold(profile.thesisGpaThreshold?.toString() ?? ''), [profile.thesisGpaThreshold]);

  const commitThreshold = () => {
    const t = threshold.trim() === '' ? null : Number(threshold.replace(',', '.'));
    if (t !== null && (!Number.isFinite(t) || t < 0 || t > 10)) return;
    if (t !== profile.thesisGpaThreshold) updateProfile({ thesisGpaThreshold: t });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Graduation checklist</h1>
          <p>Conditions of Article 17 (Quy chế 1175), the 2024 program document and the English standard QĐ1985.</p>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          {derived.checklist.map((item) => (
            <div key={item.id} className="check-item">
              <span className={`check-icon ${item.status}`} aria-label={STATUS_TEXT[item.status]}>{ICON[item.status]}</span>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{item.label}</b>
                  <span className="small faint">{STATUS_TEXT[item.status]}</span>
                </div>
                <div className="small muted">{item.detail}</div>
                <div className="small faint">{item.source}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="stack">
          <EnglishCard record={record} />

          <div className="card stack">
            <h2>Other conditions</h2>
            <label className="row">
              <input type="checkbox" checked={profile.militaryCert} onChange={(e) => updateProfile({ militaryCert: e.target.checked })} />
              Military Education certificate (chứng chỉ GDQP-AN) received
            </label>
            <label className="field">
              Thesis GPA threshold (from the faculty — not published)
              <input className="input" style={{ width: 120 }} inputMode="decimal" placeholder="e.g. 7.0" value={threshold}
                onChange={(e) => setThreshold(e.target.value)} onBlur={commitThreshold}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </label>
            <p className="small muted" style={{ margin: 0 }}>
              The IT standard (chuẩn tin học) is not defined in the APCS 2024 program. Ask giáo vụ (giaovu@apcs.fitus.edu.vn) to confirm.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function EnglishCard({ record }: Pick<PageProps, 'record'>) {
  const { putEnglish, deleteEnglish } = useStore();
  const cert = record.english;
  const blank: EnglishInput = { type: 'IELTS', score: 0, score2: null, issued: '', expires: null };
  const [form, setForm] = useState<EnglishInput>(cert ?? blank);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(record.english ?? blank), [record.english]);

  const min = ENGLISH_MINIMUMS[form.type];
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.issued)) return setError('Enter the issue date');
    if (!(form.score > 0)) return setError('Enter the score');
    if (min.score2 !== undefined && !(form.score2 && form.score2 > 0)) return setError('Enter the TOEIC Speaking & Writing score');
    setError(null);
    putEnglish({ ...form, score2: min.score2 !== undefined ? form.score2 : null, expires: form.expires || null });
  };
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')));

  return (
    <div className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>English certificate</h2>
        {cert && <button className="btn small danger" onClick={deleteEnglish}>Remove</button>}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Type
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EnglishType })}>
            {(Object.keys(ENGLISH_MINIMUMS) as EnglishType[]).map((t) => <option key={t} value={t}>{ENGLISH_MINIMUMS[t].label}</option>)}
          </select>
        </label>
        <label className="field">
          {form.type === 'TOEFL_ITP_TOEIC_SW' ? 'TOEFL ITP' : 'Score'} (min {min.score})
          <input className="input" style={{ width: 90 }} inputMode="decimal" value={form.score || ''} onChange={(e) => setForm({ ...form, score: num(e.target.value) })} />
        </label>
        {min.score2 !== undefined && (
          <label className="field">
            TOEIC S&W (min {min.score2})
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={form.score2 ?? ''} onChange={(e) => setForm({ ...form, score2: e.target.value === '' ? null : num(e.target.value) })} />
          </label>
        )}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Issued
          <input className="input" type="date" value={form.issued} onChange={(e) => setForm({ ...form, issued: e.target.value })} />
        </label>
        <label className="field">
          Expires (if printed)
          <input className="input" type="date" value={form.expires ?? ''} onChange={(e) => setForm({ ...form, expires: e.target.value || null })} />
        </label>
        <button className="btn primary" onClick={save}>{cert ? 'Update' : 'Save'}</button>
      </div>
      {error && <div className="errors" style={{ paddingLeft: 0 }}>{error}</div>}
      <div className="small faint">Without a printed expiry the certificate counts as valid for 2 years from the issue date. Submit it before the graduation application.</div>
    </div>
  );
}

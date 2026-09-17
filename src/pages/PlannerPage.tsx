import { useMemo, useState, type DragEvent } from 'react';
import { courseSemester, semesterCredits } from '../../shared/domain/planner';
import { semesterLabel } from '../../shared/domain/semesters';
import { suggestedPlanAttempts } from '../../shared/domain/suggestedPlan';
import type { Attempt, Course, GradTrack } from '../../shared/domain/types';
import { courseIndex } from '../../shared/programs/index';
import type { PageProps } from '../App';
import { BUCKET_LABELS, BUCKET_ORDER } from '../components/common';
import { WarningList } from '../components/WarningList';
import { useStore } from '../state/store';

type DragPayload = { kind: 'course'; code: string } | { kind: 'attempt'; id: number };
const MIME = 'application/x-apcs-plan';

const TRACKS: { id: GradTrack; label: string }[] = [
  { id: 'thesis', label: 'Thesis (CS468)' },
  { id: 'capstone', label: 'Capstone (CS469 → CS470)' },
  { id: 'undecided', label: 'Undecided' },
];

export function PlannerPage({ record, derived }: PageProps) {
  const { addAttempts, updateAttempt, deleteAttempts, updateProfile, openCourse } = useStore();
  const { program, states, warnings } = derived;
  const r = program.rules;
  const index = courseIndex(program);
  const current = record.profile.currentSemester;
  const [dropTarget, setDropTarget] = useState<number | 'tray' | null>(null);
  const [undoIds, setUndoIds] = useState<number[] | null>(null);
  const [trayQuery, setTrayQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const credits = semesterCredits(program, record.attempts);
  const lastUsed = Math.max(0, ...record.attempts.map((a) => a.semester));
  const lastColumn = Math.min(r.maxSemesters, Math.max(r.standardSemesters, lastUsed, current + 1));
  const firstColumn = showPast ? 1 : current;
  const semesters = Array.from({ length: lastColumn - firstColumn + 1 }, (_, i) => firstColumn + i);
  const pastCount = record.attempts.filter((a) => a.semester < current).length;

  const warnedCodes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const w of warnings) {
      if (!w.code || w.severity === 'info') continue;
      map.set(w.code, [...(map.get(w.code) ?? []), w.message]);
    }
    return map;
  }, [warnings]);

  const q = trayQuery.trim().toLowerCase();
  const tray = program.courses
    .filter((c) => ['not-taken', 'failed'].includes(states.get(c.code)!.status))
    .filter((c) => !q || c.code.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q))
    .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || (a.suggestedSemester ?? 99) - (b.suggestedSemester ?? 99));

  const statusFor = (semester: number): 'in-progress' | 'planned' => (semester === current ? 'in-progress' : 'planned');

  const readPayload = (e: DragEvent): DragPayload | null => {
    try {
      return JSON.parse(e.dataTransfer.getData(MIME)) as DragPayload;
    } catch {
      return null;
    }
  };

  const dropOnSemester = (semester: number, e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const payload = readPayload(e);
    if (!payload || semester < current) return;
    if (payload.kind === 'course') {
      void addAttempts([{ code: payload.code, semester, status: statusFor(semester), grade10: null }]);
    } else {
      const attempt = record.attempts.find((a) => a.id === payload.id);
      if (attempt && attempt.status !== 'completed' && attempt.semester !== semester) {
        updateAttempt(attempt.id, { semester, status: statusFor(semester) });
      }
    }
  };

  const dropOnTray = (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const payload = readPayload(e);
    if (payload?.kind === 'attempt') deleteAttempts([payload.id]);
  };

  const loadSuggested = async () => {
    const plan = suggestedPlanAttempts(program, record);
    if (plan.length === 0) {
      setNotice('Nothing to add — every requirement is already passed, in progress or planned.');
      return;
    }
    const saved = await addAttempts(plan);
    if (saved) {
      setUndoIds(saved.map((a) => a.id));
      setNotice(`Added ${saved.length} planned courses. Review the warnings below and drag courses to adjust.`);
    }
  };

  const allowDrop = (target: number | 'tray') => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault();
    if (dropTarget !== target) setDropTarget(target);
  };

  const trackCourses = record.profile.gradTrack === 'thesis' ? r.thesis : record.profile.gradTrack === 'capstone' ? r.capstone : [];
  const gradSemesters = trackCourses.map((c) => `${c} ${courseSemester(states.get(c)) ? `S${courseSemester(states.get(c))}` : 'not planned'}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planner</h1>
          <p>Drag courses into semesters from S{current} (in progress) onward. Drag a card back to the tray to remove it.</p>
        </div>
        <div className="row">
          {undoIds && (
            <button className="btn" onClick={() => { deleteAttempts(undoIds); setUndoIds(null); setNotice(null); }}>
              Undo suggested plan ({undoIds.length})
            </button>
          )}
          <button className="btn primary" onClick={loadSuggested} title="Fill the remaining semesters from the official plan">
            Load suggested plan
          </button>
        </div>
      </div>

      <div className="card row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="row">
          <b>Graduation work</b>
          <div className="segmented" role="radiogroup" aria-label="Graduation track">
            {TRACKS.map((t) => (
              <button key={t.id} role="radio" aria-checked={record.profile.gradTrack === t.id}
                className={record.profile.gradTrack === t.id ? 'on' : ''} onClick={() => updateProfile({ gradTrack: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
          {gradSemesters.length > 0 && <span className="small muted">{gradSemesters.join(' · ')}</span>}
        </div>
        <div className="row">
          <label className="row small muted">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            Show past semesters{pastCount > 0 && !showPast ? ` (${pastCount} attempts)` : ''}
          </label>
          <span className="small faint">Limits: {r.semesterMin}–{r.semesterMax} credits per semester</span>
        </div>
      </div>
      {notice && (
        <div className="banner" style={{ background: 'var(--accent-soft)' }}>
          <span>{notice}</span><span className="spacer" />
          <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="planner-wrap">
        <div
          className={`card tray ${dropTarget === 'tray' ? 'drop' : ''}`}
          onDragOver={allowDrop('tray')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={dropOnTray}
          aria-label="Courses not yet taken"
        >
          <h2>Not yet taken <span className="faint small">({tray.length})</span></h2>
          <input className="input" placeholder="Filter…" value={trayQuery} onChange={(e) => setTrayQuery(e.target.value)} aria-label="Filter tray" />
          <div className="tray-list">
            {tray.map((c, i) => (
              <div key={c.code}>
                {(i === 0 || tray[i - 1].bucket !== c.bucket) && <div className="small faint" style={{ margin: '6px 0 2px' }}>{BUCKET_LABELS[c.bucket]}</div>}
                <PlanCard course={c} className={states.get(c.code)!.status === 'failed' ? 'failed' : 'course'}
                  payload={{ kind: 'course', code: c.code }} onOpen={() => openCourse(c.code)} />
              </div>
            ))}
          </div>
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <div className="columns">
            {semesters.map((s) => {
              const attempts = record.attempts.filter((a) => a.semester === s);
              const total = credits.get(s) ?? 0;
              const past = s < current;
              const bad = !past && attempts.length > 0 && (total < r.semesterMin || total > r.semesterMax);
              return (
                <div
                  key={s}
                  className={`column ${past ? 'past' : ''} ${s === current ? 'current' : ''} ${dropTarget === s ? 'drop' : ''}`}
                  onDragOver={past ? undefined : allowDrop(s)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => dropOnSemester(s, e)}
                  aria-label={`Semester ${s}`}
                >
                  <div className="column-head">
                    <div>
                      <div className="t">S{s}{s === current ? ' · now' : ''}</div>
                      <div className="s">{semesterLabel(program, s)}</div>
                    </div>
                    <span className={`credit-pill ${bad ? 'bad' : ''}`} title={bad ? `Outside ${r.semesterMin}–${r.semesterMax}` : undefined}>{total} cr</span>
                  </div>
                  {attempts.map((a) => (
                    <AttemptCard key={a.id} attempt={a} course={index.get(a.code)} draggable={a.status !== 'completed' && !past}
                      warnings={a.status === 'completed' ? undefined : warnedCodes.get(a.code)}
                      onOpen={() => openCourse(a.code)} onRemove={a.status === 'completed' ? undefined : () => deleteAttempts([a.id])} />
                  ))}
                  {attempts.length === 0 && !past && <div className="faint small" style={{ textAlign: 'center', padding: '16px 0' }}>Drop courses here</div>}
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="card-head"><h2>Plan check</h2></div>
            <WarningList warnings={warnings} />
          </div>
        </div>
      </div>
    </>
  );
}

function PlanCard({ course, className, payload, onOpen }: { course: Course; className: string; payload: DragPayload; onOpen: () => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`pcard ${className} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      title={`${course.nameEn} — click for details, drag to plan`}
    >
      <div className="top"><span className="code">{course.code}</span><span className="cr">{course.credits} cr</span></div>
      <div className="nm">{course.nameEn}</div>
    </div>
  );
}

interface AttemptCardProps {
  attempt: Attempt;
  course: Course | undefined;
  draggable: boolean;
  warnings?: string[];
  onOpen: () => void;
  onRemove?: () => void;
}

function AttemptCard({ attempt, course, draggable, warnings, onOpen, onRemove }: AttemptCardProps) {
  const [dragging, setDragging] = useState(false);
  const cls = attempt.status === 'completed' ? (attempt.grade10 !== null && attempt.grade10 >= 5 ? 'passed' : 'failed') : attempt.status;
  return (
    <div
      className={`pcard ${cls} ${draggable ? '' : 'static'} ${dragging ? 'dragging' : ''}`}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify({ kind: 'attempt', id: attempt.id })); setDragging(true); }}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      title={warnings?.join('\n') ?? course?.nameEn}
    >
      <div className="top">
        <span className="code">{attempt.code}</span>
        {warnings && <span className="warn" aria-label="Has warnings">⚠</span>}
        <span className="cr">{attempt.grade10 !== null ? attempt.grade10.toFixed(1) : `${course?.credits ?? '?'} cr`}</span>
        {onRemove && (
          <button className="icon-btn small" aria-label={`Remove ${attempt.code}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
        )}
      </div>
      <div className="nm">{course?.nameEn ?? 'Unknown course'}</div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { countsInGpa, defaultCountsInGpa, to4 } from '../../shared/domain/gpa';
import { dependents, prereqStatus } from '../../shared/domain/prereqs';
import { semesterLabel } from '../../shared/domain/semesters';
import type { AttemptStatus, StudentRecord } from '../../shared/domain/types';
import { courseIndex } from '../../shared/programs/index';
import type { Derived } from '../state/derived';
import { useStore } from '../state/store';
import { REQUIREMENT_LABELS, requirementKind } from '../../shared/domain/requirement';
import { fmt, RequirementBadge, StatusBadge } from './common';
import { GradeInput } from './GradeInput';
import { SemesterSelect } from './SemesterSelect';

const statusFor = (semester: number, current: number, grade: number | null): AttemptStatus =>
  grade !== null ? 'completed' : semester === current ? 'in-progress' : 'planned';

export function CourseDrawer({ record, derived }: { record: StudentRecord; derived: Derived }) {
  const { openCode, openCourse, updateAttempt, deleteAttempts, addAttempts, failedIds, setGpaOverride } = useStore();
  const { program, states } = derived;
  const current = record.profile.currentSemester;

  useEffect(() => {
    if (!openCode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openCourse(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCode, openCourse]);

  const [newSemester, setNewSemester] = useState(current + 1);
  const [newGrade, setNewGrade] = useState<number | null>(null);
  useEffect(() => {
    setNewSemester(current + 1);
    setNewGrade(null);
  }, [openCode, current]);

  if (!openCode) return null;
  const course = courseIndex(program).get(openCode);
  const state = states.get(openCode);
  if (!course || !state) return null;

  const referenceSemester = state.passedSemester ?? state.activeSemester ?? current + 1;
  const prereqs = prereqStatus(program, states, course.code, referenceSemester);
  const unlocks = dependents(program, course.code);
  const addNeedsGrade = newSemester < current && newGrade === null;
  const inGpa = countsInGpa(program, course.code, record.gpaOverrides);
  const gpaDefault = defaultCountsInGpa(program, course.code);
  const overridden = course.code in record.gpaOverrides;

  return (
    <>
      <div className="drawer-backdrop" onClick={() => openCourse(null)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${course.code} ${course.nameEn}`}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="row"><span className="mono faint">{course.code}</span><RequirementBadge course={course} /><StatusBadge status={state.status} /></div>
            <h2>{course.nameEn}</h2>
            <div className="muted">{course.nameVi}</div>
          </div>
          <button className="icon-btn" onClick={() => openCourse(null)} aria-label="Close">✕</button>
        </div>

        <dl className="kv">
          <dt>Group</dt><dd>{course.group}</dd>
          <dt>Requirement</dt><dd>{REQUIREMENT_LABELS[requirementKind(course)].long}</dd>
          <dt>Credits</dt><dd>{course.credits}</dd>
          <dt>Official grade</dt>
          <dd>{state.officialGrade === null ? '—' : `${fmt(state.officialGrade, 1)} · ${fmt(to4(state.officialGrade))} / 4`}</dd>
          <dt>GPA</dt>
          <dd>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={inGpa} onChange={(e) => setGpaOverride(course.code, e.target.checked === gpaDefault ? null : e.target.checked)} />
              Counts toward GPA &amp; graduation classification
            </label>
            <div className="small faint">
              Program default: {gpaDefault ? 'counts' : 'not counted'}
              {overridden && <> · <button className="icon-btn small" style={{ padding: 0, color: 'var(--accent)' }} onClick={() => setGpaOverride(course.code, null)}>reset</button></>}
            </div>
          </dd>
          <dt>Suggested</dt>
          <dd>{course.suggestedSemester ? `S${course.suggestedSemester} · ${semesterLabel(program, course.suggestedSemester)}` : 'Not in the official plan'}</dd>
        </dl>

        <section className="stack" style={{ gap: 8 }}>
          <h3>Prior courses <span className="faint small">(soft — học trước), checked for S{referenceSemester}</span></h3>
          {prereqs.length === 0 ? <span className="muted small">None listed</span> : (
            <div className="chips">
              {prereqs.map((p) => (
                <button key={p.code} className="chip" onClick={() => openCourse(p.code)} title={p.status}>
                  <span className={`dot ${p.status}`} />{p.code}
                  <span className="faint">{p.status === 'ok' ? 'ok' : p.status === 'weak' ? 'not passed' : 'missing'}</span>
                </button>
              ))}
            </div>
          )}
          {course.prereqNote && <div className="small faint">Original wording (Course Descriptions 2021): “{course.prereqNote}”</div>}
          {unlocks.length > 0 && (
            <>
              <h3 style={{ marginTop: 6 }}>Needed by</h3>
              <div className="chips">
                {unlocks.map((code) => (
                  <button key={code} className="chip" onClick={() => openCourse(code)}>{code}</button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h3>Attempts</h3>
          {state.attempts.length === 0 ? <span className="muted small">No attempts yet.</span> : (
            <table className="list">
              <thead><tr><th>Semester</th><th>Grade</th><th>Status</th><th /></tr></thead>
              <tbody>
                {state.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <SemesterSelect program={program} value={a.semester} ariaLabel="Attempt semester"
                        onChange={(s) => updateAttempt(a.id, { semester: s, status: statusFor(s, current, a.grade10) })} />
                    </td>
                    <td>
                      <GradeInput value={a.grade10}
                        onCommit={(g) => updateAttempt(a.id, { grade10: g, status: statusFor(a.semester, current, g) })} />
                    </td>
                    <td>
                      {a.status === 'completed'
                        ? <StatusBadge status={a.grade10 !== null && a.grade10 >= 5 ? 'passed' : 'failed'} />
                        : <StatusBadge status={a.status} />}
                      {failedIds.has(a.id) && <span className="retry-mark" title="Not saved — see the retry message"> ⟳</span>}
                    </td>
                    <td className="num">
                      <button className="icon-btn" onClick={() => deleteAttempts([a.id])} aria-label="Delete attempt">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="card" style={{ padding: 12 }}>
            <div className="row">
              <SemesterSelect program={program} value={newSemester} onChange={setNewSemester} ariaLabel="New attempt semester" />
              <GradeInput value={newGrade} onCommit={setNewGrade} placeholder="grade" />
              <button
                className="btn primary"
                disabled={addNeedsGrade}
                onClick={() => {
                  void addAttempts([{ code: course.code, semester: newSemester, grade10: newGrade, status: statusFor(newSemester, current, newGrade) }]);
                  setNewGrade(null);
                }}
              >
                {newGrade !== null ? 'Add result' : newSemester === current ? 'Mark in progress' : 'Plan'}
              </button>
            </div>
            <div className="small faint" style={{ marginTop: 6 }}>
              {addNeedsGrade
                ? 'Past semesters need a grade.'
                : 'Leave the grade empty to plan the course (or mark it in progress for the current semester).'}
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { countsInGpa } from '../../shared/domain/gpa';
import type { BucketId, CourseStatus } from '../../shared/domain/types';
import type { PageProps } from '../App';
import { REQUIREMENT_LABELS, requirementKind, type RequirementKind } from '../../shared/domain/requirement';
import { BUCKET_LABELS, BUCKET_ORDER, fmt, RequirementBadge, STATUS_LABELS, StatusBadge } from '../components/common';
import { QuickEntry } from '../components/QuickEntry';
import { useStore } from '../state/store';

export function CoursesPage({ record, derived }: PageProps) {
  const { openCourse } = useStore();
  const { program, states } = derived;
  const [params, setParams] = useSearchParams();
  const quick = params.get('quick') === '1';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CourseStatus | 'all'>('all');
  const [bucket, setBucket] = useState<BucketId | 'all'>('all');
  const [kind, setKind] = useState<RequirementKind | 'all'>('all');

  const q = query.trim().toLowerCase();
  const visible = program.courses.filter((c) => {
    const s = states.get(c.code)!;
    if (status !== 'all' && s.status !== status) return false;
    if (bucket !== 'all' && c.bucket !== bucket) return false;
    if (kind !== 'all' && requirementKind(c) !== kind) return false;
    return !q || c.code.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) || c.nameVi.toLowerCase().includes(q);
  });

  const setQuick = (on: boolean) => setParams(on ? { quick: '1' } : {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Courses</h1>
          <p>All {program.courses.length} courses of the program. Click a course to add or edit attempts.</p>
        </div>
        {!quick && <button className="btn primary" onClick={() => setQuick(true)}>Quick entry</button>}
      </div>

      {quick && <QuickEntry program={program} currentSemester={record.profile.currentSemester} onDone={() => setQuick(false)} />}

      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ width: 260 }} placeholder="Search code or name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus | 'all')} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABELS) as CourseStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value as BucketId | 'all')} aria-label="Filter by bucket">
          <option value="all">All buckets</option>
          {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
        </select>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RequirementKind | 'all')} aria-label="Filter by requirement">
          <option value="all">Compulsory & elective</option>
          {(Object.keys(REQUIREMENT_LABELS) as RequirementKind[]).map((k) => <option key={k} value={k}>{REQUIREMENT_LABELS[k].short}</option>)}
        </select>
        <span className="faint small">{visible.length} shown</span>
      </div>

      <div className="stack">
        {BUCKET_ORDER.map((b) => {
          const courses = visible.filter((c) => c.bucket === b);
          if (courses.length === 0) return null;
          const passedCredits = program.courses
            .filter((c) => c.bucket === b && states.get(c.code)!.status === 'passed')
            .reduce((sum, c) => sum + c.credits, 0);
          return (
            <section key={b} className="card" style={{ padding: '12px 8px' }}>
              <div className="card-head" style={{ padding: '0 10px', marginBottom: 4 }}>
                <h2>{BUCKET_LABELS[b]}</h2>
                <span className="small muted">{passedCredits} credits passed</span>
              </div>
              <table className="list">
                <thead>
                  <tr><th style={{ width: 110 }}>Code</th><th>Course</th><th style={{ width: 110 }}>Type</th><th className="num">Cr</th><th className="num">Sugg.</th><th className="num">Grade</th><th style={{ width: 120 }}>Status</th></tr>
                </thead>
                <tbody>
                  {courses.map((c) => {
                    const s = states.get(c.code)!;
                    return (
                      <tr key={c.code} className="clickable" onClick={() => openCourse(c.code)} tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openCourse(c.code)}>
                        <td className="mono"><b>{c.code}</b></td>
                        <td><div className="course-name"><span>{c.nameEn}</span><span className="vi">{c.nameVi}</span></div></td>
                        <td><RequirementBadge course={c} /></td>
                        <td className="num">{c.credits}</td>
                        <td className="num faint">{c.suggestedSemester ? `S${c.suggestedSemester}` : '—'}</td>
                        <td className="num">
                          {fmt(s.officialGrade, 1)}
                          {!countsInGpa(program, c.code, record.gpaOverrides) && <div className="faint" style={{ fontSize: 11 }} title="Not counted toward GPA">not in GPA</div>}
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                          {s.activeSemester && s.status !== 'passed' && <span className="faint small"> S{s.activeSemester}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </>
  );
}

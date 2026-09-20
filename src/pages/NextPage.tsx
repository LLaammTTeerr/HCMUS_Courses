import { useState } from 'react';
import { recommend } from '../../shared/domain/recommend';
import { semesterLabel } from '../../shared/domain/semesters';
import { courseIndex } from '../../shared/programs/index';
import type { PageProps } from '../App';
import { RequirementBadge } from '../components/common';
import { SemesterSelect } from '../components/SemesterSelect';
import { semesterCredits } from '../../shared/domain/planner';
import { useStore } from '../state/store';

const TIER_TITLES = ['Required', 'Computer Science (A) electives still needed', 'Math electives (B) still needed', 'Counts toward B + C', 'Extra — requirement already covered'];

export function NextPage({ record, derived }: PageProps) {
  const { addAttempts, openCourse } = useStore();
  const { program } = derived;
  const current = record.profile.currentSemester;
  const [target, setTarget] = useState(current + 1);
  const index = courseIndex(program);
  const list = recommend(program, record, target);
  const load = semesterCredits(program, record.attempts).get(target) ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>What next</h1>
          <p>Courses you can take in the chosen semester: prior courses taken earlier, ranked by the requirement they fill and how many courses they unlock.</p>
        </div>
        <div className="row">
          <span className="muted">Semester</span>
          <SemesterSelect program={program} value={target} onChange={setTarget} from={current} ariaLabel="Target semester" />
          <span className="credit-pill">{load} cr planned</span>
        </div>
      </div>

      {list.length === 0 && <div className="card muted">Nothing eligible for {semesterLabel(program, target)}.</div>}

      <div className="stack">
        {TIER_TITLES.map((title, tier) => {
          const rows = list.filter((x) => x.tier === tier);
          if (rows.length === 0) return null;
          return (
            <section key={tier} className="card" style={{ padding: '12px 8px' }}>
              <div className="card-head" style={{ padding: '0 10px', marginBottom: 4 }}>
                <h2>{title}</h2><span className="small muted">{rows.length}</span>
              </div>
              <table className="list fixed">
                <colgroup>
                  <col style={{ width: 104 }} />
                  <col style={{ width: 120 }} />
                  <col />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <tbody>
                  {rows.map((x) => {
                    const c = index.get(x.code)!;
                    return (
                      <tr key={x.code}>
                        <td className="mono">
                          <button className="icon-btn" style={{ fontWeight: 650, color: 'var(--text)' }} onClick={() => openCourse(x.code)}>{x.code}</button>
                        </td>
                        <td><RequirementBadge course={c} /></td>
                        <td><div className="course-name"><span>{c.nameEn}</span><span className="vi">{c.group} · {c.credits} cr{c.suggestedSemester ? ` · suggested S${c.suggestedSemester}` : ''}</span></div></td>
                        <td className="small muted">{x.reason}</td>
                        <td className="num">
                          <button className="btn small" onClick={() => void addAttempts([{ code: x.code, semester: target, grade10: null, status: target === current ? 'in-progress' : 'planned' }])}>
                            Add to S{target}
                          </button>
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

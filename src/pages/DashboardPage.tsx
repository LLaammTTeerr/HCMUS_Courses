import { Link } from 'react-router-dom';
import { rank } from '../../shared/domain/gpa';
import { currentSemesterOn, semesterLabel } from '../../shared/domain/semesters';
import { getProgram, listPrograms } from '../../shared/programs/index';
import type { PageProps } from '../App';
import { BarLegend, BucketBar } from '../components/BucketBar';
import { fmt } from '../components/common';
import { WarningList } from '../components/WarningList';
import { useStore } from '../state/store';

export function DashboardPage({ record, derived }: PageProps) {
  const { updateProfile } = useStore();
  const { program, report, gpa, graduation, warnings } = derived;
  const meta = program.meta;

  if (record.attempts.length === 0) {
    return (
      <div className="card empty stack" style={{ alignItems: 'center' }}>
        <div className="big">🎓</div>
        <h1>Welcome</h1>
        <label className="field" style={{ minWidth: 320, textAlign: 'left' }}>
          Which programme are you in?
          <select className="input" value={record.profile.programId} aria-label="Your programme"
            onChange={(e) => {
              const target = getProgram(e.target.value);
              updateProfile({ programId: target.meta.id, choices: {}, currentSemester: currentSemesterOn(target) });
            }}>
            {listPrograms().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <p className="muted" style={{ margin: 0 }}>
          {meta.shortName} · you are in {semesterLabel(program, record.profile.currentSemester)} (semester {record.profile.currentSemester}).
          Change it in the sidebar if that's wrong.
        </p>
        <p className="muted" style={{ margin: 0 }}>Then add the courses you have already completed — the dashboard fills in from there.</p>
        <Link className="btn primary" to="/courses?quick=1">Add completed courses</Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{program.meta.name}</p>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="label">Credits earned</div>
          <div className="value">{report.total.earned}<span className="faint" style={{ fontSize: 16 }}> / {meta.totalCredits}</span></div>
          <div className="sub">{report.total.inProgress - report.total.earned} in progress · {report.total.planned} with plan</div>
        </div>
        <div className="card kpi">
          <div className="label">ĐTB tích lũy</div>
          <div className="value">{fmt(gpa.gpa10)}<span className="faint" style={{ fontSize: 16 }}> · {fmt(gpa.gpa4)}/4</span></div>
          <div className="sub" title={gpa.excluded.length ? `Not counted: ${gpa.excluded.join(', ')}` : undefined}>
            {rank(gpa.gpa10)} · over {gpa.credits} credits{gpa.excluded.length > 0 && ` · ${gpa.excluded.length} graded not counted`}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Year level</div>
          <div className="value">Year {derived.yearLevel}</div>
          <div className="sub">by accumulated credits (38 per year)</div>
        </div>
        <div className="card kpi">
          <div className="label">Earliest graduation</div>
          <div className="value" style={{ fontSize: graduation ? 20 : 18 }}>{graduation ? semesterLabel(program, graduation) : 'Plan incomplete'}</div>
          <div className="sub">{graduation ? `semester ${graduation}` : <Link to="/planner">Complete the plan →</Link>}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Requirements by bucket</h2>
          <BarLegend />
        </div>
        <div className="bars">
          <BucketBar name="Total" value={report.total} />
          {report.groups.map((g) => (
            <BucketBar key={g.id} name={g.label} value={g} note={g.note} approx={g.approx} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Warnings</h2>
          <Link to="/planner" className="small">Open planner →</Link>
        </div>
        <WarningList warnings={warnings} limit={10} />
      </div>
    </>
  );
}

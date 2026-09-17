import { Link } from 'react-router-dom';
import { rank } from '../../shared/domain/gpa';
import { semesterLabel } from '../../shared/domain/semesters';
import type { PageProps } from '../App';
import { BarLegend, BucketBar } from '../components/BucketBar';
import { fmt } from '../components/common';
import { WarningList } from '../components/WarningList';

export function DashboardPage({ record, derived }: PageProps) {
  const { program, progress: p, gpa, graduation, warnings } = derived;
  const r = program.rules;

  if (record.attempts.length === 0) {
    return (
      <div className="card empty">
        <div className="big">🎓</div>
        <h1>Welcome</h1>
        <p className="muted">Start by adding the courses you have already completed. The dashboard fills in from there.</p>
        <Link className="btn primary" to="/courses?quick=1">Add completed courses</Link>
      </div>
    );
  }

  const overflowNote = p.overflowA.planned > 0 ? `includes +${p.overflowA.earned} (+${p.overflowA.planned} with plan) surplus from A` : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{program.name}</p>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="label">Credits earned</div>
          <div className="value">{p.total.earned}<span className="faint" style={{ fontSize: 16 }}> / {r.totalCredits}</span></div>
          <div className="sub">{p.total.inProgress - p.total.earned} in progress · {p.total.planned} with plan</div>
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
          <BucketBar name="Total" value={p.total} />
          <BucketBar name="Computer Science (A)" value={p.a} note={`required ${p.aReq.earned}/${p.aReq.required} · electives ${p.aElec.earned}/${p.aElec.required}${p.overflowA.earned ? ` · +${p.overflowA.earned} surplus counts toward C` : ''}`} />
          <BucketBar name="Non Computer Science" value={p.nonCs} />
          <BucketBar name="Math" value={p.math} />
          <BucketBar name="Physics" value={p.phys} />
          <BucketBar name="Math electives (B)" value={p.b} />
          <BucketBar name="CS electives (C)" value={p.c} approx note={overflowNote} />
          <BucketBar name="B + C electives" value={p.bc} />
          <BucketBar name={`Graduation work (${record.profile.gradTrack})`} value={p.grad} />
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

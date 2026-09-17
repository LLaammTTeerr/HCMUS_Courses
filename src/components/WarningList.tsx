import { Link } from 'react-router-dom';
import type { Warning } from '../../shared/domain/types';
import { useStore } from '../state/store';

const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' } as const;
const ROUTE = { planner: '/planner', courses: '/courses', checklist: '/checklist' } as const;
const RANK = { error: 0, warning: 1, info: 2 } as const;

export function WarningList({ warnings, limit }: { warnings: Warning[]; limit?: number }) {
  const { openCourse } = useStore();
  const sorted = [...warnings].sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.semester ?? 0) - (b.semester ?? 0));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (warnings.length === 0) return <p className="muted">No problems found. 🎉</p>;
  return (
    <>
      <ul className="warnings">
        {shown.map((w) => (
          <li key={w.id} className={w.severity}>
            <span className="sev" aria-label={w.severity}>{ICON[w.severity]}</span>
            <span className="msg">{w.message}</span>
            {w.code && (
              <button className="icon-btn small" onClick={() => openCourse(w.code!)} title="Open course">
                {w.code}
              </button>
            )}
            <Link to={ROUTE[w.link]}>Fix →</Link>
          </li>
        ))}
      </ul>
      {limit && sorted.length > limit && <p className="small muted">+{sorted.length - limit} more on the Planner page</p>}
    </>
  );
}

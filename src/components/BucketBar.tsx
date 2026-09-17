import type { BucketProgress } from '../../shared/domain/credits';

interface Props {
  name: string;
  value: BucketProgress;
  note?: string;
  /** Shown as "≈" when the target is a guideline rather than a hard rule. */
  approx?: boolean;
}

/** Stacked bar: earned (solid) ≤ in progress ≤ planned, against the required credits. */
export function BucketBar({ name, value, note, approx }: Props) {
  const scale = Math.max(value.required, value.planned, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const done = value.earned >= value.required;
  const covered = value.planned >= value.required;
  return (
    <div className={`bar-row ${done ? 'done' : ''}`}>
      <div className="top">
        <span className="name">
          {name} {done ? '✓' : covered ? <span className="faint small">covered by plan</span> : null}
        </span>
        <span className="nums">
          <b>{value.earned}</b>
          {value.inProgress > value.earned && <> · {value.inProgress}</>}
          {value.planned > value.inProgress && <> · {value.planned}</>} / {approx ? '≈' : ''}{value.required}
        </span>
      </div>
      <div
        className="bar"
        role="img"
        aria-label={`${name}: ${value.earned} earned, ${value.inProgress} with in-progress, ${value.planned} with plan, of ${value.required}`}
      >
        <span className="planned" style={{ width: pct(value.planned) }} />
        <span className="in-progress" style={{ width: pct(value.inProgress) }} />
        <span className="earned" style={{ width: pct(value.earned) }} />
        {scale > value.required && (
          <span style={{ left: pct(value.required), width: 2, background: 'var(--text-3)', borderRadius: 0 }} />
        )}
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function BarLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--passed)' }} />Earned</span>
      <span><i style={{ background: 'var(--progress)', opacity: 0.45 }} />In progress</span>
      <span><i style={{ background: 'var(--planned-soft)', boxShadow: 'inset 0 0 0 1px var(--planned)' }} />Planned</span>
    </div>
  );
}

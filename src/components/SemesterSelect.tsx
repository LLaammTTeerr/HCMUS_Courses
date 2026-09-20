import { semesterLabel } from '../../shared/domain/semesters';
import type { Program } from '../../shared/domain/program';

interface Props {
  program: Program;
  value: number;
  onChange: (semester: number) => void;
  from?: number;
  to?: number;
  className?: string;
  ariaLabel?: string;
}

export function SemesterSelect({ program, value, onChange, from = 1, to = program.meta.maxSemesters, className = 'input', ariaLabel }: Props) {
  const options = [];
  for (let s = from; s <= to; s++) options.push(s);
  return (
    <select className={className} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel ?? 'Semester'}>
      {options.map((s) => (
        <option key={s} value={s}>S{s} · {semesterLabel(program, s)}</option>
      ))}
    </select>
  );
}

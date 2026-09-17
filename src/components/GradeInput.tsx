import { useEffect, useState } from 'react';

interface Props {
  value: number | null;
  onCommit: (grade: number | null) => void;
  placeholder?: string;
}

/** 10-point grade field that saves on blur or Enter (accepts a decimal comma). */
export function GradeInput({ value, onCommit, placeholder = '—' }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      setText(value === null ? '' : String(value));
      return;
    }
    const rounded = Math.round(n * 10) / 10;
    if (rounded !== value) onCommit(rounded);
    setText(String(rounded));
  };

  return (
    <input
      className="input num"
      style={{ width: 64 }}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label="Grade (10-point)"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

import { useState } from 'react';
import type { StudentRecord } from '../../shared/domain/types';
import { currentSemesterOn } from '../../shared/domain/semesters';
import { courseIndex, getProgram, listPrograms } from '../../shared/programs/index';
import { useStore } from '../state/store';

/**
 * Switches the active program. Attempts are never deleted: codes the new program does not define are
 * simply ignored by the engine, and the picker says how many that would be before switching.
 */
export function ProgramPicker({ record }: { record: StudentRecord }) {
  const { updateProfile } = useStore();
  const programs = listPrograms();
  const [pending, setPending] = useState<string | null>(null);

  if (programs.length < 2) return null;

  const orphanCount = (id: string) => {
    const index = courseIndex(getProgram(id));
    return new Set(record.attempts.filter((a) => !index.has(a.code)).map((a) => a.code)).size;
  };

  const switchTo = (id: string) => {
    if (id === record.profile.programId) return;
    if (orphanCount(id) > 0 && pending !== id) {
      setPending(id);
      return;
    }
    setPending(null);
    updateProfile({ programId: id, choices: {}, currentSemester: currentSemesterOn(getProgram(id)) });
  };

  return (
    <>
      <span>Program</span>
      <select className="input" value={record.profile.programId} onChange={(e) => switchTo(e.target.value)} aria-label="Program">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}
      </select>
      {pending && (
        <div className="small" style={{ color: 'var(--warn)' }}>
          {orphanCount(pending)} of your courses do not exist in {getProgram(pending).meta.shortName}. They stay saved but
          will not count.{' '}
          <button className="btn small" onClick={() => switchTo(pending)}>Switch anyway</button>{' '}
          <button className="btn small" onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
    </>
  );
}

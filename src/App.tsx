import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { semesterLabel } from '../shared/domain/semesters';
import type { StudentRecord } from '../shared/domain/types';
import { CourseDrawer } from './components/CourseDrawer';
import { ProgramPicker } from './components/ProgramPicker';
import { SemesterSelect } from './components/SemesterSelect';
import { AuthPage } from './pages/AuthPage';
import { ChangePassword } from './pages/ChangePassword';
import { ChecklistPage } from './pages/ChecklistPage';
import { DataPage } from './pages/DataPage';
import { InvitesPage } from './pages/InvitesPage';
import { CoursesPage } from './pages/CoursesPage';
import { DashboardPage } from './pages/DashboardPage';
import { NextPage } from './pages/NextPage';
import { PlannerPage } from './pages/PlannerPage';
import { useDerived, type Derived } from './state/derived';
import { useStore } from './state/store';
import { useState } from 'react';

export interface PageProps {
  record: StudentRecord;
  derived: Derived;
}

export function App() {
  const { record, user, status, loadError, reload } = useStore();

  if (status === 'unauthenticated') return <AuthPage />;

  if (record && user?.mustChangePassword) {
    return (
      <div className="auth-screen">
        <ChangePassword forced onDone={reload} />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="main" style={{ maxWidth: 640, margin: '60px auto' }}>
        {status === 'loading' && <p className="muted">Loading…</p>}
        {status === 'offline' && (
          <div className="banner">
            <span>⚠️ Server not running — start it with <code>npm run dev</code>.</span>
            <span className="spacer" />
            <button className="btn" onClick={reload}>Retry</button>
          </div>
        )}
        {status === 'error' && (
          <div className="banner error">
            <span>Could not load your data: {loadError}</span>
            <span className="spacer" />
            <button className="btn" onClick={reload}>Retry</button>
          </div>
        )}
      </div>
    );
  }
  return <Shell record={record} />;
}

function Shell({ record }: { record: StudentRecord }) {
  const derived = useDerived(record);
  const { updateProfile, failures, dismissFailure, user, signOut } = useStore();
  const [showPassword, setShowPassword] = useState(false);
  const { program } = derived;
  const current = record.profile.currentSemester;
  const problems = derived.warnings.filter((w) => w.severity !== 'info').length;
  const missingChecks = derived.checklist.filter((i) => i.status === 'missing').length;
  const props: PageProps = { record, derived };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>🎓 HCMUS Progress</strong>
          <span>{program.meta.shortName}</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/courses">Courses</NavLink>
          <NavLink to="/planner">Planner {problems > 0 && <span className="count">{problems}</span>}</NavLink>
          <NavLink to="/next">What next</NavLink>
          <NavLink to="/checklist">Checklist {missingChecks > 0 && <span className="count">{missingChecks}</span>}</NavLink>
          <NavLink to="/data">Your data</NavLink>
          {user?.isAdmin && <NavLink to="/invites">Invites</NavLink>}
        </nav>
        <div className="sidebar-footer">
          <div className="account">
            <span className="who">{user?.displayName ?? user?.username}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={() => setShowPassword(true)}>Password</button>
              <button className="btn small" onClick={signOut}>Sign out</button>
            </div>
          </div>
          <ProgramPicker record={record} />
          <span>Current semester</span>
          <SemesterSelect program={program} value={current} onChange={(s) => updateProfile({ currentSemester: s })} ariaLabel="Current semester" />
          <span className="faint">{semesterLabel(program, current)} · in progress</span>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage {...props} />} />
          <Route path="/courses" element={<CoursesPage {...props} />} />
          <Route path="/planner" element={<PlannerPage {...props} />} />
          <Route path="/next" element={<NextPage {...props} />} />
          <Route path="/checklist" element={<ChecklistPage {...props} />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/invites" element={user?.isAdmin ? <InvitesPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <CourseDrawer record={record} derived={derived} />

      {showPassword && (
        <>
          <div className="drawer-backdrop" onClick={() => setShowPassword(false)} />
          <div className="modal">
            <ChangePassword onDone={() => setShowPassword(false)} />
          </div>
        </>
      )}

      {failures.length > 0 && (
        <div className="toasts" role="status">
          {failures.map((f) => (
            <div key={f.key} className="toast">
              <span style={{ flex: 1 }}><b>Not saved:</b> {f.label} <span className="faint">({f.message})</span></span>
              <button className="btn small" onClick={f.retry}>Retry</button>
              <button className="icon-btn" onClick={() => dismissFailure(f.key)} aria-label="Dismiss">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

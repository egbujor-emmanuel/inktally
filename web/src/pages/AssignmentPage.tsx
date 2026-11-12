import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { deleteAssignment, setAssignmentStatus, watchAssignment, watchSubmissions, type Assignment, type Submission } from '../data/store';
import { AnswerSheet } from '../components/AnswerSheet';
import { MarkTab } from './assignment/MarkTab';
import { ReviewTab } from './assignment/ReviewTab';
import { InsightsTab } from './assignment/InsightsTab';
import { RegisterTab } from './assignment/RegisterTab';
import { friendlyCloudError } from '../ai/errors';
import { useProfile } from '../data/profile';
import { useMarkingQueue } from '../hooks/useMarkingQueue';

const TABS = [
  { to: 'print', label: 'Print sheets' },
  { to: 'mark', label: 'Mark' },
  { to: 'review', label: 'Review' },
  { to: 'register', label: 'Mark register' },
  { to: 'insights', label: 'Insights' },
];

export function AssignmentPage() {
  const { id = '' } = useParams();
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const profile = useProfile();
  const queue = useMarkingQueue(assignment, submissions);

  useEffect(() => watchAssignment(id, setAssignment, (e) => setError(e.message)), [id]);
  useEffect(() => watchSubmissions(id, setSubmissions, (e) => setError(e.message)), [id]);

  if (error) return <p className="mt-10 text-pen" role="alert">{error}</p>;
  if (assignment === undefined) return <p className="mt-10 text-ink-soft">Loading…</p>;
  if (assignment === null) return <p className="mt-10">This assignment does not exist.</p>;

  async function handleDelete() {
    if (!assignment) return;
    if (!window.confirm(`Delete "${assignment.title}" and every student's marks for it? This cannot be undone.`)) return;
    try { await deleteAssignment(assignment.id); navigate('/'); } catch (e: unknown) { setError(friendlyCloudError(e).message); }
  }

  const markedCount = submissions.filter((s) => !s.queued).length;
  const toCheck = submissions.reduce((n, s) => n + s.marks.filter((m) => m.status === 'flagged' || m.status === 'provisional').length, 0);

  return (
    <div className="mt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-hand text-2xl text-pen">{assignment.className} · {assignment.scheme.subject}</p>
          <h1 className="font-display text-4xl font-bold">{assignment.title}</h1>
        </div>
        <div className="grid justify-items-end gap-2">
          <p className="text-ink-soft">{markedCount} student{markedCount === 1 ? '' : 's'} marked{toCheck > 0 && ` · ${toCheck} to check`}{queue.waiting.length > 0 && ` · ${queue.waiting.length} waiting`}</p>
          <div className="flex gap-2 text-sm">
            <button type="button" className="btn-ghost px-3 py-1 text-xs"
              onClick={() => setAssignmentStatus(assignment.id, (assignment.status ?? 'active') === 'active' ? 'finished' : 'active')}>
              {(assignment.status ?? 'active') === 'active' ? 'Mark as finished' : 'Reopen'}
            </button>
            <button type="button" className="px-3 py-1 text-xs text-pen underline" onClick={() => void handleDelete()}>Delete</button>
          </div>
        </div>
      </header>
      <nav className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[oklch(85%_0.02_85)]" aria-label="Assignment sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={`/a/${id}/${t.to}`}
            className={({ isActive }) => `-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-semibold ${isActive ? 'border-pen text-pen' : 'border-transparent text-ink-soft hover:text-ink'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-8">
        <Routes>
          <Route index element={<Navigate to="mark" replace />} />
          <Route path="print" element={
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn-pen" onClick={() => window.print()}>Print answer sheets</button>
                <p className="text-sm text-ink-soft">Print one per student. The black corner squares let REDPEN find every answer box, even offline.</p>
              </div>
              <AnswerSheet title={assignment.title} className={assignment.className} questions={assignment.scheme.questions} profile={profile} />
            </div>
          } />
          <Route path="mark" element={<MarkTab assignment={assignment} submissions={submissions} queue={queue} />} />
          <Route path="review" element={<ReviewTab assignment={assignment} submissions={submissions} />} />
          <Route path="register" element={<RegisterTab assignment={assignment} submissions={submissions} />} />
          <Route path="insights" element={<InsightsTab assignment={assignment} submissions={submissions} />} />
        </Routes>
      </div>
    </div>
  );
}

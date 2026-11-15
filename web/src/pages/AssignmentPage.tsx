import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { deleteAssignment, setAssignmentStatus, watchAssignment, watchSubmissions, type Assignment, type Submission } from '../data/store';
import { AnswerSheet } from '../components/AnswerSheet';
import { KeyTab } from './assignment/KeyTab';
import { MarkTab } from './assignment/MarkTab';
import { ReviewTab } from './assignment/ReviewTab';
import { InsightsTab } from './assignment/InsightsTab';
import { RegisterTab } from './assignment/RegisterTab';
import { friendlyCloudError } from '../ai/errors';
import { useProfile, type Profile } from '../data/profile';
import { Dialog, ErrorText, GhostButton, PenButton } from '../ui/Kit';
import { sheetsToPdf, shareOrDownload } from '../scan/sheetPdf';
import { useMarkingQueue } from '../hooks/useMarkingQueue';
import { useCloudCheck, type CloudCheckState } from '../hooks/useCloudCheck';

const TABS = [
  { to: 'print', label: 'Print sheets' },
  { to: 'key', label: 'Answer key' },
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const profile = useProfile();
  const queue = useMarkingQueue(assignment, submissions);
  const check = useCloudCheck(assignment, submissions);

  useEffect(() => watchAssignment(id, setAssignment, (e) => setError(e.message)), [id]);
  useEffect(() => watchSubmissions(id, setSubmissions, (e) => setError(e.message)), [id]);

  if (error) return <p className="mt-10 text-pen" role="alert">{error}</p>;
  if (assignment === undefined) return <p className="mt-10 text-ink-soft">Loading…</p>;
  if (assignment === null) return <p className="mt-10">This assignment does not exist.</p>;

  async function handleDelete() {
    if (!assignment) return;
    setConfirmDelete(false);
    try { await deleteAssignment(assignment.id); navigate('/'); } catch (e: unknown) { setError(friendlyCloudError(e).message); }
  }

  const markedCount = submissions.filter((s) => !s.queued).length;
  const toCheck = submissions.reduce((n, s) => n + s.marks.filter((m) => m.status === 'flagged' || m.status === 'provisional').length, 0);

  const finished = (assignment.status ?? 'active') === 'finished';

  return (
    <div className="grid">
      {confirmDelete && (
        <Dialog title={`Delete “${assignment.title}”?`} onClose={() => setConfirmDelete(false)} actions={<>
          <button type="button" className="btn-text" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button type="button" className="btn-text" onClick={() => void handleDelete()}>Delete for good</button>
        </>}>
          This deletes every student&apos;s marks for it and the photos on this device. It cannot be undone.
        </Dialog>
      )}
      {/* Same header as the Android AssignmentScreen. */}
      <header className="px-4 pt-3">
        <p className="font-hand text-xl text-pen">{[assignment.className, assignment.scheme.subject].filter((x) => x?.trim()).join(' · ')}</p>
        <h1 className="font-display text-2xl font-bold leading-7">{assignment.title}</h1>
        <div className="flex items-center">
          <p className="flex-1 text-[13px] text-ink-soft">
            {markedCount} student{markedCount === 1 ? '' : 's'} marked{toCheck > 0 && ` · ${toCheck} to check`}{queue.waiting.length > 0 && ` · ${queue.waiting.length} waiting`}
          </p>
          <button type="button" className="btn-text !text-[13px]" onClick={() => setAssignmentStatus(assignment.id, finished ? 'active' : 'finished')}>
            {finished ? 'Reopen' : 'Mark as finished'}
          </button>
          <button type="button" className="btn-text !text-[13px]" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
        <CheckStatus check={check} reviewHref={`/a/${id}/review`} />
        <ErrorText message={error} />
      </header>
      <nav className="tabs px-3" aria-label="Assignment sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={`/a/${id}/${t.to}`} className="tab">{t.label}</NavLink>
        ))}
      </nav>
      <div className="pt-3">
        <Routes>
          <Route index element={<Navigate to="mark" replace />} />
          <Route path="print" element={<PrintTab assignment={assignment} profile={profile} />} />
          <Route path="key" element={<KeyTab assignment={assignment} submissions={submissions} />} />
          <Route path="mark" element={<MarkTab assignment={assignment} submissions={submissions} queue={queue} />} />
          <Route path="review" element={<ReviewTab assignment={assignment} submissions={submissions} check={check} />} />
          <Route path="register" element={<RegisterTab assignment={assignment} submissions={submissions} />} />
          <Route path="insights" element={<InsightsTab assignment={assignment} submissions={submissions} />} />
        </Routes>
      </div>
    </div>
  );
}

/** The automatic cloud check, visible on every tab: "Cloud check: 8 on-device marks confirmed, 1 needs you." */
function CheckStatus({ check, reviewHref }: { check: CloudCheckState; reviewHref: string }) {
  const { progress, summary } = check;
  if (!progress && !summary) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 rounded-lg bg-white px-3 py-1.5 text-[13px]" role="status" aria-live="polite">
      <span aria-hidden className={`size-2 rounded-full ${progress ? 'animate-pulse bg-pen' : 'bg-[var(--color-ok,#2e7d32)]'}`} />
      {progress
        ? <span>Back online — the cloud is checking on-device marks ({progress.done}/{progress.total})…</span>
        : summary && <span>
            Cloud check: {summary.confirmed} on-device mark{summary.confirmed === 1 ? '' : 's'} confirmed
            {summary.needTeacher > 0 && <>, <NavLink to={reviewHref} className="font-semibold text-pen underline">{summary.needTeacher} need{summary.needTeacher === 1 ? 's' : ''} you</NavLink></>}.
            {summary.learned ? ` REDPEN learned ${summary.learned} device misread${summary.learned === 1 ? '' : 's'} to hold for checking.` : ''}
          </span>}
    </p>
  );
}

/** Printable answer sheets: Print or Share PDF, then a preview (same as the Android Print tab). */
function PrintTab({ assignment, profile }: { assignment: Assignment; profile: Profile }) {
  const sheets = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleShare() {
    setBusy(true); setError(null);
    try {
      const svgs = [...(sheets.current?.querySelectorAll<SVGSVGElement>('svg.sheet-page') ?? [])];
      const pdf = await sheetsToPdf(svgs);
      await shareOrDownload(pdf, `${assignment.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-answer-sheets.pdf`, `${assignment.title} — answer sheets`);
    } catch (e: unknown) {
      setError(`Could not make the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 px-4">
        <p className="text-sm text-ink-soft">Print one per student. The black corner squares let REDPEN find every answer box, even offline.</p>
        <div className="grid grid-cols-2 gap-2">
          <PenButton onClick={() => window.print()}>Print</PenButton>
          <GhostButton onClick={() => void handleShare()} disabled={busy}>{busy ? 'Making PDF…' : 'Share PDF'}</GhostButton>
        </div>
        <p className="text-[13px] text-ink-soft">No printer? Use “Exercise book page” in the Mark tab — students write in their own books.</p>
        {error && <p className="text-sm text-pen" role="alert">{error}</p>}
      </div>
      <div ref={sheets} className="px-4">
        <AnswerSheet title={assignment.title} className={assignment.className} questions={assignment.scheme.questions} profile={profile} />
      </div>
    </div>
  );
}

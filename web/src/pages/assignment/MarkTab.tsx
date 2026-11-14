import { useEffect, useMemo, useState } from 'react';
import type { Mark } from '../../domain/types';
import { MARKED_KEY, PAGE_KEY, PHOTO_KEY, createSubmission, deleteSubmission, newSubmissionId, saveCrop, type Assignment, type Submission } from '../../data/store';
import { layoutSheet } from '../../scan/layout';
import { MarkRow } from '../../components/MarkRow';
import { MarkedCopy } from '../../components/MarkedCopy';
import { PupilRecord } from '../../components/PupilRecord';
import { useProfile } from '../../data/profile';
import { friendlyCloudError } from '../../ai/errors';
import { canReadOffline } from '../../ai/models';
import { markSubmission, type CaptureMode } from '../../marking/markSubmission';
import type { QueueState } from '../../hooks/useMarkingQueue';
import { Card, Field, GhostButton, PenButton, PhotoButtons, Pill } from '../../ui/Kit';

type Props = { assignment: Assignment; submissions: Submission[]; queue: QueueState };

export { PAGE_KEY, MARKED_KEY };

type Phase =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'marking'; done: number; total: number }
  | { kind: 'done'; total: number; max: number }
  | { kind: 'queued'; pupil: string }
  | { kind: 'batch'; count: number }
  | { kind: 'error'; message: string };

export function MarkTab({ assignment, submissions, queue }: Props) {
  const profile = useProfile();
  const pages = useMemo(() => layoutSheet(assignment.scheme.questions), [assignment.scheme.questions]);
  const [pupil, setPupil] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<CaptureMode>('sheet');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [marks, setMarks] = useState<Mark[]>([]);
  const [crops, setCrops] = useState<Record<number, string>>({});
  const [copy, setCopy] = useState<{ blob: Blob; pupil: string; submissionId: string } | null>(null);
  const pageUrl = crops[PAGE_KEY];
  useEffect(() => () => { if (pageUrl) URL.revokeObjectURL(pageUrl); }, [pageUrl]);

  /** Several photos at once (gallery multi-select): each becomes a queued student, marked one by one in the background. */
  async function handleBatch(photos: File[]) {
    setMarks([]); setCrops({}); setCopy(null);
    const base = submissions.length;
    const startedAt = Date.now();
    try {
      for (const [i, photo] of photos.entries()) {
        const label = pupil.trim() ? `${pupil.trim()} ${i + 1}` : `Student ${base + i + 1}`;
        const submissionId = newSubmissionId(assignment.id);
        await saveCrop(submissionId, PHOTO_KEY, photo); // photo first, so the queue never sees a record without it
        await createSubmission(assignment.id, label, [], { mode, page: pageIndex }, submissionId, startedAt + i);
      }
      setPupil('');
      setPhase({ kind: 'batch', count: photos.length });
    } catch (e: unknown) {
      setPhase({ kind: 'error', message: friendlyCloudError(e).message });
    }
  }

  async function handlePhoto(photos: File[]) {
    if (photos.length > 1) { await handleBatch(photos); return; }
    const [photo] = photos;
    if (!photo) return;
    setMarks([]);
    setCrops(mode === 'page' ? { [PAGE_KEY]: URL.createObjectURL(photo) } : {});
    setCopy(null);
    const label = pupil.trim() || `Student ${submissions.length + 1}`;
    try {
      // No connection and no on-device AI: keep the photo on this device and mark it when the connection is back.
      if (!navigator.onLine && !canReadOffline()) {
        const submissionId = newSubmissionId(assignment.id);
        await saveCrop(submissionId, PHOTO_KEY, photo); // photo first, so the queue never sees a record without it
        await createSubmission(assignment.id, label, [], { mode, page: pageIndex }, submissionId);
        setPupil('');
        setPhase({ kind: 'queued', pupil: label });
        return;
      }
      setPhase({ kind: 'scanning' });
      const submissionId = await createSubmission(assignment.id, label, []);
      const outcome = await markSubmission(assignment, mode, photo, pageIndex, submissionId, label, (p) => {
        if (p.crops) setCrops(p.crops);
        setMarks(p.marks);
        setPhase({ kind: 'marking', done: p.marks.length, total: p.total });
      });
      if (!outcome.ok) { await deleteSubmission(assignment.id, submissionId); setPhase({ kind: 'error', message: outcome.reason }); return; }
      setMarks(outcome.marks);
      setPhase({ kind: 'done', total: outcome.marks.reduce((a, m) => a + m.awarded, 0), max: outcome.marks.reduce((a, m) => a + m.max, 0) });
      setPupil('');
      if (outcome.copy) setCopy({ blob: outcome.copy, pupil: label, submissionId });
    } catch (e: unknown) {
      setPhase({ kind: 'error', message: friendlyCloudError(e).message });
    }
  }

  const busy = phase.kind === 'scanning' || phase.kind === 'marking';

  return (
    <div className="grid gap-3 pb-10">
      <div className="grid gap-1.5 px-4" role="radiogroup" aria-label="What are you photographing?">
        <ModeOption selected={mode === 'sheet'} title="Printed REDPEN sheet" subtitle="Names never leave the device · works fully offline" onSelect={() => setMode('sheet')} />
        <ModeOption selected={mode === 'page'} title="Exercise book page" subtitle="No printer needed · best when online" onSelect={() => setMode('page')} />
      </div>
      <Card>
        <Field label="Student name or number" value={pupil} onChange={setPupil} placeholder="e.g. Ada O. or 14" disabled={busy} maxLength={80} />
        {mode === 'sheet' && pages.length > 1 && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Sheet page">
            <span className="pr-1">Sheet page:</span>
            {pages.map((p, i) => i === pageIndex
              ? <PenButton key={p.page}>{p.page}</PenButton>
              : <GhostButton key={p.page} onClick={() => setPageIndex(i)}>{p.page}</GhostButton>)}
          </div>
        )}
        <PhotoButtons takeLabel={busy ? 'Marking…' : mode === 'sheet' ? 'Photograph answer sheet' : 'Photograph the page'}
          onPhoto={(files) => void handlePhoto(files)} disabled={busy} multiple />
        <p className="text-[13px] text-ink-soft">{mode === 'sheet' ? 'Keep all four black corner squares in the photo.' : 'Make sure every question number and answer is visible.'} Got a whole stack? Choose all the photos at once.</p>
      </Card>

      <div aria-live="polite">
        {phase.kind === 'scanning' && <p className="px-4 font-hand text-2xl font-bold text-ink-soft">{mode === 'sheet' ? 'Finding the answer boxes…' : 'Reading the page…'}</p>}
        {phase.kind === 'marking' && <p className="px-4 font-hand text-2xl font-bold text-ink-soft">Marking {Math.min(phase.done + 1, phase.total)} of {phase.total}…</p>}
        {phase.kind === 'done' && <p className="px-4 font-display text-[30px] font-bold">Total: {phase.total}/{phase.max}</p>}
        {phase.kind === 'error' && <p className="px-4 text-pen" role="alert">{phase.message}</p>}
      </div>
      {phase.kind === 'queued' && (
        <Card flag>
          <p className="font-display text-xl font-bold" role="status">Saved for marking: {phase.pupil}</p>
          <p className="text-sm text-ink-soft">
            You’re offline and this device can’t read handwriting without a connection. The photo stays on this device and REDPEN marks it
            automatically as soon as you’re back online. Keep photographing the rest of the class.
          </p>
        </Card>
      )}
      {phase.kind === 'batch' && (
        <Card flag>
          <p className="font-display text-xl font-bold" role="status">{phase.count} scripts added</p>
          <p className="text-sm text-ink-soft">
            REDPEN is marking them one by one below. You can keep photographing, and rename students in the Mark register afterwards.
          </p>
        </Card>
      )}
      {queue.waiting.length > 0 && <QueuePanel queue={queue} />}

      {copy && (() => {
        const record = submissions.find((x) => x.id === copy.submissionId);
        return record
          ? <PupilRecord assignment={assignment} submission={record} profile={profile} copy={copy.blob} />
          : <MarkedCopy blob={copy.blob} pupil={copy.pupil} />;
      })()}

      {crops[PAGE_KEY] && marks.length > 0 && (
        <img src={crops[PAGE_KEY]} alt="The exercise book page that was marked" className="mx-4 max-h-[260px] object-contain" />
      )}
      {marks.length > 0 && <ol className="grid gap-3 px-4">{marks.map((m, i) => <MarkRow key={m.q} mark={m} cropUrl={crops[m.q]} index={i} />)}</ol>}
    </div>
  );
}

/** Radio row, as on the Android Mark tab. */
function ModeOption({ selected, title, subtitle, onSelect }: { selected: boolean; title: string; subtitle: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className={`flex items-center gap-3 rounded-xl p-2 text-left ${selected ? 'bg-paper' : 'bg-white'}`}>
      <span aria-hidden className="grid size-5 flex-none place-items-center rounded-full border-2 border-pen">
        {selected && <span className="size-2.5 rounded-full bg-pen" />}
      </span>
      <span className="grid"><span className="font-semibold">{title}</span><span className="text-xs text-ink-soft">{subtitle}</span></span>
    </button>
  );
}

function QueuePanel({ queue }: { queue: QueueState }) {
  return (
    <Card labelledBy="queue-title">
      <h2 id="queue-title" className="font-display text-xl font-bold">{queue.waiting.length} waiting to be marked</h2>
      <p className="text-sm text-ink-soft" aria-live="polite">
        {queue.current ? `Marking ${queue.current.pupil} now…` : navigator.onLine || canReadOffline() ? 'Starting…' : 'They will be marked automatically when you’re back online.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {queue.waiting.map((s) => <Pill key={s.id} color={queue.current?.id === s.id ? 'var(--color-pen)' : 'var(--color-ink-soft)'}>{s.pupil}</Pill>)}
      </div>
      {queue.error && <p className="text-sm text-pen" role="alert">Could not mark {queue.error}. It stays in the queue.</p>}
    </Card>
  );
}

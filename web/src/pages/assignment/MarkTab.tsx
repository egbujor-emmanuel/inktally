import { useMemo, useState, type ChangeEvent } from 'react';
import type { Mark } from '../../domain/types';
import { MARKED_KEY, PAGE_KEY, PHOTO_KEY, createSubmission, saveCrop, type Assignment, type Submission } from '../../data/store';
import { layoutSheet } from '../../scan/layout';
import { MarkRow } from '../../components/MarkRow';
import { MarkedCopy } from '../../components/MarkedCopy';
import { PupilRecord } from '../../components/PupilRecord';
import { useProfile } from '../../data/profile';
import { friendlyCloudError } from '../../ai/errors';
import { canReadOffline } from '../../ai/models';
import { markSubmission, type CaptureMode } from '../../marking/markSubmission';
import type { QueueState } from '../../hooks/useMarkingQueue';

type Props = { assignment: Assignment; submissions: Submission[]; queue: QueueState };

export { PAGE_KEY, MARKED_KEY };

type Phase =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'marking'; done: number; total: number }
  | { kind: 'done'; total: number; max: number }
  | { kind: 'queued'; pupil: string }
  | { kind: 'error'; message: string };

const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

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

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = '';
    if (!photo) return;
    setMarks([]);
    setCrops(mode === 'page' ? { [PAGE_KEY]: URL.createObjectURL(photo) } : {});
    setCopy(null);
    const label = pupil.trim() || `Student ${new Date().toLocaleTimeString()}`;
    try {
      // No connection and no on-device AI: keep the photo on this device and mark it when the connection is back.
      if (!navigator.onLine && !canReadOffline()) {
        const submissionId = await createSubmission(assignment.id, label, [], { mode, page: pageIndex });
        await saveCrop(submissionId, PHOTO_KEY, photo);
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
      if (!outcome.ok) { setPhase({ kind: 'error', message: outcome.reason }); return; }
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
    <div className="grid gap-8">
      <div role="radiogroup" aria-label="What are you photographing?" className="flex flex-wrap gap-2">
        {([['sheet', 'Printed REDPEN sheet', 'Names never leave the device · works fully offline'], ['page', 'Exercise book page', 'No printer needed · best when online']] as const).map(([value, title, note]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
            className={`paper-card border-2 px-4 py-3 text-left transition ${mode === value ? '!border-pen bg-white' : 'opacity-70 hover:opacity-100'}`}>
            <span className="flex items-center gap-2 font-semibold"><span aria-hidden className={`size-3 rounded-full border-2 border-pen ${mode === value ? 'bg-pen' : ''}`} />{title}</span><span className="text-xs text-ink-soft">{note}</span>
          </button>
        ))}
      </div>
      <section className="paper-card grid gap-4 p-6 sm:grid-cols-[1fr_auto_auto] sm:items-end" aria-label="Mark a student">
        <label className="text-sm font-medium">Student name or number
          <input className={field} value={pupil} onChange={(e) => setPupil(e.target.value)} placeholder="e.g. Ada O. or 14" disabled={busy} />
        </label>
        {mode === 'sheet' && pages.length > 1 && (
          <label className="text-sm font-medium">Sheet page
            <select className={field} value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))} disabled={busy}>
              {pages.map((p, i) => <option key={p.page} value={i}>Page {p.page}</option>)}
            </select>
          </label>
        )}
        <label className={`btn-pen cursor-pointer text-center ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          {busy ? 'Marking…' : mode === 'sheet' ? 'Photograph answer sheet' : 'Photograph exercise book page'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void handlePhoto(e)} disabled={busy} />
        </label>
      </section>

      <div aria-live="polite">
        {phase.kind === 'scanning' && <p className="font-hand text-3xl text-ink-soft">{mode === 'sheet' ? 'Finding the answer boxes…' : 'Reading the page…'}</p>}
        {phase.kind === 'marking' && <p className="font-hand text-3xl text-ink-soft">Marking {phase.done} of {phase.total}…</p>}
        {phase.kind === 'done' && <p className="font-display text-3xl font-bold">Total: <span className="font-hand text-5xl text-pen">{phase.total}/{phase.max}</span></p>}
        {phase.kind === 'queued' && (
          <div className="paper-card border-2 !border-flag p-4" role="status">
            <p className="font-display text-xl font-bold">Saved for marking: {phase.pupil}</p>
            <p className="text-ink-soft">
              You’re offline and this device can’t read handwriting without a connection. The photo stays on this device and
              REDPEN marks it automatically as soon as you’re back online. Keep photographing the rest of the class.
            </p>
          </div>
        )}
        {phase.kind === 'error' && <p className="text-pen" role="alert">{phase.message}</p>}
      </div>

      {queue.waiting.length > 0 && <QueuePanel queue={queue} />}

      {copy && (() => {
        const record = submissions.find((x) => x.id === copy.submissionId);
        return record
          ? <PupilRecord assignment={assignment} submission={record} profile={profile} copy={copy.blob} />
          : <MarkedCopy blob={copy.blob} pupil={copy.pupil} />;
      })()}

      {marks.length > 0 && (
        <div className={crops[PAGE_KEY] ? 'grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start' : ''}>
          {crops[PAGE_KEY] && (
            <figure className="paper-card overflow-hidden p-2 lg:sticky lg:top-36">
              <img src={crops[PAGE_KEY]} alt="The exercise book page that was marked" className="w-full rounded-md" />
              <figcaption className="p-2 text-xs text-ink-soft">Kept on this device</figcaption>
            </figure>
          )}
          <ol className="grid gap-3">
            {marks.map((m, i) => <MarkRow key={m.q} mark={m} cropUrl={crops[m.q]} index={i} />)}
          </ol>
        </div>
      )}
    </div>
  );
}

function QueuePanel({ queue }: { queue: QueueState }) {
  return (
    <section className="paper-card grid gap-2 p-5" aria-labelledby="queue-title">
      <h2 id="queue-title" className="font-display text-xl font-bold">
        {queue.waiting.length} waiting to be marked
      </h2>
      <p className="text-ink-soft" aria-live="polite">
        {queue.current ? `Marking ${queue.current.pupil} now…` : navigator.onLine ? 'Starting…' : 'They will be marked automatically when you’re back online.'}
      </p>
      <ul className="flex flex-wrap gap-2">
        {queue.waiting.map((s) => (
          <li key={s.id} className={`rounded-full border px-3 py-1 text-sm ${queue.current?.id === s.id ? 'border-pen text-pen' : 'border-[oklch(85%_0.02_85)]'}`}>{s.pupil}</li>
        ))}
      </ul>
      {queue.error && <p className="text-sm text-pen" role="alert">Could not mark {queue.error}. It stays in the queue.</p>}
    </section>
  );
}

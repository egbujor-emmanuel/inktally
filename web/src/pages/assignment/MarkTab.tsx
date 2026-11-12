import { useMemo, useState, type ChangeEvent } from 'react';
import type { Mark } from '../../domain/types';
import { MARKED_KEY, PAGE_KEY, createSubmission, saveCrop, saveMarks, type Assignment, type Submission } from '../../data/store';
import { markAnswer, markPage } from '../../marking/markAnswer';
import { layoutSheet } from '../../scan/layout';
import { scanSheet } from '../../scan/pipeline';
import { MarkRow } from '../../components/MarkRow';
import { MarkedCopy } from '../../components/MarkedCopy';
import { PupilRecord } from '../../components/PupilRecord';
import { useProfile } from '../../data/profile';
import { markedPageCopy, markedSheetCopy } from '../../scan/markedCopy';
import { friendlyCloudError } from '../../ai/errors';

type Props = { assignment: Assignment; submissions: Submission[] };

type SheetMode = 'sheet' | 'page';

export { PAGE_KEY, MARKED_KEY };

type Phase =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'marking'; done: number; total: number }
  | { kind: 'done'; total: number; max: number }
  | { kind: 'error'; message: string };

const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

function failedMark(q: number, max: number, error: unknown): Mark {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    q, max, read: '', readSource: 'on_device', awarded: 0, engine: 'code', status: 'flagged',
    reasons: [`Could not read this answer (${message}). Check it by hand or retry when online.`],
  };
}

export function MarkTab({ assignment, submissions }: Props) {
  const profile = useProfile();
  const pages = useMemo(() => layoutSheet(assignment.scheme.questions), [assignment.scheme.questions]);
  const [pupil, setPupil] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<SheetMode>('sheet');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [marks, setMarks] = useState<Mark[]>([]);
  const [crops, setCrops] = useState<Record<number, string>>({});
  const [copy, setCopy] = useState<{ blob: Blob; pupil: string; submissionId: string } | null>(null);

  /** Builds the marked copy (best effort: marking already succeeded if this fails). */
  async function makeCopy(submissionId: string, label: string, build: () => Promise<Blob>) {
    try {
      const blob = await build();
      await saveCrop(submissionId, MARKED_KEY, blob);
      setCopy({ blob, pupil: label, submissionId });
    } catch { /* the marks are saved; the copy can be regenerated later */ }
  }

  async function markExercisePage(photo: File) {
    setCrops({ [PAGE_KEY]: URL.createObjectURL(photo) });
    const label = pupil.trim() || `Student ${new Date().toLocaleTimeString()}`;
    const submissionId = await createSubmission(assignment.id, label, []);
    await saveCrop(submissionId, PAGE_KEY, photo);
    setPhase({ kind: 'marking', done: 0, total: assignment.scheme.questions.length });
    const collected = await markPage(assignment.scheme.questions, photo);
    setMarks(collected);
    await saveMarks(assignment.id, submissionId, collected);
    setPhase({ kind: 'done', total: collected.reduce((a, m) => a + m.awarded, 0), max: collected.reduce((a, m) => a + m.max, 0) });
    setPupil('');
    await makeCopy(submissionId, label, () => markedPageCopy(photo, collected, label));
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = '';
    if (!photo) return;
    setMarks([]);
    setCrops({});
    setCopy(null);
    setPhase({ kind: 'scanning' });
    try {
      if (mode === 'page') { await markExercisePage(photo); return; }
      const page = pages[pageIndex];
      const scan = await scanSheet(photo, page.boxes);
      if (!scan.ok) { setPhase({ kind: 'error', message: scan.reason }); return; }
      setCrops(Object.fromEntries(scan.crops.map((c) => [c.q, c.dataUrl])));

      const label = pupil.trim() || `Student ${new Date().toLocaleTimeString()}`;
      const submissionId = await createSubmission(assignment.id, label, []);
      const collected: Mark[] = [];
      setPhase({ kind: 'marking', done: 0, total: scan.crops.length });
      for (const crop of scan.crops) {
        const question = assignment.scheme.questions.find((q) => q.q === crop.q);
        if (!question) continue;
        await saveCrop(submissionId, crop.q, crop.blob);
        let mark: Mark;
        try { mark = await markAnswer(question, crop.blob); } catch (e: unknown) { mark = failedMark(question.q, question.max, e); }
        collected.push(mark);
        setMarks([...collected]);
        setPhase({ kind: 'marking', done: collected.length, total: scan.crops.length });
        await saveMarks(assignment.id, submissionId, collected);
      }
      setPhase({ kind: 'done', total: collected.reduce((a, m) => a + m.awarded, 0), max: collected.reduce((a, m) => a + m.max, 0) });
      setPupil('');
      await makeCopy(submissionId, label, () => markedSheetCopy(photo, scan.sheetToPhoto, page.boxes, collected, label));
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
        {phase.kind === 'error' && <p className="text-pen" role="alert">{phase.message}</p>}
      </div>

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

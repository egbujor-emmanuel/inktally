import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { draftScheme } from '../ai/scheme';
import { createAssignment, createSubmission, saveCrop, saveMarks } from '../data/store';
import type { Mark, Question } from '../domain/types';
import { markPage } from '../marking/markAnswer';
import { PAGE_KEY } from './assignment/MarkTab';
import { SchemeEditor } from '../components/SchemeEditor';
import { MarkRow } from '../components/MarkRow';
import { useOnline } from '../hooks/useStatus';
import { ALL_LEVELS } from '../domain/levels';

const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

type Step =
  | { kind: 'snap' }
  | { kind: 'drafting' }
  | { kind: 'confirm'; questions: Question[] }
  | { kind: 'marking' }
  | { kind: 'done'; assignmentId: string; marks: Mark[] };

/**
 * Quick mark: one photo of a pupil's page (questions visible) -> the cloud drafts the answer key from the
 * QUESTIONS -> the teacher confirms it in seconds -> code marks the page. The key is saved for the rest of the class.
 */
export function QuickMark() {
  const isOnline = useOnline();
  const [subject, setSubject] = useState('Mathematics');
  const [level, setLevel] = useState('Grade 6');
  const [pupil, setPupil] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'snap' });
  const [error, setError] = useState<string | null>(null);

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setError(null);
    setStep({ kind: 'drafting' });
    try {
      const scheme = await draftScheme({ images: [file], isPupilPage: true }, subject, level);
      if (!scheme.questions.length) throw new Error('No questions could be found on that page. Make sure the questions are visible.');
      setStep({ kind: 'confirm', questions: scheme.questions });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not work out the answers');
      setStep({ kind: 'snap' });
    }
  }

  async function handleConfirm(questions: Question[]) {
    if (!photo) return;
    setStep({ kind: 'marking' });
    try {
      const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const assignmentId = await createAssignment({ title: `Quick mark — ${subject}, ${today}`, className: level, scheme: { subject, level, questions } });
      const submissionId = await createSubmission(assignmentId, pupil.trim() || 'Pupil', []);
      await saveCrop(submissionId, PAGE_KEY, photo);
      const marks = await markPage(questions, photo);
      await saveMarks(assignmentId, submissionId, marks);
      setStep({ kind: 'done', assignmentId, marks });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not mark the page');
      setStep({ kind: 'confirm', questions });
    }
  }

  const total = step.kind === 'done' ? step.marks.reduce((a, m) => a + m.awarded, 0) : 0;
  const max = step.kind === 'done' ? step.marks.reduce((a, m) => a + m.max, 0) : 0;

  return (
    <div className="mt-10 grid gap-8">
      <header>
        <p className="font-hand text-2xl text-pen">no preparation needed</p>
        <h1 className="font-display text-4xl font-bold">Quick mark</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">Photograph one pupil’s page with the questions on it. REDPEN works out the answers from the questions,
          you check them in seconds, then it marks the page. The answer key is saved so you can mark the rest of the class.</p>
      </header>

      {step.kind === 'snap' && (
        <section className="paper-card grid gap-4 p-6 sm:grid-cols-4 sm:items-end" aria-label="Photograph a page">
          <label className="text-sm font-medium">Subject<input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="text-sm font-medium">Class / level
            <input className={field} value={level} onChange={(e) => setLevel(e.target.value)} list="redpen-levels" placeholder="e.g. Grade 5, Year 7, JSS 2" />
            <datalist id="redpen-levels">{ALL_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="text-sm font-medium">Pupil<input className={field} value={pupil} onChange={(e) => setPupil(e.target.value)} placeholder="Name or number" /></label>
          <label className={`btn-pen cursor-pointer text-center ${isOnline ? '' : 'pointer-events-none opacity-50'}`}>
            {isOnline ? 'Photograph the page' : 'Quick mark needs internet'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void handlePhoto(e)} disabled={!isOnline} />
          </label>
        </section>
      )}

      {error && <p className="text-pen" role="alert">{error}</p>}

      {photoUrl && step.kind !== 'snap' && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
          <figure className="paper-card overflow-hidden p-2 lg:sticky lg:top-36">
            <img src={photoUrl} alt="The pupil's page" className="w-full rounded-md" />
          </figure>
          <div className="grid gap-4" aria-live="polite">
            {step.kind === 'drafting' && <p className="font-hand text-3xl text-ink-soft">Working out the answers from the questions…</p>}
            {step.kind === 'confirm' && (
              <ConfirmKey initial={step.questions} onConfirm={(q) => void handleConfirm(q)} />
            )}
            {step.kind === 'marking' && <p className="font-hand text-3xl text-ink-soft">Marking the page…</p>}
            {step.kind === 'done' && (
              <>
                <p className="font-display text-3xl font-bold">Total: <span className="font-hand text-5xl text-pen">{total}/{max}</span></p>
                <ol className="grid gap-3">{step.marks.map((m, i) => <MarkRow key={m.q} mark={m} index={i} />)}</ol>
                <div className="flex flex-wrap gap-3">
                  <Link to={`/a/${step.assignmentId}/mark`} className="btn-pen">Mark the rest of the class with this key</Link>
                  <button type="button" className="btn-ghost" onClick={() => { setStep({ kind: 'snap' }); setPhotoUrl(null); setPupil(''); }}>Quick mark another page</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmKey({ initial, onConfirm }: { initial: Question[]; onConfirm: (q: Question[]) => void }) {
  const [questions, setQuestions] = useState(initial);
  return (
    <section className="grid gap-4" aria-labelledby="key">
      <div className="paper-card border-2 !border-flag p-4">
        <h2 id="key" className="font-display text-2xl font-bold">Does this answer key look right?</h2>
        <p className="text-ink-soft">REDPEN worked these answers out from the questions. Every mark depends on them, so fix anything that is wrong.</p>
      </div>
      <SchemeEditor questions={questions} onChange={setQuestions} />
      <button type="button" className="btn-pen justify-self-start" disabled={!questions.length} onClick={() => onConfirm(questions)}>Looks right — mark it</button>
    </section>
  );
}

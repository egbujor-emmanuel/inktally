import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { draftScheme } from '../ai/scheme';
import { PAGE_KEY, createAssignment, createSubmission, saveCrop, saveMarks } from '../data/store';
import type { Mark, Question } from '../domain/types';
import { markPage } from '../marking/markAnswer';
import { SchemeEditor, isComplete } from '../components/SchemeEditor';
import { MarkRow } from '../components/MarkRow';
import { useOnline } from '../hooks/useStatus';
import { friendlyCloudError } from '../ai/errors';
import { ensureUser } from '../firebase/app';
import { Busy, Card, ErrorText, Field, GhostButton, LevelField, PageTitle, PenButton, PhotoButtons } from '../ui/Kit';

type Step =
  | { kind: 'snap' }
  | { kind: 'drafting' }
  | { kind: 'confirm'; questions: Question[] }
  | { kind: 'marking' }
  | { kind: 'done'; assignmentId: string; marks: Mark[] };

/**
 * Quick mark (same screen as the Android QuickMarkScreen): one photo of a student's page with the questions on it ->
 * the cloud drafts the answer key from the QUESTIONS -> the teacher confirms -> code marks the page.
 */
export function QuickMark() {
  const isOnline = useOnline();
  const navigate = useNavigate();
  const [subject, setSubject] = useState('Mathematics');
  const [level, setLevel] = useState('Grade 6');
  const [pupil, setPupil] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'snap' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  async function handlePhoto([file]: File[]) {
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
    setError(null);
    setStep({ kind: 'drafting' });
    try {
      const scheme = await draftScheme({ images: [file], isPupilPage: true }, subject, level);
      if (!scheme.questions.length) throw new Error('No questions could be found on that page. Make sure the questions are visible.');
      setStep({ kind: 'confirm', questions: scheme.questions });
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
      setStep({ kind: 'snap' });
    }
  }

  async function handleConfirm(questions: Question[]) {
    if (!photo) return;
    const usable = questions.filter(isComplete);
    if (!usable.length) { setError('Add at least one question with an answer.'); return; }
    setStep({ kind: 'marking' });
    try {
      await ensureUser(); // the form shows before sign-in finishes; saving waits for it
      const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const assignmentId = await createAssignment({ title: `Quick mark — ${subject}, ${today}`, className: level, scheme: { subject, level, questions: usable } });
      const submissionId = await createSubmission(assignmentId, pupil.trim() || 'Student', []);
      await saveCrop(submissionId, PAGE_KEY, photo);
      const marks = await markPage(usable, photo);
      await saveMarks(assignmentId, submissionId, marks);
      setStep({ kind: 'done', assignmentId, marks });
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
      setStep({ kind: 'confirm', questions });
    }
  }

  const total = step.kind === 'done' ? step.marks.reduce((a, m) => a + m.awarded, 0) : 0;
  const max = step.kind === 'done' ? step.marks.reduce((a, m) => a + m.max, 0) : 0;

  return (
    <div className="grid gap-[14px] pb-10">
      <PageTitle eyebrow="no preparation needed" title="Quick mark"
        intro="Photograph one student’s page with the questions on it. REDPEN works out the answers from the questions, you check them in seconds, then it marks the page. The answer key is saved so you can mark the rest of the class." />
      {step.kind === 'snap' && (
        <Card>
          <Field label="Subject" value={subject} onChange={setSubject} />
          <LevelField level={level} onChange={setLevel} />
          <Field label="Student" value={pupil} onChange={setPupil} placeholder="Name or number" />
          {isOnline
            ? <PhotoButtons takeLabel="Photograph the page" onPhoto={(f) => void handlePhoto(f)} />
            : <p className="text-pen">Quick mark needs internet (the cloud writes the answer key).</p>}
        </Card>
      )}
      <ErrorText message={error} />
      {photoUrl && step.kind !== 'snap' && (
        <img src={photoUrl} alt="The student's page" className="mx-4 max-h-[260px] object-contain" />
      )}
      {step.kind === 'drafting' && <Busy>Working out the answers from the questions…</Busy>}
      {step.kind === 'confirm' && <ConfirmKey initial={step.questions} onConfirm={(q) => void handleConfirm(q)} />}
      {step.kind === 'marking' && <Busy>Marking the page…</Busy>}
      {step.kind === 'done' && (
        <>
          <p className="px-4 font-display text-[30px] font-bold">Total: {total}/{max}</p>
          <ol className="grid gap-3 px-4">{step.marks.map((m, i) => <MarkRow key={m.q} mark={m} index={i} />)}</ol>
          <div className="grid gap-2 px-4">
            <PenButton onClick={() => navigate(`/a/${step.assignmentId}/mark`)}>Mark the rest of the class with this key</PenButton>
            <GhostButton onClick={() => { setStep({ kind: 'snap' }); setPhotoUrl(null); setPupil(''); }}>Quick mark another page</GhostButton>
          </div>
        </>
      )}
    </div>
  );
}

function ConfirmKey({ initial, onConfirm }: { initial: Question[]; onConfirm: (q: Question[]) => void }) {
  const [questions, setQuestions] = useState(initial);
  return (
    <div className="grid gap-3">
      <Card flag>
        <h2 className="font-display text-[22px] font-bold">Does this answer key look right?</h2>
        <p className="text-sm text-ink-soft">REDPEN worked these answers out from the questions. Every mark depends on them, so fix anything that is wrong.</p>
      </Card>
      <SchemeEditor questions={questions} onChange={setQuestions} />
      <div className="px-4"><PenButton className="w-full" disabled={!questions.length} onClick={() => onConfirm(questions)}>Looks right — mark it</PenButton></div>
    </div>
  );
}

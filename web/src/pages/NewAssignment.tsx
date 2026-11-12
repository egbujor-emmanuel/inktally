import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { draftScheme } from '../ai/scheme';
import { createAssignment } from '../data/store';
import type { Question } from '../domain/types';
import { SchemeEditor, isComplete } from '../components/SchemeEditor';
import { useOnline } from '../hooks/useStatus';
import { friendlyCloudError } from '../ai/errors';
import { Busy, Card, ErrorText, Field, GhostButton, LevelField, PageTitle, PenButton } from '../ui/Kit';

const MAX_PDF_BYTES = 15_000_000;

/** Take photo / Photos / PDF + thumbnails + typed text — one "source" card, used twice (question paper, own scheme). */
function SourceInputs({ name, photos, setPhotos, pdf, setPdf, text, setText, textLabel, textPlaceholder, onError }: {
  name: string; photos: File[]; setPhotos: (f: File[]) => void; pdf: File | null; setPdf: (f: File | null) => void;
  text: string; setText: (t: string) => void; textLabel: string; textPlaceholder: string; onError: (m: string) => void;
}) {
  const take = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => { setPhotos([...photos, ...Array.from(e.target.files ?? [])]); e.target.value = ''; };
  const addPdf = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > MAX_PDF_BYTES) onError('That PDF is over 15 MB — photograph the pages instead.'); else setPdf(f);
  };
  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-2">
        <button type="button" className="btn-pen" onClick={() => take.current?.click()}>Take photo</button>
        <button type="button" className="btn-ghost" onClick={() => gallery.current?.click()}>Photos</button>
        <button type="button" className="btn-ghost" onClick={() => pdfInput.current?.click()}>PDF</button>
        <input ref={take} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={`${name}: take photo`} onChange={addPhotos} />
        <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label={`${name}: photos`} onChange={addPhotos} />
        <input ref={pdfInput} type="file" accept="application/pdf" className="sr-only" tabIndex={-1} aria-label={`${name}: PDF`} onChange={addPdf} />
      </div>
      {photos.length > 0 && (
        <div className="hscroll gap-2">
          {photos.map((f, i) => (
            <figure key={`${f.name}-${i}`} className="grid flex-none justify-items-center">
              <img src={URL.createObjectURL(f)} alt={`${name} page ${i + 1}`} className="h-[120px] w-[90px] object-cover" />
              <button type="button" className="btn-text !text-xs" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>Remove</button>
            </figure>
          ))}
        </div>
      )}
      {pdf && (
        <div className="flex items-center"><span className="flex-1 text-sm">PDF: {pdf.name}</span><button type="button" className="btn-text" onClick={() => setPdf(null)}>Remove</button></div>
      )}
      <Field label={textLabel} value={text} onChange={setText} placeholder={textPlaceholder} multiline rows={4} maxLength={20000} />
    </>
  );
}

/** Same screen as the Android NewAssignmentScreen. */
export function NewAssignment() {
  const navigate = useNavigate();
  const isOnline = useOnline();
  const [title, setTitle] = useState('');
  const [className, setClassName] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [level, setLevel] = useState('Grade 6');
  const [paperPhotos, setPaperPhotos] = useState<File[]>([]);
  const [paperPdf, setPaperPdf] = useState<File | null>(null);
  const [paperText, setPaperText] = useState('');
  const [guidePhotos, setGuidePhotos] = useState<File[]>([]);
  const [guidePdf, setGuidePdf] = useState<File | null>(null);
  const [guideText, setGuideText] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasGuide = guidePhotos.length > 0 || guidePdf !== null || guideText.trim() !== '';
  const hasPaper = paperPhotos.length > 0 || paperPdf !== null || paperText.trim() !== '';

  async function handleDraft() {
    setError(null);
    setDrafting(true);
    try {
      const scheme = await draftScheme({
        images: paperPhotos, pdf: paperPdf ?? undefined, text: paperText || undefined,
        guideImages: guidePhotos, guidePdf: guidePdf ?? undefined, guideText: guideText || undefined,
      }, subject, level);
      setQuestions(scheme.questions);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    const usable = questions.filter(isComplete);
    if (!usable.length) { setError('Add at least one question with an answer.'); return; }
    try {
      const id = await createAssignment({ title: title || `${subject} — ${level}`, className: className || level, scheme: { subject, level, questions: usable } });
      navigate(`/a/${id}/print`);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    }
  }

  const draftLabel = drafting ? 'Reading…' : !isOnline ? 'Drafting needs internet' : hasGuide ? 'Use my marking scheme' : 'Draft marking scheme';

  return (
    <div className="grid gap-[14px] pb-10">
      <PageTitle eyebrow="step 1" title="New assignment"
        intro="Give REDPEN the question paper and it works out the answer key — or give it your own marking scheme and it copies it exactly. Only these go to the cloud, never students’ work, and you check everything before marking." />
      <Card>
        <Field label="Title" value={title} onChange={setTitle} placeholder="Fractions quiz" />
        <Field label="Class / group" value={className} onChange={setClassName} placeholder="e.g. Primary 6A, Biology 101 group B" />
        <Field label="Subject" value={subject} onChange={setSubject} />
        <LevelField level={level} onChange={setLevel} />
      </Card>
      <Card labelledBy="paper-title">
        <h2 id="paper-title" className="font-display text-[22px]">The question paper</h2>
        <p className="text-sm text-ink-soft">Photos of the paper, a PDF, or type the questions. Only the questions go to the cloud.</p>
        <SourceInputs name="Question paper" photos={paperPhotos} setPhotos={setPaperPhotos} pdf={paperPdf} setPdf={setPaperPdf}
          text={paperText} setText={setPaperText} textLabel="…or type / paste the questions"
          textPlaceholder={'1. 7 × 8 = ?\n2. State two functions of blood. (2 marks)'} onError={setError} />
      </Card>
      <Card labelledBy="guide-title">
        <h2 id="guide-title" className="font-display text-[22px]">Already have a marking scheme?</h2>
        <p className="text-sm text-ink-soft">Optional. Give REDPEN your own marking scheme or answer key and it copies your answers and marks exactly — it never changes them.</p>
        <SourceInputs name="Marking scheme" photos={guidePhotos} setPhotos={setGuidePhotos} pdf={guidePdf} setPdf={setGuidePdf}
          text={guideText} setText={setGuideText} textLabel="…or type / paste your marking scheme"
          textPlaceholder={'1. 56 (1 mark)\n2. Abuja — accept FCT (1 mark)'} onError={setError} />
      </Card>
      <div className="px-4">
        <PenButton className="w-full" disabled={!isOnline || drafting || (!hasPaper && !hasGuide)} onClick={() => void handleDraft()}>{draftLabel}</PenButton>
      </div>
      <ErrorText message={error} />
      {drafting && <Busy>Reading the questions and writing the answer key…</Busy>}
      {questions.length > 0 ? (
        <>
          <PageTitle eyebrow="step 2" title="Check the marking scheme" intro="Every mark depends on this key. Fix anything that is wrong — you can edit it later too." />
          <SchemeEditor questions={questions} onChange={setQuestions} />
          <div className="px-4"><PenButton className="w-full" onClick={() => void handleSave()}>Save and print answer sheets</PenButton></div>
        </>
      ) : !drafting && (
        <div className="px-2"><GhostButton className="!border-0 !text-pen" onClick={() => setQuestions([{ q: 1, type: 'short', prompt: '', max: 1, accept: [''] }])}>Or write the marking scheme by hand →</GhostButton></div>
      )}
    </div>
  );
}

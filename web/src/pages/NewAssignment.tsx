import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { draftScheme } from '../ai/scheme';
import { createAssignment } from '../data/store';
import type { Question } from '../domain/types';
import { SchemeEditor } from '../components/SchemeEditor';
import { useOnline } from '../hooks/useStatus';
import { ALL_LEVELS } from '../domain/levels';
import { friendlyCloudError } from '../ai/errors';

const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

export function NewAssignment() {
  const navigate = useNavigate();
  const isOnline = useOnline();
  const [title, setTitle] = useState('');
  const [className, setClassName] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [level, setLevel] = useState('Grade 6');
  const [paperImages, setPaperImages] = useState<File[]>([]);
  const [paperText, setPaperText] = useState('');
  const [guideFiles, setGuideFiles] = useState<File[]>([]);
  const [guideText, setGuideText] = useState('');
  const hasGuide = guideFiles.length > 0 || guideText.trim() !== '';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setError(null);
    setIsDrafting(true);
    try {
      const pdf = paperImages.find((f) => f.type === 'application/pdf');
      const images = paperImages.filter((f) => f.type.startsWith('image/'));
      const scheme = await draftScheme({
        images, pdf, text: paperText || undefined,
        guideImages: guideFiles.filter((f) => f.type.startsWith('image/')),
        guidePdf: guideFiles.find((f) => f.type === 'application/pdf'),
        guideText: guideText || undefined,
      }, subject, level);
      setQuestions(scheme.questions);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!questions.length) { setError('Add at least one question.'); return; }
    setIsSaving(true);
    try {
      const id = await createAssignment({ title: title || `${subject} — ${level}`, className: className || level, scheme: { subject, level, questions } });
      navigate(`/a/${id}/print`);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="mt-10 grid gap-10">
      <header>
        <p className="font-hand text-2xl text-pen">step 1</p>
        <h1 className="font-display text-4xl font-bold">New assignment</h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Details">
        <label className="text-sm font-medium">Title<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fractions quiz" /></label>
        <label className="text-sm font-medium">Class<input className={field} value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Primary 6A" /></label>
        <label className="text-sm font-medium">Subject<input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="text-sm font-medium">Class / level
            <input className={field} value={level} onChange={(e) => setLevel(e.target.value)} list="redpen-levels" placeholder="e.g. Grade 5, Year 7, JSS 2" />
            <datalist id="redpen-levels">{ALL_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
      </section>

      <section className="paper-card grid gap-4 p-6" aria-labelledby="paper">
        <h2 id="paper" className="font-display text-2xl font-bold">Draft the marking scheme</h2>
        <p className="text-ink-soft">
          Give REDPEN the question paper and it works out the answer key — or give it <strong>your own marking scheme</strong> and it copies
          your answers and marks exactly. Use either or both. Only these go to the cloud — never students’ work. You check everything before marking.
        </p>
        <h3 className="font-display text-lg font-bold">1 · Question paper</h3>
        <label className="text-sm font-medium">Photo(s) or PDF of the question paper
          <input className={field} type="file" accept="image/*,application/pdf" multiple capture="environment"
            onChange={(e) => setPaperImages(Array.from(e.target.files ?? []))} />
        </label>
        <label className="text-sm font-medium">…or type / paste the questions
          <textarea className={field} rows={4} value={paperText} onChange={(e) => setPaperText(e.target.value)} placeholder={'1. 7 × 8\n2. State two functions of blood. (2 marks)'} />
        </label>
        <h3 className="font-display text-lg font-bold">
          2 · Already have a marking scheme? <span className="font-body text-sm font-normal text-ink-soft">(optional — REDPEN copies it exactly)</span>
        </h3>
        <label className="text-sm font-medium">Photo(s) or PDF of your marking scheme / answer key
          <input className={field} type="file" accept="image/*,application/pdf" multiple
            onChange={(e) => setGuideFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="text-sm font-medium">…or type / paste your marking scheme
          <textarea className={field} rows={4} value={guideText} onChange={(e) => setGuideText(e.target.value)}
            placeholder={'1. 56 (1 mark)\n2. Abuja — accept FCT (1 mark)\n3. Any two: carries oxygen; fights germs; clots blood (2 marks)'} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-pen"
            disabled={isDrafting || !isOnline || (!paperImages.length && !paperText.trim() && !hasGuide)}
            onClick={() => void handleDraft()}>
            {isDrafting ? 'Reading…' : hasGuide ? 'Use my marking scheme' : 'Draft marking scheme'}
          </button>
          {!isOnline && <span className="text-sm text-ink-soft">Drafting needs internet — you can still type the scheme below.</span>}
        </div>
      </section>

      <section aria-labelledby="scheme" className="grid gap-4">
        <h2 id="scheme" className="font-display text-2xl font-bold">Marking scheme {questions.length > 0 && <span className="text-ink-soft">({questions.length})</span>}</h2>
        <SchemeEditor questions={questions} onChange={setQuestions} />
      </section>

      {error && <p className="text-pen" role="alert">{error}</p>}
      <div><button type="submit" className="btn-pen" disabled={isSaving || !questions.length}>{isSaving ? 'Saving…' : 'Save and print answer sheets'}</button></div>
    </form>
  );
}

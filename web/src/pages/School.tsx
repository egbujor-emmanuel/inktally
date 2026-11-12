import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PROFILE_LIMITS, saveProfile, useProfile, type Profile } from '../data/profile';
import { friendlyCloudError } from '../ai/errors';

const field = 'mt-1 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2';

/** Institution details: printed on answer sheets, marked copies, the mark register and the Excel file. */
export function School() {
  const saved = useProfile();
  const [draft, setDraft] = useState<Profile>(saved);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Adopt the stored profile when it arrives, unless the teacher has started typing.
  useEffect(() => { setDraft((d) => (d.institution || d.details || d.teacher ? d : saved)); }, [saved]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setDraft(saveProfile(draft));
      setStatus('saved');
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
      setStatus('error');
    }
  }

  const set = (key: keyof Profile) => (value: string) => { setStatus('idle'); setDraft((d) => ({ ...d, [key]: value })); };

  return (
    <div className="mx-auto mt-10 grid max-w-2xl gap-6">
      <div>
        <p className="font-hand text-2xl text-pen">on every sheet and record</p>
        <h1 className="font-display text-4xl font-bold">School details</h1>
        <p className="mt-2 text-ink-soft">
          Your school, college, university department, training centre or tutoring business. It appears on printed
          answer sheets, marked copies sent to parents, the mark register and the Excel download.
        </p>
      </div>
      <form className="paper-card grid gap-4 p-6" onSubmit={handleSubmit}>
        <label className="block font-medium">Institution name
          <input className={field} value={draft.institution} maxLength={PROFILE_LIMITS.institution}
            onChange={(e) => set('institution')(e.target.value)} placeholder="e.g. Greenfield College" />
        </label>
        <label className="block font-medium">Details under the name <span className="font-normal text-ink-soft">(optional)</span>
          <textarea className={`${field} min-h-20`} value={draft.details} maxLength={PROFILE_LIMITS.details}
            onChange={(e) => set('details')(e.target.value)} placeholder="Address, phone or email, term or session — e.g. 12 Bode Thomas St, Lagos · First Term 2026/27" />
        </label>
        <label className="block font-medium">Teacher or examiner name <span className="font-normal text-ink-soft">(optional)</span>
          <input className={field} value={draft.teacher} maxLength={PROFILE_LIMITS.teacher}
            onChange={(e) => set('teacher')(e.target.value)} placeholder="e.g. Mrs A. Okafor" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-pen">Save details</button>
          {status === 'saved' && <p className="text-ink-soft" role="status">Saved — it will show on sheets, copies and the register.</p>}
          <Link to="/" className="ml-auto text-sm underline">Back to my assignments</Link>
        </div>
        {error && <p className="text-pen" role="alert">{error}</p>}
      </form>
      {(draft.institution || draft.details) && (
        <section aria-label="Preview" className="rounded-lg border border-dashed border-[oklch(80%_0.02_85)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Preview</p>
          <p className="mt-2 font-display text-2xl font-bold">{draft.institution}</p>
          {draft.details && <p className="text-sm text-ink-soft">{draft.details}</p>}
          {draft.teacher && <p className="mt-1 text-sm">Teacher: {draft.teacher}</p>}
        </section>
      )}
    </div>
  );
}

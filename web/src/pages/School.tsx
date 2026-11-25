import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROFILE_LIMITS, saveProfile, useProfile, type Profile } from '../data/profile';
import { friendlyCloudError } from '../ai/errors';
import { Card, ErrorText, Field, GhostButton, PageTitle, PenButton } from '../ui/Kit';
import { PrivacyCard } from '../components/PrivacyCard';

/** Same screen as the Android SchoolScreen: institution details printed on sheets, copies, the register and Excel. */
export function School() {
  const saved = useProfile();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Profile>(saved);
  const [touched, setTouched] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt the stored profile when it arrives, unless the teacher has started typing.
  useEffect(() => { if (!touched) setDraft(saved); }, [saved, touched]);

  const set = (key: keyof Profile) => (value: string) => { setTouched(true); setSavedNote(false); setDraft((d) => ({ ...d, [key]: value })); };

  function handleSave() {
    setError(null);
    try {
      setDraft(saveProfile(draft));
      setTouched(false);
      setSavedNote(true);
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    }
  }

  return (
    <div className="grid gap-[14px] pb-10">
      <PageTitle eyebrow="on every sheet and record" title="School details"
        intro="Your school, college, university department, training centre or tutoring business. It appears on printed answer sheets, marked copies sent to parents, the mark register and the Excel download." />
      <Card>
        <Field label="Institution name" value={draft.institution} onChange={set('institution')} placeholder="e.g. Greenfield College" maxLength={PROFILE_LIMITS.institution} />
        <Field label="Details under the name (optional)" value={draft.details} onChange={set('details')} placeholder="Address, phone or email, term or session"
          multiline rows={2} maxLength={PROFILE_LIMITS.details} />
        <Field label="Teacher or examiner name (optional)" value={draft.teacher} onChange={set('teacher')} placeholder="e.g. Mrs A. Okafor" maxLength={PROFILE_LIMITS.teacher} />
        <PenButton className="w-full" onClick={handleSave}>Save details</PenButton>
        {savedNote && <p className="text-sm text-ink-soft" role="status">Saved — it will show on sheets, copies and the register.</p>}
        <GhostButton className="w-full" onClick={() => navigate('/')}>Back to my assignments</GhostButton>
      </Card>
      <ErrorText message={error} />
      <PrivacyCard />
      {(draft.institution || draft.details) && (
        <Card className="!border-rule">
          <p className="text-[11px] font-semibold text-ink-soft">PREVIEW</p>
          <p className="font-display text-[22px] font-bold">{draft.institution}</p>
          {draft.details && <p className="text-sm text-ink-soft">{draft.details}</p>}
          {draft.teacher && <p className="text-sm">Teacher: {draft.teacher}</p>}
        </Card>
      )}
    </div>
  );
}

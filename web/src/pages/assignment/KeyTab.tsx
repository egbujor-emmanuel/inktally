import { useState } from 'react';
import { saveMarks, saveScheme, type Assignment, type Submission } from '../../data/store';
import { SchemeEditor, isComplete } from '../../components/SchemeEditor';
import { remarkAll, remarkNotice } from '../../marking/remark';
import { friendlyCloudError } from '../../ai/errors';
import { ErrorText, GhostButton, PenButton } from '../../ui/Kit';

/**
 * The saved answer key, editable after saving (same as the Android Answer key tab). Once students are marked the
 * questions stay as printed; fixing an answer or a mark re-marks everyone from what REDPEN already read.
 */
export function KeyTab({ assignment, submissions }: { assignment: Assignment; submissions: Submission[] }) {
  const saved = assignment.scheme.questions;
  const [draft, setDraft] = useState(saved);
  const [version, setVersion] = useState(0); // remounts the editor's fields after Undo
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The saved key can change elsewhere (e.g. "accept for everyone"): follow it unless the teacher is mid-edit.
  const [base, setBase] = useState(saved);
  if (JSON.stringify(base) !== JSON.stringify(saved)) {
    setBase(saved);
    if (JSON.stringify(draft) === JSON.stringify(base)) { setDraft(saved); setVersion((v) => v + 1); }
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const locked = submissions.some((s) => s.marks.length > 0 || s.queued);

  async function handleSave() {
    if (!draft.every(isComplete)) { setError('Every question needs at least one answer.'); return; }
    setSaving(true); setError(null);
    try {
      const { updates, summary } = remarkAll(saved, draft, submissions);
      await saveScheme(assignment.id, { ...assignment.scheme, questions: draft });
      for (const u of updates) await saveMarks(assignment.id, u.submissionId, u.marks);
      setNotice(remarkNotice(summary));
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally { setSaving(false); }
  }

  function handleUndo() { setDraft(saved); setVersion((v) => v + 1); setNotice(null); setError(null); }

  return (
    <div className="grid gap-3 pb-6">
      <p className="px-4 text-sm text-ink-soft">
        {locked
          ? 'Students have been marked, so the questions stay as printed. Fix any answer or mark and REDPEN re-marks everyone from what it already read — no new photos, no new AI reading.'
          : 'Check the answer key. You can still add or remove questions until marking starts (then reprint the sheets).'}
      </p>
      <SchemeEditor key={version} questions={draft} locked={locked} onChange={(q) => { setDraft(q); setNotice(null); }} />
      <div className="grid gap-2 px-4">
        <PenButton disabled={!dirty || saving} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Save answer key'}</PenButton>
        {dirty && <GhostButton onClick={handleUndo}>Undo changes</GhostButton>}
      </div>
      {notice && <p className="px-4 text-sm font-semibold" role="status">{notice}</p>}
      <ErrorText message={error} />
    </div>
  );
}

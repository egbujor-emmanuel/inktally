import { useEffect, useState } from 'react';
import { COMMENT_LIMIT, MARKED_KEY, loadCrop, updateSubmission, type Assignment, type Submission } from '../data/store';
import type { Profile } from '../data/profile';
import { MarkedCopy } from './MarkedCopy';

type Props = {
  assignment: Assignment;
  submission: Submission;
  profile: Profile;
  /** The freshly made marked copy; otherwise it is loaded from this device. */
  copy?: Blob | null;
};

/** One pupil's record after marking: the teacher's comment plus the marked copy with letterhead. */
export function PupilRecord({ assignment, submission, profile, copy }: Props) {
  const [blob, setBlob] = useState<Blob | null | undefined>(copy ?? undefined);
  const [comment, setComment] = useState(submission.comment ?? '');
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    if (copy) { setBlob(copy); return; }
    let alive = true;
    loadCrop(submission.id, MARKED_KEY).then((b) => { if (alive) setBlob(b ?? null); }, () => { if (alive) setBlob(null); });
    return () => { alive = false; };
  }, [copy, submission.id]);

  // Follow edits made elsewhere (another tab, the register) unless the teacher is mid-edit here.
  useEffect(() => { setComment((c) => (c === '' ? submission.comment ?? '' : c)); }, [submission.comment]);

  const savedComment = submission.comment ?? '';
  const dirty = comment.trim() !== savedComment.trim();

  function handleSave() {
    if (!dirty) return;
    updateSubmission(assignment.id, submission.id, { comment });
    setSavedNote(true);
  }

  const max = assignment.scheme.questions.reduce((a, q) => a + q.max, 0);
  const total = submission.marks.reduce((a, m) => a + m.awarded, 0);

  return (
    <div className="grid gap-4">
      <div className="paper-card grid gap-2 p-5">
        <label htmlFor={`comment-${submission.id}`} className="font-display text-xl font-bold">Comment for {submission.pupil}</label>
        <textarea id={`comment-${submission.id}`} className="min-h-24 w-full rounded-lg border border-[oklch(82%_0.02_85)] bg-white px-3 py-2 font-hand text-2xl text-pen"
          value={comment} maxLength={COMMENT_LIMIT} placeholder="e.g. Good work on fractions — revise past tenses before Friday."
          onChange={(e) => { setComment(e.target.value); setSavedNote(false); }} onBlur={handleSave} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost text-sm" onClick={handleSave} disabled={!dirty}>Save comment</button>
          {savedNote && !dirty && <p className="text-sm text-ink-soft" role="status">Saved. It is on the marked copy and in the Excel register.</p>}
          <p className="ml-auto text-xs text-ink-soft">{comment.length}/{COMMENT_LIMIT}</p>
        </div>
      </div>
      {blob === undefined && <p className="text-ink-soft">Loading the marked copy…</p>}
      {blob === null && (
        <p className="text-ink-soft">The marked copy image stays on the device that marked this student (photos are never uploaded). The comment and scores are saved to your account.</p>
      )}
      {blob && (
        <MarkedCopy blob={blob} pupil={submission.pupil} letterhead={{
          institution: profile.institution, details: profile.details, teacher: profile.teacher,
          title: assignment.title, className: assignment.className, pupil: submission.pupil,
          total, max, comment: savedComment,
        }} />
      )}
    </div>
  );
}

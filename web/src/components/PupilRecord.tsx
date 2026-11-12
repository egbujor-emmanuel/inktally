import { useEffect, useState } from 'react';
import { COMMENT_LIMIT, MARKED_KEY, loadCrop, updateSubmission, type Assignment, type Submission } from '../data/store';
import type { Profile } from '../data/profile';
import { MarkedCopy } from './MarkedCopy';
import { Field, GhostButton } from '../ui/Kit';

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

  // Same two cards as the Android PupilRecord.
  return (
    <div className="grid gap-3">
      <section className="card card-pad mx-4" aria-label={`Comment for ${submission.pupil}`}>
        <h3 className="font-display text-xl font-bold">Comment for {submission.pupil}</h3>
        <Field label="Teacher’s comment" value={comment} multiline rows={3} maxLength={COMMENT_LIMIT}
          placeholder="e.g. Good work on fractions — revise past tenses before Friday."
          onChange={(v) => { setComment(v); setSavedNote(false); }} onBlur={handleSave} />
        <div className="flex items-center gap-2">
          <GhostButton onClick={handleSave} disabled={!dirty}>Save comment</GhostButton>
          <span className="text-xs text-ink-soft">{comment.length}/{COMMENT_LIMIT}</span>
        </div>
        {savedNote && !dirty && <p className="text-[13px] text-ink-soft" role="status">Saved. It is on the marked copy and in the Excel register.</p>}
      </section>
      {blob === undefined && <p className="px-4 font-hand text-[26px] text-ink-soft">Preparing the marked copy…</p>}
      {blob === null && (
        <p className="px-4 text-sm text-ink-soft">The marked copy image stays on the device that marked this student (photos are never uploaded). The comment and scores are saved to your account.</p>
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

import { useEffect, useState } from 'react';
import type { Mark, Question } from '../../domain/types';
import { loadCrop, saveMarks, saveReadingHints, updateQuestion, type Assignment, type Submission } from '../../data/store';
import { usableHint } from '../../marking/learning';
import { PAGE_KEY } from './MarkTab';
import { parseNumericAnswer } from '../../marking/normalize';
import { needsCheck } from '../../marking/cloudCheck';
import { regradeAll } from '../../marking/regrade';
import { MarkRow } from '../../components/MarkRow';
import { useOnline } from '../../hooks/useStatus';
import type { CloudCheckState } from '../../hooks/useCloudCheck';
import { Card, ErrorText, GhostButton, PenButton } from '../../ui/Kit';

type Props = { assignment: Assignment; submissions: Submission[]; check: CloudCheckState };

function teacherMark(mark: Mark, awarded: number): Mark {
  return { ...mark, awarded, status: 'reviewed', engine: 'teacher', reasons: [...mark.reasons, `Teacher set ${awarded}/${mark.max}.`] };
}

/** Adds the student's answer to the accepted list so every other student is marked the same way. */
function acceptForEveryone(question: Question, read: string): Question | null {
  if (question.type === 'short') return { ...question, accept: [...question.accept, read] };
  if (question.type === 'numeric') {
    const v = parseNumericAnswer(read).value;
    return v === null ? null : { ...question, accept: [...question.accept, v] };
  }
  return null;
}

export function ReviewTab({ assignment, submissions, check }: Props) {
  const isOnline = useOnline();
  const [cropUrls, setCropUrls] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const checking = check.progress;

  const pending = submissions.flatMap((s) => s.marks.filter(needsCheck).map((m) => ({ s, m })));
  const provisionalCount = pending.filter(({ m }) => m.status === 'provisional').length;

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      const entries: [string, string][] = [];
      for (const { s, m } of pending) {
        const blob = (await loadCrop(s.id, m.q)) ?? (await loadCrop(s.id, PAGE_KEY));
        if (blob) { const url = URL.createObjectURL(blob); urls.push(url); entries.push([`${s.id}:${m.q}`, url]); }
      }
      if (alive) setCropUrls(Object.fromEntries(entries));
    })();
    return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // Re-load when the set of pending marks changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.map(({ s, m }) => `${s.id}:${m.q}:${m.status}`).join('|')]);

  async function setScore(s: Submission, m: Mark, awarded: number) {
    await saveMarks(assignment.id, s.id, s.marks.map((x) => (x.q === m.q ? teacherMark(x, awarded) : x)));
  }

  /** Adds the answer to the scheme, then re-marks EVERY student already marked with it (from their stored reading). */
  async function acceptAnswer(s: Submission, m: Mark) {
    const question = assignment.scheme.questions.find((q) => q.q === m.q);
    const updated = question && acceptForEveryone(question, m.read);
    if (!updated) return;
    await updateQuestion(assignment, updated);
    await setScore(s, m, m.max);
    const others = regradeAll(updated, submissions.filter((x) => x.id !== s.id && !x.queued));
    for (const r of others) await saveMarks(assignment.id, r.submissionId, r.marks);
    setNotice(others.length
      ? `Accepted “${m.read.slice(0, 30)}”. ${others.length} other student${others.length === 1 ? '' : 's'}’ marks went up too.`
      : `Accepted “${m.read.slice(0, 30)}”. Every student who writes it from now on gets the mark.`);
  }

  // Same layout as the Android Review tab.
  return (
    <div className="grid gap-3 pb-10">
      <div className="flex items-center gap-3 px-4">
        <p className="flex-1 font-display text-xl font-bold">{pending.length} answer{pending.length === 1 ? '' : 's'} to check</p>
        <PenButton disabled={!isOnline || !!checking || pending.length === 0} onClick={() => void check.run()}>
          {checking ? `Checking ${checking.done}/${checking.total}…` : isOnline ? 'Check with the cloud' : 'Runs when online'}
        </PenButton>
      </div>
      {provisionalCount > 0 && <p className="px-4 text-sm text-ink-soft">{provisionalCount} marked on-device, waiting for the cloud check.</p>}
      {notice && <p className="px-4 text-sm font-semibold" role="status">{notice}</p>}
      {(assignment.readingHints?.length ?? 0) > 0 && (
        <Card labelledBy="learned-title">
          <h2 id="learned-title" className="font-display text-lg font-bold">What on-device AI learned about these students</h2>
          <p className="text-sm text-ink-soft">When the cloud check read an answer differently, REDPEN kept the correction. Gemini Nano gets these hints on its next readings for this assignment, so it learns how these students write. A one-letter mix-up is only used after it has been seen twice, so one correction can never push other students' answers towards the key. Cloud checks never see the hints, so they stay independent.</p>
          <ul className="grid gap-1 text-sm">
            {assignment.readingHints?.slice().reverse().map((h, i) => (
              <li key={`${h.type}-${h.device}-${h.cloud}-${i}`}>Looked like <b>“{h.device}”</b> → was <b>“{h.cloud}”</b> <span className="text-ink-soft">({h.type}{(h.n ?? 1) > 1 ? `, seen ${h.n} times` : ''}{usableHint(h) ? '' : ', waiting for a second sighting'})</span></li>
            ))}
          </ul>
          <button type="button" className="btn-text justify-self-start" onClick={() => saveReadingHints(assignment.id, [])}>Forget these</button>
        </Card>
      )}
      <ErrorText message={check.error} />
      {pending.length === 0 && <p className="px-4 font-hand text-[26px] text-ink-soft">Nothing to check: every mark was read by the cloud or set by you. ✓</p>}
      <ol className="grid gap-3 px-4">
        {pending.map(({ s, m }, i) => {
          const question = assignment.scheme.questions.find((q) => q.q === m.q);
          const canAccept = (question?.type === 'short' || question?.type === 'numeric') && Boolean(m.read) && m.awarded < m.max;
          return (
            <MarkRow key={`${s.id}:${m.q}`} mark={m} cropUrl={cropUrls[`${s.id}:${m.q}`]} index={i} actions={
              <div className="grid gap-1.5">
                <p className="font-semibold">{s.pupil}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: m.max + 1 }, (_, n) => (
                    <GhostButton key={n} className="!min-h-10 !px-4 !py-2" onClick={() => void setScore(s, m, n)}>{n}/{m.max}</GhostButton>
                  ))}
                </div>
                {canAccept && (
                  <button type="button" className="btn-text justify-self-start" onClick={() => void acceptAnswer(s, m)}>Accept “{m.read.slice(0, 30)}” for everyone</button>
                )}
              </div>
            } />
          );
        })}
      </ol>
    </div>
  );
}

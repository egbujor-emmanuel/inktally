import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mark, Question } from '../../domain/types';
import { loadCrop, saveMarks, updateQuestion, type Assignment, type Submission } from '../../data/store';
import { verifyMark, verifyMarksBatch, verifyPage } from '../../marking/markAnswer';
import { batchingEnabled } from '../../ai/batch';
import { PAGE_KEY } from './MarkTab';
import { parseNumericAnswer } from '../../marking/normalize';
import { MarkRow } from '../../components/MarkRow';
import { useOnline } from '../../hooks/useStatus';
import { friendlyCloudError } from '../../ai/errors';
import { ErrorText, GhostButton, PenButton } from '../../ui/Kit';

type Props = { assignment: Assignment; submissions: Submission[] };

const needsCheck = (m: Mark) => m.status === 'provisional' || m.status === 'flagged';

function teacherMark(mark: Mark, awarded: number): Mark {
  return { ...mark, awarded, status: 'reviewed', engine: 'teacher', reasons: [...mark.reasons, `Teacher set ${awarded}/${mark.max}.`] };
}

/** Adds the pupil's answer to the accepted list so every other pupil is marked the same way. */
function acceptForEveryone(question: Question, read: string): Question | null {
  if (question.type === 'short') return { ...question, accept: [...question.accept, read] };
  if (question.type === 'numeric') {
    const v = parseNumericAnswer(read).value;
    return v === null ? null : { ...question, accept: [...question.accept, v] };
  }
  return null;
}

export function ReviewTab({ assignment, submissions }: Props) {
  const isOnline = useOnline();
  const [cropUrls, setCropUrls] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

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

  const runCloudCheck = useCallback(async () => {
    const targets = submissions.flatMap((s) => s.marks.filter(needsCheck).map((m) => ({ s, m })));
    if (!targets.length) return;
    setError(null);
    setChecking({ done: 0, total: targets.length });
    let done = 0;
    for (const s of submissions) {
      const page = await loadCrop(s.id, PAGE_KEY);
      if (page && s.marks.some(needsCheck)) {
        try {
          await saveMarks(assignment.id, s.id, await verifyPage(assignment.scheme.questions, page, s.marks));
        } catch (e: unknown) { setError(friendlyCloudError(e).message); }
        done += s.marks.filter(needsCheck).length;
        setChecking({ done, total: targets.length });
        continue;
      }
      // One cloud request for all of this student's answers that need checking.
      if (batchingEnabled() && s.marks.filter(needsCheck).length > 1) {
        const crops: { q: number; type: Question['type']; blob: Blob }[] = [];
        for (const m of s.marks.filter(needsCheck)) {
          const question = assignment.scheme.questions.find((q) => q.q === m.q);
          const blob = await loadCrop(s.id, m.q);
          if (question && blob) crops.push({ q: m.q, type: question.type, blob });
        }
        try {
          await saveMarks(assignment.id, s.id, await verifyMarksBatch(assignment.scheme.questions, crops, s.marks));
          done += crops.length;
          setChecking({ done, total: targets.length });
          continue;
        } catch { /* fall back to checking one answer at a time */ }
      }
      let changed = false;
      const next: Mark[] = [];
      for (const m of s.marks) {
        const question = assignment.scheme.questions.find((q) => q.q === m.q);
        const crop = needsCheck(m) ? await loadCrop(s.id, m.q) : undefined;
        if (!question || !crop) { next.push(m); continue; }
        try { next.push(await verifyMark(question, crop, m)); changed = true; } catch (e: unknown) {
          next.push(m);
          setError(friendlyCloudError(e).message);
        }
        done += 1;
        setChecking({ done, total: targets.length });
      }
      if (changed) await saveMarks(assignment.id, s.id, next);
    }
    setChecking(null);
  }, [assignment, submissions]);

  // When the teacher comes back online, verify provisional on-device marks automatically (once per visit).
  useEffect(() => {
    if (isOnline && provisionalCount > 0 && !autoRan.current && !checking) {
      autoRan.current = true;
      void runCloudCheck();
    }
  }, [isOnline, provisionalCount, checking, runCloudCheck]);

  async function setScore(s: Submission, m: Mark, awarded: number) {
    await saveMarks(assignment.id, s.id, s.marks.map((x) => (x.q === m.q ? teacherMark(x, awarded) : x)));
  }

  async function acceptAnswer(s: Submission, m: Mark) {
    const question = assignment.scheme.questions.find((q) => q.q === m.q);
    const updated = question && acceptForEveryone(question, m.read);
    if (!updated) return;
    await updateQuestion(assignment, updated);
    await setScore(s, m, m.max);
  }

  // Same layout as the Android Review tab.
  return (
    <div className="grid gap-3 pb-10">
      <div className="flex items-center gap-3 px-4">
        <p className="flex-1 font-display text-xl font-bold">{pending.length} answer{pending.length === 1 ? '' : 's'} to check</p>
        <PenButton disabled={!isOnline || !!checking || pending.length === 0} onClick={() => void runCloudCheck()}>
          {checking ? `Checking ${checking.done}/${checking.total}…` : isOnline ? 'Check with the cloud' : 'Runs when online'}
        </PenButton>
      </div>
      {provisionalCount > 0 && <p className="px-4 text-sm text-ink-soft">{provisionalCount} marked on-device, waiting for the cloud check.</p>}
      <ErrorText message={error} />
      {pending.length === 0 && <p className="px-4 font-hand text-[26px] text-ink-soft">All marks are verified or reviewed. ✓</p>}
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

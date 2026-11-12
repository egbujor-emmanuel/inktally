import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mark, Question } from '../../domain/types';
import { loadCrop, saveMarks, updateQuestion, type Assignment, type Submission } from '../../data/store';
import { verifyMark, verifyPage } from '../../marking/markAnswer';
import { PAGE_KEY } from './MarkTab';
import { parseNumericAnswer } from '../../marking/normalize';
import { MarkRow } from '../../components/MarkRow';
import { useOnline } from '../../hooks/useStatus';

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
        } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Cloud check failed'); }
        done += s.marks.filter(needsCheck).length;
        setChecking({ done, total: targets.length });
        continue;
      }
      let changed = false;
      const next: Mark[] = [];
      for (const m of s.marks) {
        const question = assignment.scheme.questions.find((q) => q.q === m.q);
        const crop = needsCheck(m) ? await loadCrop(s.id, m.q) : undefined;
        if (!question || !crop) { next.push(m); continue; }
        try { next.push(await verifyMark(question, crop, m)); changed = true; } catch (e: unknown) {
          next.push(m);
          setError(e instanceof Error ? e.message : 'Cloud check failed');
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

  return (
    <div className="grid gap-6">
      <section className="paper-card flex flex-wrap items-center justify-between gap-4 p-5">
        <p>
          <span className="font-display text-2xl font-bold">{pending.length}</span> answer{pending.length === 1 ? '' : 's'} to check
          {provisionalCount > 0 && <span className="text-ink-soft"> · {provisionalCount} marked on-device, awaiting the cloud check</span>}
        </p>
        <button type="button" className="btn-pen" disabled={!isOnline || !!checking || pending.length === 0} onClick={() => void runCloudCheck()}>
          {checking ? `Checking ${checking.done}/${checking.total}…` : isOnline ? 'Check all with the cloud' : 'Cloud check runs when online'}
        </button>
      </section>
      {error && <p className="text-pen" role="alert">{error}</p>}
      {pending.length === 0 && <p className="font-hand text-3xl text-ink-soft">All marks are verified or reviewed. ✓</p>}
      <ol className="grid gap-3">
        {pending.map(({ s, m }, i) => {
          const question = assignment.scheme.questions.find((q) => q.q === m.q);
          const canAccept = question?.type === 'short' || question?.type === 'numeric';
          return (
            <MarkRow key={`${s.id}:${m.q}`} mark={m} cropUrl={cropUrls[`${s.id}:${m.q}`]} index={i} actions={
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{s.pupil}</span>
                <span className="text-ink-soft">Set score:</span>
                {Array.from({ length: m.max + 1 }, (_, n) => (
                  <button key={n} type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => void setScore(s, m, n)}>{n}</button>
                ))}
                {canAccept && m.read && m.awarded < m.max && (
                  <button type="button" className="text-pen underline" onClick={() => void acceptAnswer(s, m)}>Accept “{m.read}” for everyone</button>
                )}
              </div>
            } />
          );
        })}
      </ol>
    </div>
  );
}

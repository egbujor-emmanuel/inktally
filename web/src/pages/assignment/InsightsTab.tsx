import { useMemo, useState } from 'react';
import type { Question } from '../../domain/types';
import { makeCatchUp, type CatchUpSheet } from '../../ai/remediation';
import type { Assignment, Submission } from '../../data/store';
import { useOnline } from '../../hooks/useStatus';
import { friendlyCloudError } from '../../ai/errors';
import { ErrorText, GhostButton, PenButton } from '../../ui/Kit';

type Props = { assignment: Assignment; submissions: Submission[] };

interface QuestionStat { question: Question; average: number; attempts: number; wrong: string[] }

const TOP_WRONG = 4;

function stats(assignment: Assignment, submissions: Submission[]): QuestionStat[] {
  return assignment.scheme.questions.map((question) => {
    const marks = submissions.map((s) => s.marks.find((m) => m.q === question.q)).filter((m) => m !== undefined);
    const average = marks.length ? marks.reduce((a, m) => a + m.awarded / m.max, 0) / marks.length : 0;
    const wrong = marks.filter((m) => m.awarded < m.max && m.read).map((m) => m.read);
    return { question, average, attempts: marks.length, wrong };
  });
}

function topCounts(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_WRONG);
}

export function InsightsTab({ assignment, submissions }: Props) {
  const isOnline = useOnline();
  const rows = useMemo(() => stats(assignment, submissions), [assignment, submissions]);
  const [sheet, setSheet] = useState<{ q: number; data: CatchUpSheet } | null>(null);
  const [busyQ, setBusyQ] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCatchUp(row: QuestionStat) {
    setBusyQ(row.question.q);
    setError(null);
    try {
      setSheet({ q: row.question.q, data: await makeCatchUp(row.question, row.wrong, assignment.scheme.subject, assignment.scheme.level) });
    } catch (e: unknown) {
      setError(friendlyCloudError(e).message);
    } finally {
      setBusyQ(null);
    }
  }

  if (!submissions.length) return <p className="p-4 font-hand text-[26px] text-ink-soft">Mark a few students to see where the class is struggling.</p>;

  function catchUpText(q: number, data: CatchUpSheet): string {
    return `Catch-up — ${assignment.title}, question ${q}\n\n${data.explanation}\n\n`
      + data.practice.map((p, i) => `${i + 1}. ${p.question}\n   Answer: ${p.answer}`).join('\n');
  }

  async function handleShare(q: number, data: CatchUpSheet) {
    const text = catchUpText(q, data);
    if (typeof navigator.share === 'function') { try { await navigator.share({ title: 'Catch-up sheet', text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); setError('Copied — paste it into a message or document.'); } catch { setError('Sharing is not available here — use Print instead.'); }
  }

  // Same layout as the Android Insights tab.
  return (
    <div className="grid gap-3 pb-10">
      {rows.map((row) => {
        const pct = Math.round(row.average * 100);
        return (
          <section key={row.question.q} className="card card-pad mx-4" aria-label={`Question ${row.question.q}`}>
            <div className="flex items-center">
              <span className="w-[52px] flex-none font-display text-[22px] font-bold">Q{row.question.q}</span>
              <p className="flex-1 font-medium">{row.question.prompt}</p>
            </div>
            {row.wrong.length > 0 && (
              <p className="text-[13px] text-ink-soft">Answers that lost marks: {topCounts(row.wrong).map(([v, n]) => `“${v}” ×${n}`).join(', ')}</p>
            )}
            <div className="h-2.5 overflow-hidden rounded-[5px] bg-paper-deep" aria-hidden>
              <div className="h-full rounded-[5px]" style={{ width: `${pct}%`, background: pct < 50 ? 'var(--color-pen)' : 'var(--color-device)' }} />
            </div>
            <p className="text-[13px] text-ink-soft">{pct}% average · {row.attempts} students</p>
            <GhostButton disabled={!isOnline || !row.wrong.length || busyQ !== null} onClick={() => void handleCatchUp(row)}>
              {busyQ === row.question.q ? 'Writing…' : 'Catch-up sheet'}
            </GhostButton>
          </section>
        );
      })}
      <ErrorText message={error} />
      {sheet && (
        <section className="ruled print-area grid gap-2.5 py-5 pr-4 pl-[52px]" aria-labelledby="catchup">
          <p className="font-hand text-[22px] text-pen">catch-up · question {sheet.q}</p>
          <h2 id="catchup" className="font-display text-[26px] font-bold">Let’s fix this together</h2>
          <p className="text-[17px] leading-[26px]">{sheet.data.explanation}</p>
          {sheet.data.practice.map((p, i) => (
            <details key={p.question}>
              <summary className="cursor-pointer list-none text-[17px] leading-[26px]">{i + 1}. {p.question}<span className="block text-sm text-ink-soft">Show answer</span></summary>
              <p className="text-sm text-ink-soft">Answer: {p.answer}</p>
            </details>
          ))}
          <div className="grid grid-cols-2 gap-2 print:hidden">
            <PenButton onClick={() => void handleShare(sheet.q, sheet.data)}>Share</PenButton>
            <GhostButton onClick={() => window.print()}>Print</GhostButton>
          </div>
        </section>
      )}
    </div>
  );
}

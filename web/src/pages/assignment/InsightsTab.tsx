import { useMemo, useState } from 'react';
import type { Question } from '../../domain/types';
import { makeCatchUp, type CatchUpSheet } from '../../ai/remediation';
import type { Assignment, Submission } from '../../data/store';
import { useOnline } from '../../hooks/useStatus';

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
      setError(e instanceof Error ? e.message : 'Could not make the catch-up sheet');
    } finally {
      setBusyQ(null);
    }
  }

  if (!submissions.length) return <p className="font-hand text-3xl text-ink-soft">Mark a few pupils to see where the class is struggling.</p>;

  return (
    <div className="grid gap-8">
      <ol className="grid gap-3">
        {rows.map((row) => {
          const pct = Math.round(row.average * 100);
          return (
            <li key={row.question.q} className="paper-card grid gap-3 p-5 md:grid-cols-[3rem_1fr_14rem_auto] md:items-center">
              <span className="font-display text-2xl font-bold">Q{row.question.q}</span>
              <div>
                <p className="font-medium">{row.question.prompt}</p>
                {row.wrong.length > 0 && (
                  <p className="mt-1 text-sm text-ink-soft">Answers that lost marks: {topCounts(row.wrong).map(([v, n]) => `“${v}” ×${n}`).join(', ')}</p>
                )}
              </div>
              <div aria-label={`${pct}% average`}>
                <div className="h-3 overflow-hidden rounded-full bg-paper-deep">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct < 50 ? 'var(--color-pen)' : 'var(--color-device)' }} />
                </div>
                <p className="mt-1 text-sm text-ink-soft">{pct}% average · {row.attempts} pupils</p>
              </div>
              <button type="button" className="btn-ghost text-sm" disabled={!isOnline || !row.wrong.length || busyQ !== null} onClick={() => void handleCatchUp(row)}>
                {busyQ === row.question.q ? 'Writing…' : 'Catch-up sheet'}
              </button>
            </li>
          );
        })}
      </ol>
      {error && <p className="text-pen" role="alert">{error}</p>}
      {sheet && (
        <section className="paper-card ruled p-8 sm:pl-20" aria-labelledby="catchup">
          <p className="font-hand text-2xl text-pen">catch-up · question {sheet.q}</p>
          <h2 id="catchup" className="font-display text-3xl font-bold">Let’s fix this together</h2>
          <p className="mt-4 max-w-2xl text-lg leading-8">{sheet.data.explanation}</p>
          <ol className="mt-6 grid list-decimal gap-4 pl-6 text-lg leading-8">
            {sheet.data.practice.map((p) => (
              <li key={p.question}>{p.question}<details className="text-base text-ink-soft"><summary className="cursor-pointer">Answer</summary>{p.answer}</details></li>
            ))}
          </ol>
          <button type="button" className="btn-pen mt-6" onClick={() => window.print()}>Print</button>
        </section>
      )}
    </div>
  );
}

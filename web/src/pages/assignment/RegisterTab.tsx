import type { Assignment, Submission } from '../../data/store';

type Props = { assignment: Assignment; submissions: Submission[] };

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote anything with separators.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The class mark register: replaces copying scores into the record book by hand. */
export function RegisterTab({ assignment, submissions }: Props) {
  const questions = assignment.scheme.questions;
  const max = questions.reduce((a, q) => a + q.max, 0);
  const rows = submissions.map((s) => {
    const scores = questions.map((q) => s.marks.find((m) => m.q === q.q));
    const total = scores.reduce((a, m) => a + (m?.awarded ?? 0), 0);
    const unchecked = s.marks.filter((m) => m.status === 'flagged' || m.status === 'provisional').length;
    return { s, scores, total, unchecked };
  });
  const classAverage = rows.length ? rows.reduce((a, r) => a + r.total, 0) / rows.length : 0;

  function handleExport() {
    const header = ['Pupil', ...questions.map((q) => `Q${q.q} (/${q.max})`), `Total (/${max})`, 'Percent', 'Status'];
    const lines = rows.map((r) => [
      r.s.pupil, ...r.scores.map((m) => m?.awarded ?? ''), r.total, `${Math.round((r.total / max) * 100)}%`,
      r.unchecked ? `${r.unchecked} to check` : 'final',
    ]);
    const csv = [header, ...lines].map((l) => l.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assignment.title.replace(/[^a-z0-9]+/gi, '-')}-marks.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!rows.length) return <p className="font-hand text-3xl text-ink-soft">Mark a few pupils and their scores appear here, ready for your records.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-pen" onClick={handleExport}>Export to Excel (CSV)</button>
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print register</button>
        <p className="text-ink-soft">{rows.length} pupils · class average {classAverage.toFixed(1)}/{max}</p>
      </div>
      <div className="print-area overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <caption className="p-2 text-left font-display text-xl font-bold">{assignment.title} — {assignment.className}</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="p-2 text-left">Pupil</th>
              {questions.map((q) => <th key={q.q} scope="col" className="p-2 text-center">Q{q.q}<span className="block text-xs font-normal text-ink-soft">/{q.max}</span></th>)}
              <th scope="col" className="p-2 text-center">Total<span className="block text-xs font-normal text-ink-soft">/{max}</span></th>
              <th scope="col" className="p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id} className="border-b border-[oklch(90%_0.02_85)]">
                <th scope="row" className="p-2 text-left font-semibold">{r.s.pupil}</th>
                {r.scores.map((m, i) => (
                  <td key={questions[i].q} className={`p-2 text-center font-hand text-xl ${m && m.awarded < m.max ? 'text-pen' : ''}`}>{m ? m.awarded : '–'}</td>
                ))}
                <td className="p-2 text-center font-hand text-2xl text-pen">{r.total}</td>
                <td className="p-2 text-xs text-ink-soft">{r.unchecked ? `${r.unchecked} to check` : 'Final'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

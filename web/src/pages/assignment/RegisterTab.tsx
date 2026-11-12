import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COMMENT_LIMIT, PUPIL_LIMIT, updateSubmission, type Assignment, type Submission } from '../../data/store';
import { useProfile } from '../../data/profile';
import { buildRegisterWorkbook, downloadBlob, registerFileName, registerRows } from '../../data/excel';
import { PupilRecord } from '../../components/PupilRecord';
import { friendlyCloudError } from '../../ai/errors';

type Props = { assignment: Assignment; submissions: Submission[] };

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const cellInput = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-[oklch(85%_0.02_85)] focus:border-ink focus:bg-white';

/** Text cell that saves when the teacher leaves it (works offline: the write is queued). */
function EditableCell({ value, label, maxLength, multiline, onSave }: {
  value: string; label: string; maxLength: number; multiline?: boolean; onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;
  const commit = () => { setFocused(false); if (draft.trim() !== value.trim()) onSave(draft); };
  const common = {
    'aria-label': label, maxLength, value: shown, className: cellInput,
    onFocus: () => { setDraft(value); setFocused(true); },
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline
    ? <textarea {...common} rows={1} className={`${cellInput} min-w-48 resize-y font-hand text-lg text-pen`} placeholder="Add a comment" />
    : <input {...common} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

/** The class mark register: replaces copying scores into the record book by hand. Everything is editable after marking. */
export function RegisterTab({ assignment, submissions }: Props) {
  const profile = useProfile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questions = assignment.scheme.questions;
  const max = questions.reduce((a, q) => a + q.max, 0);
  const rows = registerRows(questions, submissions);
  const classAverage = rows.length ? rows.reduce((a, r) => a + r.total, 0) / rows.length : 0;
  const open = submissions.find((s) => s.id === openId);

  async function handleExcel() {
    setError(null);
    setIsExporting(true);
    try {
      downloadBlob(await buildRegisterWorkbook(assignment, submissions, profile), registerFileName(assignment, 'xlsx'));
    } catch (e: unknown) {
      setError(`Could not build the Excel file: ${friendlyCloudError(e).message}`);
    } finally { setIsExporting(false); }
  }

  function handleCsv() {
    const letterhead = [[profile.institution], [profile.details], [`${assignment.title} — ${assignment.className}`], [profile.teacher ? `Teacher: ${profile.teacher}` : ''], []]
      .filter((l, i) => i >= 2 || l[0]);
    const header = ['Student', ...questions.map((q) => `Q${q.q} (/${q.max})`), `Total (/${max})`, 'Percent', 'Status', 'Teacher comment'];
    const lines = rows.map((r) => [
      r.submission.pupil, ...r.scores.map((v) => v ?? ''), r.total, `${Math.round((r.total / (max || 1)) * 100)}%`,
      r.submission.queued ? 'waiting to be marked' : r.unchecked ? `${r.unchecked} to check` : 'final', r.submission.comment ?? '',
    ]);
    const csv = [...letterhead, header, ...lines].map((l) => l.map(csvCell).join(',')).join('\n');
    downloadBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), registerFileName(assignment, 'csv'));
  }

  if (!rows.length) return <p className="font-hand text-3xl text-ink-soft">Mark a few students and their scores appear here, ready for your records.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-pen" onClick={() => void handleExcel()} disabled={isExporting}>
          {isExporting ? 'Building Excel file…' : 'Download Excel (.xlsx)'}
        </button>
        <button type="button" className="btn-ghost" onClick={handleCsv}>CSV</button>
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print register</button>
        <p className="text-ink-soft">{rows.length} students · class average {classAverage.toFixed(1)}/{max}</p>
      </div>
      {error && <p className="text-pen" role="alert">{error}</p>}
      {!profile.institution && (
        <p className="text-sm text-ink-soft">
          Tip: <Link to="/school" className="underline">add your school details</Link> to put your institution’s name on the register, the Excel file and every marked copy.
        </p>
      )}
      <p className="text-sm text-ink-soft">Click a student’s name or comment to edit it. Changes save automatically and go into the Excel file.</p>
      <div className="print-area overflow-x-auto">
        <div className="mb-2 hidden print:block">
          {profile.institution && <p className="font-display text-2xl font-bold">{profile.institution}</p>}
          {profile.details && <p className="text-sm">{profile.details}</p>}
        </div>
        <table className="w-full border-collapse bg-white text-sm">
          <caption className="p-2 text-left">
            {profile.institution && <span className="block text-xs font-semibold uppercase tracking-widest text-pen">{profile.institution}</span>}
            <span className="font-display text-xl font-bold">{assignment.title} — {assignment.className}</span>
            {profile.teacher && <span className="block text-xs text-ink-soft">Teacher: {profile.teacher}</span>}
          </caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="p-2 text-left">Student</th>
              {questions.map((q) => <th key={q.q} scope="col" className="p-2 text-center">Q{q.q}<span className="block text-xs font-normal text-ink-soft">/{q.max}</span></th>)}
              <th scope="col" className="p-2 text-center">Total<span className="block text-xs font-normal text-ink-soft">/{max}</span></th>
              <th scope="col" className="p-2 text-left">Status</th>
              <th scope="col" className="p-2 text-left">Teacher’s comment</th>
              <th scope="col" className="p-2 print:hidden"><span className="sr-only">Record</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.submission.id} className="border-b border-[oklch(90%_0.02_85)] align-top">
                <th scope="row" className="p-1 text-left font-semibold">
                  <EditableCell value={r.submission.pupil} label={`Student name for ${r.submission.pupil}`} maxLength={PUPIL_LIMIT}
                    onSave={(v) => updateSubmission(assignment.id, r.submission.id, { pupil: v })} />
                </th>
                {r.scores.map((v, i) => (
                  <td key={questions[i].q} className={`p-2 text-center font-hand text-xl ${v !== null && v < questions[i].max ? 'text-pen' : ''}`}>{v ?? '–'}</td>
                ))}
                <td className="p-2 text-center font-hand text-2xl text-pen">{r.total}</td>
                <td className="p-2 text-xs text-ink-soft">{r.submission.queued ? 'Waiting to be marked' : r.unchecked ? `${r.unchecked} to check` : 'Final'}</td>
                <td className="p-1">
                  <EditableCell value={r.submission.comment ?? ''} label={`Comment for ${r.submission.pupil}`} maxLength={COMMENT_LIMIT} multiline
                    onSave={(v) => updateSubmission(assignment.id, r.submission.id, { comment: v })} />
                </td>
                <td className="p-2 print:hidden">
                  <button type="button" className="whitespace-nowrap text-xs underline" aria-expanded={openId === r.submission.id}
                    onClick={() => setOpenId(openId === r.submission.id ? null : r.submission.id)}>
                    {openId === r.submission.id ? 'Close' : 'Marked copy'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <PupilRecord key={open.id} assignment={assignment} submission={open} profile={profile} />}
    </div>
  );
}

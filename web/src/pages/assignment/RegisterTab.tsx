import { useState } from 'react';
import { COMMENT_LIMIT, PUPIL_LIMIT, updateSubmission, type Assignment, type Submission } from '../../data/store';
import { useProfile } from '../../data/profile';
import { buildRegisterWorkbook, downloadBlob, registerFileName, registerRows } from '../../data/excel';
import { PupilRecord } from '../../components/PupilRecord';
import { friendlyCloudError } from '../../ai/errors';
import { Dialog, ErrorText, Field, GhostButton, PenButton } from '../../ui/Kit';

type Props = { assignment: Assignment; submissions: Submission[] };

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

type Editing = { submission: Submission; field: 'pupil' | 'comment' };

/** The class mark register — same layout and controls as the Android Mark register tab. */
export function RegisterTab({ assignment, submissions }: Props) {
  const profile = useProfile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questions = assignment.scheme.questions;
  const max = questions.reduce((a, q) => a + q.max, 0);
  const rows = registerRows(questions, submissions);
  const classAverage = rows.length ? rows.reduce((a, r) => a + r.total, 0) / rows.length : 0;
  const open = submissions.find((s) => s.id === openId);

  function startEdit(submission: Submission, field: Editing['field']) {
    setDraft(field === 'pupil' ? submission.pupil : submission.comment ?? '');
    setEditing({ submission, field });
  }

  function saveEdit() {
    if (!editing) return;
    updateSubmission(assignment.id, editing.submission.id, editing.field === 'pupil' ? { pupil: draft } : { comment: draft });
    setEditing(null);
  }

  async function handleExcel() {
    setError(null);
    setIsExporting(true);
    try {
      downloadBlob(await buildRegisterWorkbook(assignment, submissions, profile), registerFileName(assignment, 'xlsx'));
    } catch (e: unknown) {
      setError(`Could not build the file: ${friendlyCloudError(e).message}`);
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

  if (!rows.length) return <p className="p-4 font-hand text-[26px] text-ink-soft">Mark a few students and their scores appear here, ready for your records.</p>;

  const cell = 'px-1.5 py-1.5 align-top';
  return (
    <div className="grid gap-2.5 pb-10">
      {editing && (
        <Dialog title={editing.field === 'pupil' ? 'Student name' : `Comment for ${editing.submission.pupil}`} onClose={() => setEditing(null)} actions={<>
          <button type="button" className="btn-text" onClick={() => setEditing(null)}>Cancel</button>
          <button type="button" className="btn-text" onClick={saveEdit}>Save</button>
        </>}>
          <Field label={editing.field === 'pupil' ? 'Name or number' : 'Teacher’s comment'} value={draft} onChange={setDraft}
            multiline={editing.field === 'comment'} rows={3} maxLength={editing.field === 'pupil' ? PUPIL_LIMIT : COMMENT_LIMIT} />
        </Dialog>
      )}
      <div className="grid gap-2 px-4">
        <div className="grid grid-cols-[1.6fr_0.7fr] gap-2">
          <PenButton onClick={() => void handleExcel()} disabled={isExporting}>{isExporting ? 'Building Excel file…' : 'Download Excel (.xlsx)'}</PenButton>
          <GhostButton onClick={handleCsv}>CSV</GhostButton>
        </div>
        <GhostButton onClick={() => window.print()}>Print register</GhostButton>
        <p className="text-ink-soft">{rows.length} student{rows.length === 1 ? '' : 's'} · class average {classAverage.toFixed(1)}/{max}</p>
        {!profile.institution && (
          <p className="text-[13px] text-ink-soft">Tip: add your school details (header → School details) to put your institution’s name on the register, the Excel file and every marked copy.</p>
        )}
        <p className="text-[13px] text-ink-soft">Tap a student’s name or comment to edit it. Changes save automatically and go into the Excel file.</p>
      </div>
      <ErrorText message={error} />
      <div className="print-area grid gap-2.5">
        <div className="px-4">
          {profile.institution && <p className="text-[11px] font-semibold text-pen">{profile.institution.toUpperCase()}</p>}
          {profile.details && <p className="hidden text-sm print:block">{profile.details}</p>}
          <p className="font-display text-lg font-bold">{assignment.title} — {assignment.className}</p>
          {profile.teacher && <p className="text-xs text-ink-soft">Teacher: {profile.teacher}</p>}
        </div>
        <div className="mx-4 overflow-x-auto bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-ink text-white">
              <tr>
                <th scope="col" className={`${cell} min-w-[130px] py-2 text-left text-xs font-semibold`}>Student</th>
                {questions.map((q) => <th key={q.q} scope="col" className={`${cell} min-w-[54px] py-2 text-left text-xs font-semibold`}>Q{q.q} /{q.max}</th>)}
                <th scope="col" className={`${cell} min-w-[70px] py-2 text-left text-xs font-semibold`}>Total /{max}</th>
                <th scope="col" className={`${cell} min-w-[86px] py-2 text-left text-xs font-semibold`}>Status</th>
                <th scope="col" className={`${cell} min-w-[200px] py-2 text-left text-xs font-semibold`}>Teacher’s comment</th>
                <th scope="col" className={`${cell} min-w-[92px] print:hidden`}><span className="sr-only">Record</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.submission.id} className="border-b border-border">
                  <th scope="row" className={`${cell} text-left font-semibold`}>
                    <button type="button" className="text-left" aria-label={`Student name for ${r.submission.pupil}`} onClick={() => startEdit(r.submission, 'pupil')}>{r.submission.pupil}</button>
                  </th>
                  {r.scores.map((v, i) => (
                    <td key={questions[i].q} className={`${cell} font-hand text-xl ${v !== null && v < questions[i].max ? 'text-pen' : 'text-ink'}`}>{v ?? '–'}</td>
                  ))}
                  <td className={`${cell} font-hand text-xl text-pen`}>{r.total}</td>
                  <td className={`${cell} text-xs text-ink-soft`}>{r.submission.queued ? 'Waiting' : r.unchecked ? `${r.unchecked} to check` : 'Final'}</td>
                  <td className={cell}>
                    <button type="button" className={`text-left ${r.submission.comment ? 'font-hand text-xl text-pen' : 'text-xs text-ink-soft'}`}
                      aria-label={`Comment for ${r.submission.pupil}`} onClick={() => startEdit(r.submission, 'comment')}>
                      {r.submission.comment || 'Add a comment'}
                    </button>
                  </td>
                  <td className={`${cell} print:hidden`}>
                    <button type="button" className="btn-text !text-xs" aria-expanded={openId === r.submission.id}
                      onClick={() => setOpenId(openId === r.submission.id ? null : r.submission.id)}>
                      {openId === r.submission.id ? 'Close' : 'Marked copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <PupilRecord key={open.id} assignment={assignment} submission={open} profile={profile} />}
    </div>
  );
}

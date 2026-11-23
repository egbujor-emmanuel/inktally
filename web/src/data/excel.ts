// Real .xlsx mark register with the institution letterhead, per-question scores, totals and comments.
// exceljs is loaded only when the teacher downloads, so it never slows the app down.
import { qLabel } from '../domain/types';
import type { Font } from 'exceljs';
import type { Question } from '../domain/types';
import type { Profile } from './profile';
import type { Assignment, Submission } from './store';

export interface RegisterRow { submission: Submission; scores: (number | null)[]; total: number; unchecked: number }

/** Neutralise spreadsheet formula injection in any text a teacher or pupil typed. */
export const safeText = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function registerRows(questions: Question[], submissions: Submission[]): RegisterRow[] {
  return submissions.map((s) => {
    const scores = questions.map((q) => s.marks.find((m) => m.q === q.q)?.awarded ?? null);
    return {
      submission: s,
      scores,
      total: scores.reduce<number>((a, v) => a + (v ?? 0), 0),
      unchecked: s.marks.filter((m) => m.status === 'flagged' || m.status === 'provisional').length,
    };
  });
}

export const registerFileName = (assignment: Assignment, ext: string): string =>
  `${assignment.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'marks'}-marks.${ext}`;

export async function buildRegisterWorkbook(assignment: Assignment, submissions: Submission[], profile: Profile): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const questions = assignment.scheme.questions;
  const max = questions.reduce((a, q) => a + q.max, 0);
  const rows = registerRows(questions, submissions);
  const wb = new ExcelJS.Workbook();
  wb.creator = profile.teacher || 'REDPEN';
  const ws = wb.addWorksheet('Mark register', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const totalCol = questions.length + 2;
  const percentCol = questions.length + 3;
  const statusCol = questions.length + 4;
  const commentCol = questions.length + 5;

  let r = 1;
  const heading = (text: string, font: Partial<Font>) => {
    const cell = ws.getCell(r, 1);
    cell.value = safeText(text);
    cell.font = font;
    ws.mergeCells(r, 1, r, commentCol);
    r += 1;
  };
  if (profile.institution) heading(profile.institution, { bold: true, size: 16, color: { argb: 'FF1F2A44' } });
  if (profile.details) heading(profile.details, { size: 10, color: { argb: 'FF5B6273' } });
  heading(`${assignment.title} — ${assignment.className}${assignment.scheme.subject ? ` · ${assignment.scheme.subject}` : ''}`, { bold: true, size: 13 });
  heading(`${profile.teacher ? `Teacher: ${profile.teacher} · ` : ''}Exported ${new Date().toLocaleDateString()} · Marked with REDPEN`, { size: 10, italic: true, color: { argb: 'FF5B6273' } });
  r += 1;

  const headerRow = ws.getRow(r);
  headerRow.values = ['Student', ...questions.map((q) => `Q${qLabel(q)} (/${q.max})`), `Total (/${max})`, 'Percent', 'Status', 'Teacher’s comment'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2A44' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: r }];
  r += 1;

  for (const row of rows) {
    const xr = ws.getRow(r);
    xr.values = [
      safeText(row.submission.pupil), ...row.scores.map((v) => v ?? ''), row.total, max ? row.total / max : 0,
      row.submission.queued ? 'Waiting to be marked' : row.unchecked ? `${row.unchecked} to check` : 'Marked', safeText(row.submission.comment ?? ''),
    ];
    xr.getCell(percentCol).numFmt = '0%';
    xr.getCell(totalCol).font = { bold: true, color: { argb: 'FFC8102E' } };
    xr.getCell(commentCol).alignment = { wrapText: true, vertical: 'top' };
    xr.eachCell((c) => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE5DECF' } } }; });
    r += 1;
  }
  if (rows.length) {
    const avg = ws.getRow(r + 1);
    avg.getCell(1).value = 'Class average';
    avg.getCell(1).font = { bold: true };
    questions.forEach((_, i) => {
      avg.getCell(i + 2).value = rows.reduce((a, x) => a + (x.scores[i] ?? 0), 0) / rows.length;
      avg.getCell(i + 2).numFmt = '0.0';
    });
    avg.getCell(totalCol).value = rows.reduce((a, x) => a + x.total, 0) / rows.length;
    avg.getCell(totalCol).numFmt = '0.0';
    avg.getCell(totalCol).font = { bold: true };
  }
  ws.getColumn(1).width = 26;
  questions.forEach((_, i) => { ws.getColumn(i + 2).width = 9; });
  ws.getColumn(totalCol).width = 11;
  ws.getColumn(percentCol).width = 9;
  ws.getColumn(statusCol).width = 12;
  ws.getColumn(commentCol).width = 48;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

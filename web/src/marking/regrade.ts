// "Accept for everyone": when the teacher adds an answer to the scheme, every student already marked with that
// answer is re-scored from their stored reading. No new AI call is needed, because code does the marking.
import type { Mark, Question } from '../domain/types';
import { markNumeric, markShort } from './engine';

export interface Regraded { submissionId: string; marks: Mark[]; gained: number }

/** Re-marks one stored mark against the updated question. Teacher-set marks are never touched. */
export function regradeMark(question: Question, mark: Mark): Mark {
  if (mark.q !== question.q || mark.status === 'reviewed' || mark.engine === 'teacher') return mark;
  const next = question.type === 'short' ? markShort(question, mark.read, mark.readSource)
    : question.type === 'numeric' ? markNumeric(question, mark.read, mark.readSource)
    : null;
  if (!next || next.awarded <= mark.awarded) return mark;
  return { ...next, reasons: [...next.reasons, 'Re-marked after the teacher accepted this answer for everyone.'] };
}

/** Every submission whose score for this question goes up under the updated question. */
export function regradeAll(question: Question, submissions: { id: string; marks: Mark[] }[]): Regraded[] {
  const out: Regraded[] = [];
  for (const s of submissions) {
    let gained = 0;
    const marks = s.marks.map((m) => {
      const next = regradeMark(question, m);
      gained += next.awarded - m.awarded;
      return next;
    });
    if (gained > 0) out.push({ submissionId: s.id, marks, gained });
  }
  return out;
}

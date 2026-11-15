// Editing the answer key after marking. Every student already marked is re-marked from their STORED reading, so no
// new AI call is needed for numbers, letters and words (code does the marking). A theory answer whose marking points
// changed is flagged for the teacher instead of being re-judged silently. Teacher-set marks are never touched.
import type { Mark, Question } from '../domain/types';
import { markNumeric, markObjective, markShort } from './engine';

export const REMARK_REASON = 'Re-marked after the answer key was edited.';
export const POINTS_CHANGED_REASON = 'The marking points for this question changed — check this answer again.';

export interface RemarkSummary { students: number; up: number; down: number; toCheck: number }
export interface RemarkResult { updates: { submissionId: string; marks: Mark[] }[]; summary: RemarkSummary }

const sameQuestion = (a: Question | undefined, b: Question | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Reasons that carry the hybrid safety net: a cloud confirmation, a held reading, a device/cloud disagreement. */
const KEEP_REASON = /confirmed by the cloud check|^Held for checking:|Which is right\?|^The device read /i;

/** One stored mark under the edited question (or unchanged when the question did not change). */
export function remarkOne(before: Question | undefined, after: Question | undefined, mark: Mark): Mark {
  if (!after || mark.status === 'reviewed' || mark.engine === 'teacher' || sameQuestion(before, after)) return mark;
  // Nothing was read (a failed read): there is nothing to re-mark, and the "could not read" flag must stay.
  if (mark.status === 'flagged' && !mark.read.trim()) return mark;
  // Theory points and method marks were judged by the model, not by code: never re-judge them silently.
  if (after.type === 'points' || mark.engine === 'ai-points') {
    const awarded = Math.min(mark.awarded, after.max);
    return { ...mark, max: after.max, awarded, status: 'flagged', reasons: [...mark.reasons, POINTS_CHANGED_REASON] };
  }
  const next = after.type === 'objective' ? markObjective(after, mark.read, mark.readSource)
    : after.type === 'numeric' ? markNumeric(after, mark.read, mark.readSource)
    : markShort(after, mark.read, mark.readSource);
  // Flags survive re-marking ("Check this", "Which is right?"); a reading waiting for the cloud check keeps waiting;
  // a mark that was confirmed by the cloud keeps that confirmation (the reading itself did not change).
  const status = mark.status === 'flagged' || next.status === 'flagged' ? 'flagged' : mark.status === 'provisional' ? 'provisional' : next.status;
  const kept = mark.reasons.filter((r) => KEEP_REASON.test(r));
  return { ...next, status, reasons: [...next.reasons, ...kept, REMARK_REASON] };
}

/** Re-marks every student for the edited key and counts what changed, for "3 went up, 1 went down, 2 to check". */
export function remarkAll(before: Question[], after: Question[], submissions: { id: string; marks: Mark[] }[]): RemarkResult {
  const summary: RemarkSummary = { students: 0, up: 0, down: 0, toCheck: 0 };
  const updates: RemarkResult['updates'] = [];
  for (const s of submissions) {
    let changed = false;
    const marks = s.marks.map((m) => {
      const next = remarkOne(before.find((q) => q.q === m.q), after.find((q) => q.q === m.q), m);
      if (next === m) return m;
      changed = true;
      if (next.awarded > m.awarded) summary.up += 1;
      if (next.awarded < m.awarded) summary.down += 1;
      if (next.status === 'flagged' && m.status !== 'flagged') summary.toCheck += 1;
      return next;
    });
    if (changed) { updates.push({ submissionId: s.id, marks }); summary.students += 1; }
  }
  return { updates, summary };
}

/** The notice after saving (same wording on Android). */
export function remarkNotice(s: RemarkSummary): string {
  if (!s.students) return 'Answer key saved. No marks changed.';
  const parts = [`${s.up} answer${s.up === 1 ? '' : 's'} went up`, `${s.down} went down`];
  if (s.toCheck) parts.push(`${s.toCheck} to check`);
  return `Answer key saved. Re-marked ${s.students} student${s.students === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}

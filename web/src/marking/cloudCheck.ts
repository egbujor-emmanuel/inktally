// The cloud check: every provisional (on-device) or flagged mark is re-read by the cloud model and reconciled.
// Runs automatically when the device is back online (useCloudCheck) and on demand from the Review tab.
import type { Mark, Question } from '../domain/types';
import { loadCrop, saveMarks, PAGE_KEY, type Assignment, type Submission } from '../data/store';
import { batchingEnabled } from '../ai/batch';
import { friendlyCloudError } from '../ai/errors';
import { awaitsCheck, verifyMark, verifyMarksBatch, verifyPage } from './markAnswer';
import { isCrossChecked } from './statusLabel';
import { learnFromCheck, type ReadingHint } from './learning';
import { addReadingHints } from '../data/store';
import { isPrivate } from '../ai/privacy';

export const needsCheck = awaitsCheck;

export interface CheckSummary {
  /** Answers sent to the cloud. */
  checked: number;
  /** On-device marks the cloud agreed with. */
  confirmed: number;
  /** Answers that now need the teacher (disagreement or unreadable). */
  needTeacher: number;
  /** New handwriting hints the device learned from this check. */
  learned?: number;
}

export interface CheckHooks {
  /** Newest marks from the database, so a long check never overwrites a score the teacher set meanwhile. */
  latest: () => Submission[];
  onProgress?: (done: number, total: number) => void;
  onError?: (message: string) => void;
}

/** Keeps any mark the teacher reviewed while the check was running. */
export function keepReviewed(now: Mark[], next: Mark[]): Mark[] {
  return next.map((m) => { const cur = now.find((x) => x.q === m.q); return cur?.status === 'reviewed' ? cur : m; });
}

/** Counts how a set of checked marks came out, for the "8 confirmed, 1 needs you" summary. */
export function summarise(before: Mark[], after: Mark[]): CheckSummary {
  let checked = 0, confirmed = 0, needTeacher = 0;
  for (const b of before.filter(needsCheck)) {
    const a = after.find((m) => m.q === b.q);
    if (!a || a === b) continue;
    checked += 1;
    if (a.status === 'flagged') needTeacher += 1;
    else if (b.readSource === 'on_device' && isCrossChecked(a)) confirmed += 1;
  }
  return { checked, confirmed, needTeacher };
}

async function checkOne(assignment: Assignment, s: Submission): Promise<Mark[]> {
  const questions = assignment.scheme.questions;
  const page = await loadCrop(s.id, PAGE_KEY);
  if (page) return verifyPage(questions, page, s.marks);
  const pending = s.marks.filter(needsCheck);
  // One cloud request for all of this student's answers that need checking.
  if (batchingEnabled() && pending.length > 1) {
    const crops: { q: number; type: Question['type']; blob: Blob }[] = [];
    for (const m of pending) {
      const question = questions.find((q) => q.q === m.q);
      const blob = await loadCrop(s.id, m.q);
      if (question && blob) crops.push({ q: m.q, type: question.type, blob });
    }
    try { return await verifyMarksBatch(questions, crops, s.marks); } catch { /* fall back to one answer at a time */ }
  }
  const next: Mark[] = [];
  for (const m of s.marks) {
    const question = questions.find((q) => q.q === m.q);
    const crop = needsCheck(m) ? await loadCrop(s.id, m.q) : undefined;
    next.push(question && crop ? await verifyMark(question, crop, m) : m);
  }
  return next;
}

/** Checks every student with marks that need it. One failing student never stops the rest. */
export async function cloudCheck(assignment: Assignment, submissions: Submission[], hooks: CheckHooks): Promise<CheckSummary> {
  // Private mode: pupils' work never goes to the cloud, so there is no second reading; the teacher checks instead.
  if (isPrivate()) return { checked: 0, confirmed: 0, needTeacher: 0 };
  const targets = submissions.filter((s) => !s.queued && s.marks.some(needsCheck));
  const total = targets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const summary: CheckSummary = { checked: 0, confirmed: 0, needTeacher: 0 };
  let done = 0;
  const learned: ReadingHint[] = [];
  hooks.onProgress?.(0, total);
  for (const s of targets) {
    if (isPrivate()) break; // switched on mid-check: stop quietly, nothing more is sent
    if (!navigator.onLine) break;
    try {
      const checked = await checkOne(assignment, s);
      const now = hooks.latest().find((x) => x.id === s.id)?.marks ?? s.marks;
      const merged = keepReviewed(now, checked);
      const part = summarise(s.marks, merged);
      summary.checked += part.checked; summary.confirmed += part.confirmed; summary.needTeacher += part.needTeacher;
      if (part.checked) await saveMarks(assignment.id, s.id, merged);
      learned.push(...learnFromCheck(assignment.scheme.questions, s.marks, merged));
    } catch (e: unknown) {
      hooks.onError?.(friendlyCloudError(e).message);
    }
    done += s.marks.filter(needsCheck).length;
    hooks.onProgress?.(done, total);
  }
  if (learned.length) {
    try { summary.learned = await addReadingHints(assignment.id, learned); } catch (e: unknown) { hooks.onError?.(friendlyCloudError(e).message); }
  }
  return summary;
}

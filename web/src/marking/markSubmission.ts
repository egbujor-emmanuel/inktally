// One student's photo -> marks + marked copy. Shared by the Mark tab (marking now) and the offline queue
// (marking later, when a device without on-device AI gets its connection back).
import type { Assignment } from '../data/store';
import { MARKED_KEY, PAGE_KEY, saveCrop, saveMarks } from '../data/store';
import type { Mark } from '../domain/types';
import { markAnswer, markAnswersBatch, markPage } from './markAnswer';
import { learnedHint } from './learning';
import { config } from '../ai/models';
import { batchingEnabled } from '../ai/batch';
import { cloudWillRead } from '../ai/models';
import { layoutSheet } from '../scan/layout';
import { scanSheet } from '../scan/pipeline';
import { markedPageCopy, markedSheetCopy } from '../scan/markedCopy';
import { friendlyCloudError } from '../ai/errors';

export type CaptureMode = 'sheet' | 'page';

export interface MarkProgress {
  marks: Mark[];
  total: number;
  /** Answer-box images (data URLs) by question number, for the UI. */
  crops?: Record<number, string>;
}

export type MarkOutcome =
  | { ok: true; marks: Mark[]; copy: Blob | null }
  | { ok: false; reason: string };

export function failedMark(q: number, max: number, error: unknown): Mark {
  // Teachers see a short, plain reason — never a raw API error dump.
  const message = friendlyCloudError(error).message.replace(/\s*\(.*$/s, '');
  return {
    q, max, read: '', readSource: 'on_device', awarded: 0, engine: 'code', status: 'flagged',
    reasons: [`Could not read this answer (${message}). Check it by hand or retry when online.`],
  };
}

/** Best effort: the marks are already saved if building the copy fails. */
async function buildCopy(submissionId: string, build: () => Promise<Blob>): Promise<Blob | null> {
  try {
    const blob = await build();
    await saveCrop(submissionId, MARKED_KEY, blob);
    return blob;
  } catch {
    return null;
  }
}

/** Printed REDPEN sheet: find the corner squares, cut out each answer box, read + mark each one. */
export async function markSheetSubmission(
  assignment: Assignment, photo: Blob, pageIndex: number, submissionId: string, label: string,
  onProgress?: (p: MarkProgress) => void, failFast = false,
): Promise<MarkOutcome> {
  const page = layoutSheet(assignment.scheme.questions)[pageIndex];
  if (!page) return { ok: false, reason: `This assignment has no sheet page ${pageIndex + 1}.` };
  const scan = await scanSheet(photo, page.boxes);
  if (!scan.ok) return { ok: false, reason: scan.reason };
  const crops = Object.fromEntries(scan.crops.map((c) => [c.q, c.dataUrl]));
  const collected: Mark[] = [];
  onProgress?.({ marks: [], total: scan.crops.length, crops });
  for (const crop of scan.crops) await saveCrop(submissionId, crop.q, crop.blob);
  // Reading goes to the cloud anyway: do the whole sheet in one request (falls back to one-by-one if that fails).
  if (batchingEnabled() && navigator.onLine && cloudWillRead()) {
    const toRead = scan.crops.flatMap((c) => { const q = assignment.scheme.questions.find((x) => x.q === c.q); return q ? [{ q: c.q, type: q.type, blob: c.blob }] : []; });
    try {
      const marks = await markAnswersBatch(assignment.scheme.questions, toRead);
      onProgress?.({ marks, total: scan.crops.length, crops });
      await saveMarks(assignment.id, submissionId, marks);
      const copy = await buildCopy(submissionId, () => markedSheetCopy(photo, scan.sheetToPhoto, page.boxes, marks, label));
      return { ok: true, marks, copy };
    } catch (e: unknown) { if (failFast) throw e; /* otherwise fall through to one-by-one reading */ }
  }
  for (const crop of scan.crops) {
    const question = assignment.scheme.questions.find((q) => q.q === crop.q);
    if (!question) continue;
    let mark: Mark;
    const learned = config('device_learning') === 'true' ? learnedHint(assignment.readingHints, question.type) : '';
    try { mark = await markAnswer(question, crop.blob, undefined, learned); } catch (e: unknown) { if (failFast) throw e; mark = failedMark(question.q, question.max, e); }
    collected.push(mark);
    onProgress?.({ marks: [...collected], total: scan.crops.length, crops });
    await saveMarks(assignment.id, submissionId, collected);
  }
  const copy = await buildCopy(submissionId, () => markedSheetCopy(photo, scan.sheetToPhoto, page.boxes, collected, label));
  return { ok: true, marks: collected, copy };
}

/** Exercise-book page: one whole-page read, then code marks each question. */
export async function markPageSubmission(
  assignment: Assignment, photo: Blob, submissionId: string, label: string,
  onProgress?: (p: MarkProgress) => void,
): Promise<MarkOutcome> {
  await saveCrop(submissionId, PAGE_KEY, photo);
  onProgress?.({ marks: [], total: assignment.scheme.questions.length });
  const collected = await markPage(assignment.scheme.questions, photo);
  onProgress?.({ marks: collected, total: collected.length });
  await saveMarks(assignment.id, submissionId, collected);
  const copy = await buildCopy(submissionId, () => markedPageCopy(photo, collected, label));
  return { ok: true, marks: collected, copy };
}

/**
 * failFast (used by the offline queue): a read error throws instead of becoming a flagged "could not read" mark,
 * so a dropped connection leaves the student queued for a later retry rather than finishing them with failed marks.
 */
export function markSubmission(
  assignment: Assignment, mode: CaptureMode, photo: Blob, pageIndex: number, submissionId: string, label: string,
  onProgress?: (p: MarkProgress) => void, failFast = false,
): Promise<MarkOutcome> {
  return mode === 'page'
    ? markPageSubmission(assignment, photo, submissionId, label, onProgress)
    : markSheetSubmission(assignment, photo, pageIndex, submissionId, label, onProgress, failFast);
}

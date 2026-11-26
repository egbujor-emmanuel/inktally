// Orchestrates one answer: AI reads (hybrid) -> code marks; theory points get per-point AI checks.
// verifyMark() re-reads provisional/flagged marks with the cloud model once the device is online.
import { InferenceMode } from 'firebase/ai';
import type { Mark, NumericQuestion, Question, ReadSource } from '../domain/types';
import { checkPoints } from '../ai/points';
import { readAnswer } from '../ai/read';
import { readPage } from '../ai/readPage';
import { checkPointsBatch, readAnswersBatch, type CropToRead } from '../ai/batch';
import type { ReadMode } from '../ai/models';
import { flagNearMiss, markNumeric, markObjective, markPoints, markShort } from './engine';
import { parseNumericAnswer, textSimilarity, workingSteps } from './normalize';
import { contradictionReason, workingContradictsKey } from './working';
import { batchingEnabled } from '../ai/batch';
import { isHeld } from './learning';
import { isPrivate } from '../ai/privacy';

/**
 * Marking-point checks: one request for all of a question's points when the answer was read in the cloud (fast, and
 * the cloud model handles the longer prompt); one small request per point on the device (Gemini Nano's limits).
 */
async function judgePoints(read: string, points: readonly string[], reject: readonly string[], source: ReadSource, mode: ReadMode | undefined, question: string): Promise<{ found: string[]; rejected: string[] }> {
  if (source === 'in_cloud' && batchingEnabled()) return checkPointsBatch(read, points, reject, question);
  const { found, rejected } = await checkPoints(read, points, reject, mode, question);
  return { found, rejected };
}

async function markFromRead(question: Question, read: string, source: ReadSource, mode?: ReadMode): Promise<Mark> {
  switch (question.type) {
    case 'objective': return markObjective(question, read, source);
    case 'short': return markShort(question, read, source);
    case 'numeric': return markNumericWithMethod(question, read, source, mode);
    case 'points': {
      const { found, rejected } = await judgePoints(read, question.points, question.reject ?? [], source, mode, question.prompt);
      return markPoints(question, read, source, found, rejected);
    }
  }
}

/** Wrong final answer but correct working still earns method marks (WAEC-style). */
async function markNumericWithMethod(question: NumericQuestion, read: string, source: ReadSource, mode?: ReadMode): Promise<Mark> {
  return flagNearMiss(question, await withMethodMarks(question, markNumeric(question, read, source), read, async (steps) => (await judgePoints(read, steps, [], source, mode, question.prompt)).found));
}

/**
 * A wrong final answer can still earn method marks, but only when the working follows the key: correct arithmetic
 * that lands on the student's own wrong answer means a different formula, so no method mark and the teacher checks it.
 */
async function withMethodMarks(question: NumericQuestion, base: Mark, read: string, judge: (steps: string[]) => Promise<string[]>): Promise<Mark> {
  const steps = workingSteps(question.methodPoints);
  if (base.awarded > 0 || !steps.length || base.status === 'flagged') return base;
  const contradiction = workingContradictsKey(read, parseNumericAnswer(read).value, question.accept, steps);
  if (contradiction) return { ...base, status: 'flagged', reasons: [...base.reasons, contradictionReason(contradiction)] };
  const found = await judge(steps);
  if (!found.length) return base;
  return {
    ...base, awarded: Math.min(found.length, question.max - 1), engine: 'ai-points', pointsFound: found,
    reasons: [...base.reasons, `Method marks for: ${found.join('; ')}.`],
  };
}

/** Cloud marking of a whole sheet in as few requests as possible: one read for every box, one point check per theory answer. */
export async function markAnswersBatch(questions: Question[], crops: CropToRead[], kind: 'read' | 'verify' = 'read'): Promise<Mark[]> {
  const reads = await readAnswersBatch(crops, kind);
  const marks: Mark[] = [];
  for (const crop of crops) {
    const question = questions.find((q) => q.q === crop.q);
    if (!question) continue;
    // The model left this answer out: fall back to one-by-one reading rather than scoring an unread answer.
    if (!reads.has(crop.q)) throw new Error(`The cloud did not return answer ${crop.q}`);
    const read = reads.get(crop.q) ?? '';
    if (question.type === 'points') {
      const { found, rejected } = await checkPointsBatch(read, question.points, question.reject, question.prompt);
      marks.push(markPoints(question, read, 'in_cloud', found, rejected));
    } else if (question.type === 'numeric') {
      marks.push(flagNearMiss(question, await withMethodMarks(question, markNumeric(question, read, 'in_cloud'), read, async (steps) => (await checkPointsBatch(read, steps, [], question.prompt)).found)));
    } else {
      marks.push(question.type === 'objective' ? markObjective(question, read, 'in_cloud') : markShort(question, read, 'in_cloud'));
    }
  }
  return marks;
}

/** Cloud check of several provisional/flagged answers from one student in a single read request. */
export async function verifyMarksBatch(questions: Question[], crops: CropToRead[], previous: Mark[]): Promise<Mark[]> {
  const cloud = await markAnswersBatch(questions, crops, 'verify');
  return previous.map((p) => { const c = cloud.find((m) => m.q === p.q); return c ? reconcile(p, c) : p; });
}

export async function markAnswer(question: Question, crop: Blob, mode?: ReadMode): Promise<Mark> {
  const { text, source } = await readAnswer(crop, question.type, mode);
  return markFromRead(question, text, source, mode);
}

const PAGE_PRIVATE_WARNING = 'Read on this device from the whole page (Private mode: nothing goes to the cloud). On-device page reading can auto-correct mistakes, so check this mark.';
const PAGE_ON_DEVICE_WARNING = 'Read offline from the whole page — on-device page reading can auto-correct mistakes, so this waits for the cloud check.';

/** Exercise-book mode: one page read, then code marks each question. On-device page reads are never trusted as final. */
export async function markPage(questions: Question[], photo: Blob, mode?: ReadMode): Promise<Mark[]> {
  const { answers, source } = await readPage(photo, questions, mode);
  const marks: Mark[] = [];
  for (const question of questions) {
    const mark = await markFromRead(question, answers.get(question.q) ?? '', source, mode);
    marks.push(source === 'on_device' && mark.status !== 'flagged'
      ? { ...mark, status: 'provisional', reasons: [...mark.reasons, isPrivate() ? PAGE_PRIVATE_WARNING : PAGE_ON_DEVICE_WARNING] }
      : mark);
  }
  return marks;
}

/** Re-marks a whole exercise-book page in the cloud and reconciles the marks that were waiting for it. */
export async function verifyPage(questions: Question[], photo: Blob, previous: Mark[]): Promise<Mark[]> {
  const cloud = await markPage(questions, photo, InferenceMode.ONLY_IN_CLOUD);
  return previous.map((p) => {
    // Marks that are already final (a cloud read, or one the teacher set) are never changed by a re-read of the page.
    if (!awaitsCheck(p)) return p;
    const c = cloud.find((m) => m.q === p.q);
    return c ? reconcile(p, c) : p;
  });
}

/** Re-marks with the cloud model. Agreement verifies the mark; disagreement goes to the teacher with both readings. */
export async function verifyMark(question: Question, crop: Blob, previous: Mark): Promise<Mark> {
  if (previous.status === 'reviewed') return previous;
  return reconcile(previous, await markAnswer(question, crop, InferenceMode.ONLY_IN_CLOUD));
}

/** A mark the cloud check still has to look at: an on-device read, or an answer that could not be read with confidence. */
export const awaitsCheck = (m: Mark): boolean => m.status === 'provisional' || m.status === 'flagged';

export const CONFIRMED_ON_DEVICE = 'On-device mark confirmed by the cloud check.';
export const CONFIRMED_CLOUD = 'Confirmed by the cloud check.';
/** At or above this similarity two readings of a written answer are the same reading. */
const SAME_READING = 0.8;
const squash = (text: string): string => text.toLowerCase().replace(/[\s,.;:'"`]/g, '');

/** True when two models read the same thing (case, spacing and punctuation aside; small slips allowed in longer text). */
export function sameReading(a: string, b: string): boolean {
  const x = squash(a), y = squash(b);
  if (x === y) return true;
  return x.length > 1 && y.length > 1 && textSimilarity(a, b) >= SAME_READING;
}

/**
 * Second opinion. A mark is "confirmed" only when there were two real readings that agree on what is written AND on the
 * score. An answer the device failed or was unsure about has no first reading, so the cloud's read stands on its own
 * (shown as "Cloud read"); a real device reading with a different score goes to the teacher with both readings.
 */
export function reconcile(previous: Mark, cloud: Mark): Mark {
  if (previous.status === 'reviewed') return previous;
  const sameScore = cloud.awarded === previous.awarded;
  // A reading held because it matched a known misread is still a real reading: the cloud check compares it as usual.
  const deviceRead = previous.readSource === 'on_device' && (previous.status === 'provisional' || isHeld(previous));
  const realFirstRead = deviceRead || previous.status === 'verified';
  if (realFirstRead && sameScore && cloud.status !== 'flagged' && sameReading(previous.read, cloud.read)) {
    return { ...cloud, reasons: [...cloud.reasons, previous.readSource === 'on_device' ? CONFIRMED_ON_DEVICE : CONFIRMED_CLOUD] };
  }
  if (deviceRead) {
    if (!sameScore) {
      return {
        ...cloud, status: 'flagged',
        reasons: [`Device read "${previous.read}" (${previous.awarded}/${previous.max}); cloud read "${cloud.read}" (${cloud.awarded}/${cloud.max}). Which is right?`],
      };
    }
    if (!sameReading(previous.read, cloud.read)) {
      return { ...cloud, reasons: [...cloud.reasons, `The device read "${previous.read}"; the cloud's reading is used (same mark).`] };
    }
  }
  return cloud;
}

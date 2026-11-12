// Orchestrates one answer: AI reads (hybrid) -> code marks; theory points get per-point AI checks.
// verifyMark() re-reads provisional/flagged marks with the cloud model once the device is online.
import { InferenceMode } from 'firebase/ai';
import type { Mark, NumericQuestion, Question, ReadSource } from '../domain/types';
import { checkPoints } from '../ai/points';
import { readAnswer } from '../ai/read';
import { readPage } from '../ai/readPage';
import type { ReadMode } from '../ai/models';
import { markNumeric, markObjective, markPoints, markShort } from './engine';

async function markFromRead(question: Question, read: string, source: ReadSource, mode?: ReadMode): Promise<Mark> {
  switch (question.type) {
    case 'objective': return markObjective(question, read, source);
    case 'short': return markShort(question, read, source);
    case 'numeric': return markNumericWithMethod(question, read, source, mode);
    case 'points': {
      const { found, rejected } = await checkPoints(read, question.points, question.reject, mode);
      return markPoints(question, read, source, found, rejected);
    }
  }
}

/** Wrong final answer but correct working still earns method marks (WAEC-style). */
async function markNumericWithMethod(question: NumericQuestion, read: string, source: ReadSource, mode?: ReadMode): Promise<Mark> {
  const base = markNumeric(question, read, source);
  if (base.awarded > 0 || !question.methodPoints?.length || base.status === 'flagged') return base;
  const { found } = await checkPoints(read, question.methodPoints, [], mode);
  if (!found.length) return base;
  const methodMarks = Math.min(found.length, question.max - 1);
  return {
    ...base, awarded: methodMarks, engine: 'ai-points', pointsFound: found,
    reasons: [...base.reasons, `Method marks for: ${found.join('; ')}.`],
  };
}

export async function markAnswer(question: Question, crop: Blob, mode?: ReadMode): Promise<Mark> {
  const { text, source } = await readAnswer(crop, question.type, mode);
  return markFromRead(question, text, source, mode);
}

const PAGE_ON_DEVICE_WARNING = 'Read offline from the whole page — on-device page reading can auto-correct mistakes, so this waits for the cloud check.';

/** Exercise-book mode: one page read, then code marks each question. On-device page reads are never trusted as final. */
export async function markPage(questions: Question[], photo: Blob, mode?: ReadMode): Promise<Mark[]> {
  const { answers, source } = await readPage(photo, questions.map((q) => q.q), mode);
  const marks: Mark[] = [];
  for (const question of questions) {
    const mark = await markFromRead(question, answers.get(question.q) ?? '', source, mode);
    marks.push(source === 'on_device' && mark.status !== 'flagged'
      ? { ...mark, status: 'provisional', reasons: [...mark.reasons, PAGE_ON_DEVICE_WARNING] }
      : mark);
  }
  return marks;
}

/** Re-marks a whole exercise-book page in the cloud and reconciles each previous mark. */
export async function verifyPage(questions: Question[], photo: Blob, previous: Mark[]): Promise<Mark[]> {
  const cloud = await markPage(questions, photo, InferenceMode.ONLY_IN_CLOUD);
  return previous.map((p) => {
    const c = cloud.find((m) => m.q === p.q);
    return c ? reconcile(p, c) : p;
  });
}

/** Re-marks with the cloud model. Agreement verifies the mark; disagreement goes to the teacher with both readings. */
export async function verifyMark(question: Question, crop: Blob, previous: Mark): Promise<Mark> {
  if (previous.status === 'reviewed') return previous;
  return reconcile(previous, await markAnswer(question, crop, InferenceMode.ONLY_IN_CLOUD));
}

function reconcile(previous: Mark, cloud: Mark): Mark {
  if (previous.status === 'reviewed') return previous;
  const sameScore = cloud.awarded === previous.awarded;
  if (sameScore && cloud.status !== 'flagged') {
    return { ...cloud, reasons: [...cloud.reasons, previous.readSource === 'on_device' ? 'On-device mark confirmed by the cloud check.' : 'Confirmed by the cloud check.'] };
  }
  if (previous.readSource === 'on_device' && !sameScore) {
    return {
      ...cloud, status: 'flagged',
      reasons: [`Device read "${previous.read}" (${previous.awarded}/${previous.max}); cloud read "${cloud.read}" (${cloud.awarded}/${cloud.max}). Which is right?`],
    };
  }
  return cloud;
}

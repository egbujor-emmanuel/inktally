// Orchestrates one answer: AI reads (hybrid) -> code marks; theory points get per-point AI checks.
// verifyMark() re-reads provisional/flagged marks with the cloud model once the device is online.
import { InferenceMode } from 'firebase/ai';
import type { Mark, NumericQuestion, Question, ReadSource } from '../domain/types';
import { checkPoints } from '../ai/points';
import { readAnswer } from '../ai/read';
import type { ReadMode } from '../ai/models';
import { markNumeric, markObjective, markPoints, markShort } from './engine';

async function markFromRead(question: Question, read: string, source: ReadSource, mode?: ReadMode): Promise<Mark> {
  switch (question.type) {
    case 'objective': return markObjective(question, read, source);
    case 'short': return markShort(question, read, source);
    case 'numeric': return markNumericWithMethod(question, read, source, mode);
    case 'points': {
      const { found } = await checkPoints(read, question.points, question.reject, mode);
      return markPoints(question, read, source, found);
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

/** Re-marks with the cloud model. Agreement verifies the mark; disagreement goes to the teacher with both readings. */
export async function verifyMark(question: Question, crop: Blob, previous: Mark): Promise<Mark> {
  if (previous.status === 'reviewed') return previous;
  const cloud = await markAnswer(question, crop, InferenceMode.ONLY_IN_CLOUD);
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

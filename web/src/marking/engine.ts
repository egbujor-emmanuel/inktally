// Deterministic marking. Models only READ handwriting (and answer yes/no per marking point);
// every score is computed here, so a model can never "decide" a wrong answer is right.
import type {
  Mark, MarkStatus, NumericQuestion, ObjectiveQuestion, PointsQuestion, ReadSource, ShortQuestion,
} from '../domain/types';
import { normalizeOptionLetter, parseNumericAnswer, textSimilarity } from './normalize';

const DEFAULT_TOLERANCE = 1e-9;
/** At or above this similarity a short answer counts as a match (spelling slips allowed). */
const SHORT_MATCH = 0.8;
/** Between this and SHORT_MATCH the app cannot decide and asks the teacher. */
const SHORT_UNSURE = 0.5;

/** Shortest fragment treated as a possibly cut-off or partly misread answer. */
const MIN_FRAGMENT = 4;
const isTruncationOf = (read: string, accepted: string): boolean => {
  const r = read.toLowerCase().replace(/[^a-z]/g, '');
  return r.length >= MIN_FRAGMENT && accepted.toLowerCase().replace(/[^a-z]/g, '').startsWith(r);
};

/** Reads from the cloud model are trusted as verified; on-device reads stay provisional until checked. */
const settled = (source: ReadSource): MarkStatus => (source === 'on_device' ? 'provisional' : 'verified');

interface MarkInput { q: number; max: number; read: string; readSource: ReadSource }

function result(input: MarkInput, awarded: number, status: MarkStatus, reasons: string[], extra: Partial<Mark> = {}): Mark {
  return {
    q: input.q, read: input.read, readSource: input.readSource, max: input.max,
    awarded, engine: 'code', status, reasons, ...extra,
  };
}

export function markNumeric(question: NumericQuestion, read: string, readSource: ReadSource): Mark {
  const input = { q: question.q, max: question.max, read, readSource };
  const parsed = parseNumericAnswer(read);
  if (parsed.value === null) {
    return result(input, 0, 'flagged', ['Could not read a number in the answer box — please check.']);
  }
  const tolerance = question.tolerance ?? DEFAULT_TOLERANCE;
  const matches = (v: number) => question.accept.some((a) => Math.abs(a - v) <= tolerance);
  const correct = matches(parsed.value);

  if (parsed.signAfterEquals && !correct && matches(Math.abs(parsed.value))) {
    return result(input, 0, 'flagged', [`Read "${read}": is that a minus sign or part of "="? Correct if it is ${Math.abs(parsed.value)}.`]);
  }
  const awarded = correct ? question.max : 0;
  const reasons = [correct ? `Answer ${parsed.value} matches the marking scheme.` : `Answer ${parsed.value}; expected ${question.accept.join(' or ')}.`];
  if (!parsed.clean) {
    return result(input, awarded, 'flagged', [...reasons, 'Some handwriting looked like letters; please confirm the number.']);
  }
  return result(input, awarded, settled(readSource), reasons);
}

export function markObjective(question: ObjectiveQuestion, read: string, readSource: ReadSource): Mark {
  const input = { q: question.q, max: question.max, read, readSource };
  const letter = normalizeOptionLetter(read);
  if (!letter) return result(input, 0, 'flagged', ['No single option letter could be read — please check.']);
  const correct = question.correct.map((c) => c.toUpperCase()).includes(letter);
  return result(input, correct ? question.max : 0, settled(readSource), [
    correct ? `Chose ${letter} — correct.` : `Chose ${letter}; correct is ${question.correct.join('/')}.`,
  ]);
}

export function markShort(question: ShortQuestion, read: string, readSource: ReadSource): Mark {
  const input = { q: question.q, max: question.max, read, readSource };
  if (!read.trim()) return result(input, 0, settled(readSource), ['No answer written.']);

  const rejected = (question.reject ?? []).find((r) => textSimilarity(read, r) >= SHORT_MATCH);
  if (rejected) return result(input, 0, settled(readSource), [`"${read}" is listed as not acceptable.`]);

  const tolerant = question.spellingTolerant ?? true;
  const best = Math.max(...question.accept.map((a) => textSimilarity(read, a)));
  const threshold = tolerant ? SHORT_MATCH : 1;
  if (best >= threshold) return result(input, question.max, settled(readSource), [`"${read}" matches an accepted answer.`]);
  const truncated = question.accept.find((a) => isTruncationOf(read, a));
  if (best >= SHORT_UNSURE || truncated) {
    return result(input, 0, 'flagged', [`"${read}" is close to "${truncated ?? question.accept[0]}" — accept it?`]);
  }
  return result(input, 0, settled(readSource), [`"${read}" does not match: expected ${question.accept.join(' / ')}.`]);
}

/**
 * Sums marking points that the model judged present. Points not in the scheme are ignored,
 * so a model cannot invent credit. A non-empty answer with zero points is flagged as a likely misread.
 */
export function markPoints(question: PointsQuestion, read: string, readSource: ReadSource, claimedPoints: string[]): Mark {
  const input = { q: question.q, max: question.max, read, readSource };
  const found = question.points.filter((p) => claimedPoints.includes(p));
  const awarded = Math.min(found.length, question.max);
  const extra = { engine: 'ai-points' as const, pointsFound: found };
  if (!read.trim()) return result(input, 0, settled(readSource), ['No answer written.'], extra);
  if (found.length === 0) {
    return result(input, 0, 'flagged', ['No marking point found in a written answer — the handwriting may have been misread.'], extra);
  }
  const missing = question.points.length > found.length && awarded < question.max;
  return result(input, awarded, settled(readSource), [
    `Found: ${found.join('; ')}.`, ...(missing ? [`${question.max - awarded} more point(s) needed for full marks.`] : []),
  ], extra);
}

// The cloud teaches the device. When the cloud check reads an answer differently from Gemini Nano, the pair
// ("looked like 7" -> "was 1") is saved on the assignment as a handwriting hint. Later on-device reads for that
// class get the hints in their prompt, so the small model learns this class's handwriting during the session.
// Cloud reads never get hints: the checker must stay independent of what it is checking.
import type { Mark, Question, QuestionType } from '../domain/types';

export interface ReadingHint { type: QuestionType; device: string; cloud: string }

/** Most recent hints kept per assignment (also enforced by the Firestore rules). */
export const HINT_LIMIT = 12;
/** Hints shown to the model per question type, newest first. */
const HINTS_PER_PROMPT = 6;
const MAX_HINT_CHARS = 40;
const LEARNABLE: QuestionType[] = ['objective', 'numeric', 'short'];

const clean = (text: string): string => text.replace(/[<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_HINT_CHARS);
const same = (a: string, b: string): boolean => clean(a).toLowerCase() === clean(b).toLowerCase();

/** Device/cloud reading disagreements from one cloud check. Long theory answers are not learnable this way. */
export function learnFromCheck(questions: Question[], before: Mark[], after: Mark[]): ReadingHint[] {
  const hints: ReadingHint[] = [];
  for (const b of before) {
    if (b.readSource !== 'on_device') continue;
    const a = after.find((m) => m.q === b.q);
    const type = questions.find((q) => q.q === b.q)?.type;
    if (!a || a.readSource !== 'in_cloud' || !type || !LEARNABLE.includes(type)) continue;
    if (!clean(b.read) || !clean(a.read) || same(b.read, a.read)) continue;
    hints.push({ type, device: clean(b.read), cloud: clean(a.read) });
  }
  return hints;
}

/** Adds new hints (deduplicated), keeping the newest HINT_LIMIT. */
export function mergeHints(existing: ReadingHint[], fresh: ReadingHint[]): ReadingHint[] {
  const key = (h: ReadingHint) => `${h.type}|${h.device.toLowerCase()}|${h.cloud.toLowerCase()}`;
  const seen = new Set(fresh.map(key));
  return [...existing.filter((h) => !seen.has(key(h))), ...fresh].slice(-HINT_LIMIT);
}

/** The sentence added to an on-device read prompt for this question type ('' when nothing was learned). */
export function learnedHint(hints: ReadingHint[] | undefined, type: QuestionType): string {
  const relevant = (hints ?? []).filter((h) => h.type === type).slice(-HINTS_PER_PROMPT).reverse();
  if (!relevant.length) return '';
  const pairs = relevant.map((h) => `what looked like "${h.device}" was really "${h.cloud}"`).join('; ');
  return ` In this class's handwriting, earlier readings were corrected: ${pairs}. Use this only to recognise how these students form their characters; still copy exactly what is written.`;
}

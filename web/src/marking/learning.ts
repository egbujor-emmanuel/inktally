// The cloud teaches the device. When the cloud check reads an answer differently from Gemini Nano, the pair
// ("looked like 7" -> "was 1") is saved on the assignment as a handwriting hint. Later on-device reads for that
// assignment get the hints in their prompt, so the small model learns these students' handwriting during marking.
// Cloud reads never get hints: the checker must stay independent of what it is checking.
// Guard rail: a one-character confusion ("A" was "D") could push a student who really wrote A towards D, so it is only
// used once the same confusion has been seen on at least two answers.
import type { Mark, Question, QuestionType } from '../domain/types';

export interface ReadingHint {
  type: QuestionType; device: string; cloud: string;
  /** How many answers showed this confusion (absent = 1, for hints saved before counting). */
  n?: number;
}

/** Most recent hints kept per assignment (also enforced by the Firestore rules). */
export const HINT_LIMIT = 12;
/** Hints shown to the model per question type, newest first. */
const HINTS_PER_PROMPT = 6;
const MAX_HINT_CHARS = 40;
const LEARNABLE: QuestionType[] = ['objective', 'numeric', 'short'];
/** Sightings needed before a one-character confusion is trusted. */
export const SINGLE_CHAR_MIN_SEEN = 2;

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

const key = (h: ReadingHint): string => `${h.type}|${h.device.toLowerCase()}|${h.cloud.toLowerCase()}`;
const seen = (h: ReadingHint): number => h.n ?? 1;

/** Adds new hints: a confusion seen again is counted (and moved to newest), others appended; the newest HINT_LIMIT are kept. */
export function mergeHints(existing: ReadingHint[], fresh: ReadingHint[]): ReadingHint[] {
  let merged = [...existing];
  for (const h of fresh) {
    const old = merged.find((x) => key(x) === key(h));
    merged = [...merged.filter((x) => key(x) !== key(h)), { type: h.type, device: h.device, cloud: h.cloud, n: (old ? seen(old) : 0) + seen(h) }];
  }
  return merged.slice(-HINT_LIMIT);
}

/** How many of the fresh hints are confusions this assignment had not seen before. */
export function countNewHints(existing: ReadingHint[], fresh: ReadingHint[]): number {
  const known = new Set(existing.map(key));
  return new Set(fresh.map(key).filter((k) => !known.has(k))).size;
}

/** Whether a hint is trusted enough to go into an on-device prompt. */
export function usableHint(h: ReadingHint): boolean {
  const singleChar = h.device.length === 1 && h.cloud.length === 1;
  return !singleChar || seen(h) >= SINGLE_CHAR_MIN_SEEN;
}

/** The sentence added to an on-device read prompt for this question type ('' when nothing usable was learned). */
export function learnedHint(hints: ReadingHint[] | undefined, type: QuestionType): string {
  const relevant = (hints ?? []).filter((h) => h.type === type && usableHint(h)).slice(-HINTS_PER_PROMPT).reverse();
  if (!relevant.length) return '';
  const pairs = relevant.map((h) => `what looked like "${h.device}" was really "${h.cloud}"`).join('; ');
  return ` In these students' handwriting, earlier readings were corrected: ${pairs}. Use this only to recognise how these students form their characters; still copy exactly what is written.`;
}

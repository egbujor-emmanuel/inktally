// The cloud teaches InkTally where the device goes wrong. When the cloud check reads an answer differently from Gemini
// Nano, the pair ("the device read A" -> "it was D") is saved on the assignment. From then on, an offline on-device
// reading that matches a known misread is HELD for the teacher ("Check this", listed in Review) so it is checked before the marks go back.
//
// Why holding, not hinting: a held-out test on real Gemini Nano (bench/evidence/learning-heldout-2026-11-14/) showed
// that adding the corrections to the read prompt made no measurable difference on unseen students (19/25, 19/25,
// 20/25 exact reads), while a letter hint such as "A was really D" could turn a student who truly wrote A into D.
// The same corrections, used to hold matching readings, flagged every one of the device's misreads on those unseen
// students. InkTally never changes what the device read, so it cannot push an answer towards the key.
import type { Mark, Question, QuestionType } from '../domain/types';

export interface ReadingHint {
  type: QuestionType; device: string; cloud: string;
  /** How many answers showed this misread (absent = 1, for records saved before counting). */
  n?: number;
}

/** Most recent misreads kept per assignment (also enforced by the Firestore rules). */
export const HINT_LIMIT = 12;
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

const key = (h: ReadingHint): string => `${h.type}|${h.device.toLowerCase()}|${h.cloud.toLowerCase()}`;
const seen = (h: ReadingHint): number => h.n ?? 1;

/** Adds new misreads: one seen again is counted (and moved to newest), others appended; the newest HINT_LIMIT are kept. */
export function mergeHints(existing: ReadingHint[], fresh: ReadingHint[]): ReadingHint[] {
  let merged = [...existing];
  for (const h of fresh) {
    const old = merged.find((x) => key(x) === key(h));
    merged = [...merged.filter((x) => key(x) !== key(h)), { type: h.type, device: h.device, cloud: h.cloud, n: (old ? seen(old) : 0) + seen(h) }];
  }
  return merged.slice(-HINT_LIMIT);
}

/** How many of the fresh misreads this assignment had not seen before. */
export function countNewHints(existing: ReadingHint[], fresh: ReadingHint[]): number {
  const known = new Set(existing.map(key));
  return new Set(fresh.map(key).filter((k) => !known.has(k))).size;
}

/** The known misread that an on-device reading matches, if any (same question type, case and spacing aside). */
export function knownMisread(hints: ReadingHint[] | undefined, type: QuestionType, read: string): ReadingHint | undefined {
  if (!clean(read)) return undefined;
  return (hints ?? []).filter((h) => h.type === type && same(h.device, read)).at(-1);
}

/** Marks a held reading. Detected by isHeld(); used by reconcile() so the cloud check still compares both readings. */
export const HELD_PREFIX = 'Held for checking:';

/**
 * An on-device mark whose reading matches a known misread becomes "Check this", with the reason (also added when the
 * engine already flagged it, because it tells the teacher what was probably written). The reading is never changed.
 */
export function holdIfKnownMisread(mark: Mark, hints: ReadingHint[] | undefined, type: QuestionType): Mark {
  if (mark.readSource !== 'on_device' || (mark.status !== 'provisional' && mark.status !== 'flagged') || isHeld(mark)) return mark;
  const h = knownMisread(hints, type, mark.read);
  if (!h) return mark;
  const times = seen(h) > 1 ? ` (${seen(h)} times)` : '';
  return {
    ...mark, status: 'flagged',
    reasons: [...mark.reasons, `${HELD_PREFIX} on this assignment Gemini Nano has read “${h.cloud}” as “${h.device}” before${times}, so check this one.`],
  };
}

export const isHeld = (mark: Mark): boolean => mark.reasons.some((r) => r.startsWith(HELD_PREFIX));

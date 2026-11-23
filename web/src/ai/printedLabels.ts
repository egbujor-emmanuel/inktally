// Reads the question labels printed in a typed or pasted marking guide ("1.", "6(a)", "(b)(i)" under 6, "9."), so the
// answer key's questions and labels come from the teacher's own text, not from whichever cloud model answered.
import type { Question } from '../domain/types';

const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']);
const NUMBERED = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*(?:[.)]\s*)?((?:\(\s*[a-z]\s*\))?(?:\(\s*[ivx]+\s*\))?)\s*[.):]?(?:\s+(\S+)|\s*$)/i;
const LETTERED = /^\(\s*([a-z]{1,4})\s*\)\s*((?:\(\s*[ivx]+\s*\))?)\s*\S/i;
// "2 marks for the method", "10 m is the height": a number followed by a unit, not a question.
const NOT_A_QUESTION = /^(marks?|m|cm|mm|km|kg|%|×|x)$/i;

const clean = (sub: string) => sub.replace(/\s+/g, '').toLowerCase();

/** The printed labels in order, or [] when the text does not look like a numbered list of questions. */
export function printedLabels(text: string): string[] {
  const labels: string[] = [];
  let num: number | null = null;
  let letter: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const numbered = line.match(NUMBERED);
    if (numbered && !NOT_A_QUESTION.test(numbered[3] ?? '')) {
      const n = Number(numbered[1]);
      const sub = clean(numbered[2]);
      const next = num === null || n === num + 1 || (n === num && sub !== '');
      if (next) {
        num = n;
        letter = sub.match(/^\(([a-z])\)/)?.[1] ?? null;
        labels.push(`${n}${sub}`);
        continue;
      }
    }
    const lettered = num !== null ? line.match(LETTERED) : null;
    if (lettered) {
      const token = lettered[1].toLowerCase();
      const roman = clean(lettered[2]);
      // "(ii)" after "(b)" is a sub-sub-part; "(c)" is the next part.
      if (letter && ROMAN.has(token) && !(token === 'i' && letter === 'h')) labels.push(`${num}(${letter})(${token})`);
      else if (token.length === 1) { letter = token; labels.push(`${num}(${token})${roman}`); }
    }
  }
  // A heading such as "6." or "6(b)" with parts printed under it is not a question of its own.
  const kept = labels.filter((l, i) => !labels.slice(i + 1).some((m) => m.startsWith(`${l}(`)));
  return kept.length >= 2 && new Set(kept).size === kept.length ? kept : [];
}

/** The instruction that pins the drafted list to the printed one. */
export const printedLabelsNote = (labels: string[]): string =>
  `This marking guide has exactly ${labels.length} questions. Return exactly ${labels.length} items, numbered q = 1 to ${labels.length} in this order, with these printed labels in "label": ${labels.map((l) => `"${l}"`).join(', ')}.`;

/**
 * Puts the printed labels on the drafted questions. A complete draft is numbered 1..N in the printed order. A short
 * one keeps the questions whose label matches a printed one, so the missing ones can be named to the teacher.
 */
export function alignToPrinted(questions: Question[], labels: string[]): { questions: Question[]; missing: number[] } {
  const relabel = (q: Question, i: number): Question => ({ ...q, q: i + 1, ...(labels[i] !== String(i + 1) ? { label: labels[i] } : { label: undefined }) });
  const strip = (q: Question): Question => { if (q.label === undefined) { const { label: _, ...rest } = q; return rest as Question; } return q; };
  if (questions.length === labels.length) return { questions: questions.map(relabel).map(strip), missing: [] };
  const norm = (l?: string) => (l ?? '').replace(/\s+/g, '').toLowerCase();
  const byLabel = new Map(questions.map((q) => [norm(q.label ?? String(q.q)), q]));
  const found: Question[] = [];
  const missing: number[] = [];
  labels.forEach((l, i) => { const q = byLabel.get(norm(l)); if (q) found.push(strip(relabel(q, i))); else missing.push(i + 1); });
  return { questions: found, missing };
}

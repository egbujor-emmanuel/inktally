// Reads the question labels printed in a typed or pasted marking guide ("1.", "6(a)", "(b)(i)" under 6, "9."), so the
// answer key's questions and labels come from the teacher's own text, not from whichever cloud model answered.
import type { Question } from '../domain/types';
import { parseNumericAnswer, workingSteps } from '../marking/normalize';

const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']);
const NUMBERED = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*(?:[.)]\s*)?((?:\(\s*[a-z]\s*\))?(?:\(\s*[ivx]+\s*\))?)\s*[.):]?(?:\s+(\S+)|\s*$)/i;
const LETTERED = /^\(\s*([a-z]{1,4})\s*\)\s*((?:\(\s*[ivx]+\s*\))?)\s*\S/i;
// "2 marks for the method", "10 m is the height": a number followed by a unit, not a question.
const NOT_A_QUESTION = /^(marks?|m|cm|mm|km|kg|%|×|x)$/i;

const clean = (sub: string) => sub.replace(/\s+/g, '').toLowerCase();

/** Every label line in the text, with the line it starts on (headings with parts under them still included). */
function labelLines(text: string): { label: string; line: number }[] {
  const found: { label: string; line: number }[] = [];
  let num: number | null = null;
  let letter: string | null = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const numbered = line.match(NUMBERED);
    if (numbered && !NOT_A_QUESTION.test(numbered[3] ?? '')) {
      const n = Number(numbered[1]);
      const sub = clean(numbered[2]);
      const next = num === null || n === num + 1 || (n === num && sub !== '');
      if (next) {
        num = n;
        letter = sub.match(/^\(([a-z])\)/)?.[1] ?? null;
        found.push({ label: `${n}${sub}`, line: index });
        return;
      }
    }
    const lettered = num !== null ? line.match(LETTERED) : null;
    if (lettered) {
      const token = lettered[1].toLowerCase();
      const roman = clean(lettered[2]);
      // "(ii)" after "(b)" is a sub-sub-part; "(c)" is the next part.
      if (letter && ROMAN.has(token) && !(token === 'i' && letter === 'h')) found.push({ label: `${num}(${letter})(${token})`, line: index });
      else if (token.length === 1) { letter = token; found.push({ label: `${num}(${token})${roman}`, line: index }); }
    }
  });
  return found;
}

/** A heading such as "6." or "6(b)" with parts printed under it is not a question of its own. */
const questionsOnly = (labels: string[]) => labels.filter((l, i) => !labels.slice(i + 1).some((m) => m.startsWith(`${l}(`)));

/** The printed labels in order, or [] when the text does not look like a numbered list of questions. */
export function printedLabels(text: string): string[] {
  const kept = questionsOnly(labelLines(text).map((x) => x.label));
  return kept.length >= 2 && new Set(kept).size === kept.length ? kept : [];
}

/** Each printed question's own text in the guide: from its label line up to the next label line. */
export function printedSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const all = labelLines(text);
  const kept = new Set(printedLabels(text));
  const sections = new Map<string, string>();
  all.forEach((x, i) => {
    if (kept.has(x.label)) sections.set(x.label, lines.slice(x.line, all[i + 1]?.line ?? lines.length).join(' ').trim());
  });
  return sections;
}

const CALCULATION = /\b(calculat\w*|find|work out|determine|how (?:much|many|far|long|fast))\b/i;
const STATED_ANSWER = /\banswer\s*[:=]?\s*(.+?)(?=\s*\(|;|\.\s|\.$|$)/i;
const ACCEPTED = /\baccept\s+([^)]+)\)/gi;

/**
 * The numbers a guide states as the answer to a calculation ("Calculate … Answer 1.0 × 10^5 Pa (accept 100 000 Pa)"),
 * or [] when the question is not a calculation with a stated answer. "Answer any two" has no number, so it never counts.
 */
export function statedAnswers(section: string): number[] {
  if (!CALCULATION.test(section)) return [];
  const stated = section.match(STATED_ANSWER)?.[1];
  const value = stated ? parseNumericAnswer(stated).value : null;
  if (value === null) return [];
  const extra = [...section.matchAll(ACCEPTED)].flatMap((m) => m[1].split(/\bor\b|,(?!\d{3})/))
    .map((t) => parseNumericAnswer(t).value).filter((v): v is number => v !== null);
  return [...new Set([value, ...extra])];
}

/**
 * The teacher's guide decides which questions are calculations: a question whose guide text calculates and states a
 * numeric answer is marked as a number with those answers, whatever type the model chose (a fallback model once
 * drafted the WAEC pressure question as a theory answer, 25 Nov). Method points the model listed are kept.
 */
export function pinCalculations(questions: Question[], sections: Map<string, string>): Question[] {
  return questions.map((q) => {
    const answers = statedAnswers(sections.get(q.label ?? String(q.q)) ?? '');
    if (!answers.length) return q;
    if (q.type === 'numeric') return { ...q, accept: [...new Set([...q.accept, ...answers])] };
    if (q.type === 'objective') return q;
    const said = q.type === 'points' ? q.points : q.accept;
    const isAnswer = (p: string) => {
      const value = parseNumericAnswer(p.replace(/^\s*(?:the\s+)?(?:correct\s+|final\s+)?answers?\s*[:=(]?\s*/i, '')).value;
      return value !== null && answers.some((a) => Math.abs(a - value) <= 1e-9 * Math.max(1, Math.abs(a)));
    };
    const steps = workingSteps(said).filter((p) => !isAnswer(p));
    const { label, prompt, max } = q;
    return { q: q.q, ...(label ? { label } : {}), prompt, max, type: 'numeric', accept: answers, ...(steps.length && max > 1 ? { methodPoints: steps } : {}) };
  });
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

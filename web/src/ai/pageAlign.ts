// Exercise-book pages: the model transcribes each answer together with the label the student wrote in front of it
// ("7a) I ∝ V …"), and code matches that label to the marking scheme. Asked for a label and a text separately, the model
// once copied the scheme's label list in order and moved every answer after a blank one up a question (a sideways photo,
// 25 Nov). A label read from the start of the answer's own transcript cannot drift that way.
import { qLabel } from '../domain/types';

export interface PageAnswer { q: number; label?: string; text: string }

/** "Q7(a)" -> "7a", "6b(ii)" and "6(b)(ii)" -> "6bii", "1." -> "1". */
export function labelKey(label: string): string {
  return label.toLowerCase().trim().replace(/^(?:question|q|no)\.?\s*(?=\d)/, '').replace(/[^0-9a-z]/g, '');
}

const LONGEST_LABEL = 16;

/** Any label left at the start of an answer, even one matching no question ("6b) 4" written for 6(b)(i)); "1.5 A" keeps its number. */
const ANY_LABEL = /^\s*(?:q(?:uestion)?\.?\s*)?\d{1,3}\s*(?:[a-z]|\(\s*[a-z]\s*\))?\s*(?:\(\s*[ivx]+\s*\)|[ivx]{1,4})?\s*[).:](?=\s|$)\s*/i;
export const stripLabel = (text: string): string => text.replace(ANY_LABEL, '');

/**
 * The longest start of the transcript that is one of the scheme's labels, ending at a ")", ".", ":" or a space
 * ("6b(ii) 4" -> 6b(ii), "8a)(i) Transverse…" -> 8a)). A digit after ")" or "." ends the label: "2) 2 m/s" is 2.
 */
export function leadingLabel(text: string, keys: ReadonlySet<string>): { key: string; rest: string } | null {
  const t = text.trimStart();
  for (let m = Math.min(LONGEST_LABEL, t.length); m >= 1; m--) {
    const prefix = t.slice(0, m);
    const next = t.charAt(m);
    if (/[).:]\s*\d/.test(prefix)) continue;
    const ends = /[).:\s]$/.test(prefix) || next === '' || /\s/.test(next);
    if (!ends || !keys.has(labelKey(prefix))) continue;
    return { key: labelKey(prefix), rest: t.slice(m).replace(/^[\s).:-]+/, '') };
  }
  return null;
}

/**
 * Each answer goes to the question whose label starts its transcript; then to the label the model gave; then to the
 * model's question number. A question is never filled twice.
 */
export function alignPageAnswers(answers: readonly PageAnswer[], questions: ReadonlyArray<{ q: number; label?: string }>): Map<number, string> {
  const byKey = new Map<string, number[]>();
  for (const question of questions) {
    const key = labelKey(qLabel(question));
    byKey.set(key, [...(byKey.get(key) ?? []), question.q]);
  }
  const keys = new Set(byKey.keys());
  const only = (key: string | undefined) => { const hits = key === undefined ? undefined : byKey.get(key); return hits?.length === 1 ? hits[0] : undefined; };
  const aligned = new Map<number, string>();
  const later: PageAnswer[] = [];
  for (const answer of answers) {
    const lead = leadingLabel(answer.text, keys);
    const q = only(lead?.key);
    if (lead && q !== undefined && !aligned.has(q)) aligned.set(q, lead.rest.trim());
    else later.push(answer);
  }
  const put = (q: number, answer: PageAnswer) => {
    const lead = leadingLabel(answer.text, keys);
    aligned.set(q, (lead && only(lead.key) === q ? lead.rest : stripLabel(answer.text)).trim());
  };
  const unplaced: PageAnswer[] = [];
  for (const answer of later) {
    const byLabel = answer.label ? only(labelKey(answer.label)) : undefined;
    if (byLabel !== undefined && !aligned.has(byLabel)) put(byLabel, answer);
    else unplaced.push(answer);
  }
  const known = new Set(questions.map((x) => x.q));
  for (const answer of unplaced) if (known.has(answer.q) && !aligned.has(answer.q)) put(answer.q, answer);
  return aligned;
}

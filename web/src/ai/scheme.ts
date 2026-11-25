// Cloud drafting of a marking scheme from the question paper (photo, PDF or typed text).
// Only the QUESTIONS go to the cloud here — never pupils' work. The teacher reviews and edits the draft.
import { Schema, type Part } from 'firebase/ai';
import { z } from 'zod';
import type { MarkingScheme, Question } from '../domain/types';
import { fillTemplate } from './config';
import { authorGenerate, blobToPart, config } from './models';
import { recordInference } from './telemetry';
import { workingSteps } from '../marking/normalize';
import { alignToPrinted, printedLabels, printedLabelsNote, pinCalculations, printedSections } from './printedLabels';

const QUESTION_TYPES = ['objective', 'numeric', 'short', 'points'] as const;

const DRAFT_SCHEMA = Schema.object({
  properties: {
    subject: Schema.string(),
    level: Schema.string(),
    questionCount: Schema.integer(),
    questions: Schema.array({
      items: Schema.object({
        properties: {
          q: Schema.integer(),
          label: Schema.string(),
          prompt: Schema.string(),
          max: Schema.integer(),
          type: Schema.enumString({ enum: [...QUESTION_TYPES] }),
          correctOptions: Schema.array({ items: Schema.string() }),
          acceptNumbers: Schema.array({ items: Schema.number() }),
          acceptText: Schema.array({ items: Schema.string() }),
          points: Schema.array({ items: Schema.string() }),
          reject: Schema.array({ items: Schema.string() }),
          methodPoints: Schema.array({ items: Schema.string() }),
        },
        optionalProperties: ['label', 'correctOptions', 'acceptNumbers', 'acceptText', 'points', 'reject', 'methodPoints'],
      }),
    }),
  },
  optionalProperties: ['subject', 'level', 'questionCount'],
});

const DraftQuestion = z.object({
  q: z.number().int().positive(),
  label: z.string().optional(),
  prompt: z.string(),
  max: z.number().int().positive().max(20),
  type: z.enum(QUESTION_TYPES),
  correctOptions: z.array(z.string()).optional(),
  acceptNumbers: z.array(z.number()).optional(),
  acceptText: z.array(z.string()).optional(),
  points: z.array(z.string()).optional(),
  reject: z.array(z.string()).optional(),
  methodPoints: z.array(z.string()).optional(),
});
const Draft = z.object({ subject: z.string().optional(), level: z.string().optional(), questionCount: z.number().int().optional(), questions: z.array(DraftQuestion).min(1) });

/** Converts the flat model output into the strongly-typed domain question, dropping unusable ones. */
export function toQuestion(d: z.infer<typeof DraftQuestion>): Question | null {
  const label = d.label?.replace(/[<>"]/g, '').trim().slice(0, 16);
  const base = { q: d.q, ...(label ? { label } : {}), prompt: d.prompt, max: d.max };
  // Only set when there is a list: Firestore rejects undefined fields (saving a teacher's scheme crashed on this).
  const reject = d.reject?.length ? { reject: d.reject } : {};
  switch (d.type) {
    case 'objective':
      return d.correctOptions?.length ? { ...base, type: 'objective', correct: d.correctOptions.map((c) => c.trim().toUpperCase()) } : null;
    case 'numeric':
      return d.acceptNumbers?.length
        ? { ...base, type: 'numeric', accept: d.acceptNumbers, ...(workingSteps(d.methodPoints).length && d.max > 1 ? { methodPoints: workingSteps(d.methodPoints) } : {}) } : null;
    case 'short':
      return d.acceptText?.length ? { ...base, type: 'short', accept: d.acceptText, ...reject } : null;
    case 'points':
      return d.points?.length ? { ...base, type: 'points', points: d.points, ...reject } : null;
  }
}

export interface SchemeSource {
  images?: Blob[];
  pdf?: Blob;
  text?: string;
  /** The photo is a pupil's page (questions + the pupil's own answers), not a clean question paper. */
  isPupilPage?: boolean;
  /** The teacher's own marking scheme / answer key: copied exactly, never re-solved. */
  guideImages?: Blob[];
  guidePdf?: Blob;
  guideText?: string;
}

export const hasGuide = (s: SchemeSource): boolean => Boolean(s.guideImages?.length || s.guidePdf || s.guideText?.trim());
export const hasPaper = (s: SchemeSource): boolean => Boolean(s.images?.length || s.pdf || s.text?.trim());

const PUPIL_PAGE_NOTE = "IMPORTANT: this photo shows a student's exercise page — the questions AND the student's own handwritten answers. "
  + "Work out the correct answers yourself from the QUESTIONS only. The student's answers may be wrong: never copy them into the marking scheme. "
  + 'Each numbered item is ONE question: lines under it such as "Answer = ..." or working are part of that same question, never a new one.';

/** WAEC-style sub-parts: each part that earns its own marks is its own question, numbered on, with its printed label. Same text on Android. */
export const SUBPARTS_NOTE = 'Treat every sub-part that earns its own marks as its own question: number them 1, 2, 3 and so on in order in "q", and always put the label printed on the paper in "label", for every question (for example "1", "6(a)", "6(b)(ii)", "9").';

/** Marks for working on calculations (WAEC-style partial credit). Same text on Android. */
export const METHOD_MARKS_NOTE = 'Method marks: only when the question paper or the teacher’s scheme itself gives a calculation more than 1 mark, list what earns marks for working in "methodPoints" (for example "uses speed = distance ÷ time" or "finds the profit, 9,000"), one item per mark, never the final answer itself, and put only the final answer in "acceptNumbers". Never give a question more marks than the paper or scheme shows. When the teacher’s scheme gives method marks, copy them exactly. A calculation whose answer is a number is always type "numeric" (its working in "methodPoints"), never "points".';

/** Asks the model to name the subject and level so an untouched form never prints the wrong ones. Same text on Android. */
export const DETECT_LABELS_NOTE = 'Also return "questionCount": how many numbered questions the paper or scheme has in total. Also return "subject" and "level": the subject and the class or level this paper is for, as short labels '
  + '(for example "Mathematics", "JSS 2"). Use an empty string for either one if the paper does not show it.';
const MAX_LABEL = 60;
const cleanLabel = (text: string | undefined): string => (text ?? '').replace(/[<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

/** What the teacher typed wins; otherwise what the paper says; otherwise a neutral label (never a made-up subject). */
export function resolveLabels(typedSubject: string, typedLevel: string, detected: { subject?: string; level?: string }): { subject: string; level: string } {
  return {
    subject: cleanLabel(typedSubject) || cleanLabel(detected.subject) || 'General',
    level: cleanLabel(typedLevel) || cleanLabel(detected.level),
  };
}

/** Question numbers a draft left out: gaps in 1..N, where N is the highest number found or the count the model saw. */
export function missingQuestions(found: number[], declaredCount = 0): number[] {
  const last = Math.min(100, Math.max(declaredCount, ...found, 0));
  const have = new Set(found);
  return Array.from({ length: last }, (_, i) => i + 1).filter((n) => !have.has(n));
}

const SUBPART = /^(\d+)\(([a-z])\)/i;

/**
 * Fills in labels the model left out, from the questions around them, when the paper has sub-parts: a question just
 * before "7(b)" is "7(a)", one just after "6(a)" is "6(b)", and one between "6(b)(ii)" and "8" is "7". Labels end up
 * unique, so the page reader can never match two questions to one answer.
 */
export function inferLabels(questions: Question[]): Question[] {
  if (!questions.some((q) => q.label && SUBPART.test(q.label))) return questions;
  const out = questions.map((q) => ({ ...q }));
  const lead = (l?: string) => (l ? Number(l.match(/^\d+/)?.[0] ?? NaN) : NaN);
  for (let i = 0; i < out.length; i++) {
    if (out[i].label) continue;
    const prev = out[i - 1]?.label, next = out[i + 1]?.label;
    const nextSub = next?.match(SUBPART), prevSub = prev?.match(SUBPART);
    if (nextSub && nextSub[2].toLowerCase() === 'b') out[i].label = `${nextSub[1]}(a)`;
    else if (prevSub && prevSub[2].toLowerCase() === 'a' && /^\d+\(a\)$/i.test(prev ?? '')) out[i].label = `${prevSub[1]}(b)`;
    else if (!Number.isNaN(lead(prev)) && (!next || lead(next) - lead(prev) === 2)) out[i].label = String(lead(prev) + 1);
  }
  // Never two questions with the same label.
  const seen = new Set<string>();
  return out.map((q) => {
    const l = q.label?.trim();
    if (!l || seen.has(l)) { const { label: _, ...rest } = q; return rest as Question; }
    seen.add(l);
    return l === String(q.q) ? (({ label: _, ...rest }) => rest as Question)(q) : q;
  });
}

/** A drafted key plus any question numbers InkTally could not find even after asking again (shown to the teacher). */
export interface DraftedScheme extends MarkingScheme { missing: number[]; /** The printed labels of the missing questions, when the guide was typed. */ missingShown?: string[] }

export async function draftScheme(source: SchemeSource, subject: string, level: string): Promise<DraftedScheme> {
  if (!hasPaper(source) && !hasGuide(source)) throw new Error('Add the question paper or your marking scheme (photo, PDF or typed) first.');
  const parts: (string | Part)[] = [fillTemplate(config('prompt_scheme_draft'), {
    subject: subject.trim() || 'the subject shown on the paper', level: level.trim() || 'the class or level shown on the paper',
  }), DETECT_LABELS_NOTE, SUBPARTS_NOTE, METHOD_MARKS_NOTE];
  if (source.isPupilPage) parts.push(PUPIL_PAGE_NOTE);
  if (hasGuide(source)) parts.push(config('prompt_scheme_from_guide'));
  if (hasPaper(source)) {
    parts.push('QUESTION PAPER:');
    if (source.text) parts.push(source.text);
    for (const image of source.images ?? []) parts.push(await blobToPart(image));
    if (source.pdf) parts.push(await blobToPart(source.pdf));
  }
  if (hasGuide(source)) {
    parts.push('TEACHER’S MARKING SCHEME:');
    if (source.guideText) parts.push(source.guideText);
    for (const image of source.guideImages ?? []) parts.push(await blobToPart(image));
    if (source.guidePdf) parts.push(await blobToPart(source.guidePdf));
  }

  // A typed guide prints its own question labels: code reads them, so the list does not depend on the model.
  const printed = printedLabels(source.guideText ?? '').length ? printedLabels(source.guideText ?? '') : printedLabels(source.text ?? '');
  if (printed.length) parts.push(printedLabelsNote(printed));
  const shape = (drafted: Question[], count: number) => printed.length
    ? alignToPrinted(drafted, printed)
    : { questions: drafted, missing: missingQuestions(drafted.map((q) => q.q), count) };

  const first = await draftOnce(parts);
  let { questions, missing } = shape(first.questions, first.count);
  // A long paper sometimes comes back with questions left out: ask once more, naming them, and keep what was found.
  // With printed labels only the missing ones are asked for: half the reply, so it finishes even when the cloud is slow.
  if (missing.length) {
    try {
      const named = printed.length ? missing.map((n) => `${n} ("${printed[n - 1]}")`) : missing;
      const retry = await draftOnce([...parts, missingRequest(named, printed.length > 0)]);
      const again = shape(retry.questions, Math.max(first.count, retry.count));
      const byNumber = new Map(questions.map((q) => [q.q, q]));
      for (const q of again.questions) if (!byNumber.has(q.q)) byNumber.set(q.q, q);
      questions = [...byNumber.values()].sort((a, b) => a.q - b.q);
      missing = printed.length
        ? printed.map((_, i) => i + 1).filter((n) => !byNumber.has(n))
        : missingQuestions(questions.map((q) => q.q), Math.max(first.count, retry.count));
    } catch { /* keep the first draft; the teacher is told what is missing */ }
  }
  if (printed.length) questions = pinCalculations(questions, printedSections(source.guideText ?? source.text ?? ''));
  return { ...resolveLabels(subject, level, first.labels), questions: printed.length ? questions : inferLabels(questions), missing, ...(printed.length && missing.length ? { missingShown: missing.map((n) => printed[n - 1]) } : {}) };
}

async function draftOnce(parts: (string | Part)[]): Promise<{ questions: Question[]; count: number; labels: { subject?: string; level?: string } }> {
  const started = performance.now();
  const { text } = await authorGenerate(DRAFT_SCHEMA, parts);
  recordInference({ kind: 'author', source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = Draft.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('The drafted marking scheme was incomplete. Try a clearer photo or type the questions.');
  const questions = parsed.data.questions.map(toQuestion).filter((q): q is Question => q !== null).sort((a, b) => a.q - b.q);
  return { questions, count: parsed.data.questionCount ?? 0, labels: parsed.data };
}

/** The second request when a draft left questions out (same wording on Android). Printed labels let the reply be just those. */
export const missingRequest = (named: ReadonlyArray<number | string>, printed: boolean): string => printed
  ? `IMPORTANT: your previous answer left out question(s) ${named.join(', ')}. Return only those question(s) now, each with its printed label in "label", following every rule above.`
  : `IMPORTANT: your previous answer left out question(s) ${named.join(', ')}. Return the complete list, including every question.`;

/** The sentence shown when questions are still missing after the second try. */
export const missingNotice = (missing: ReadonlyArray<number | string>): string =>
  `InkTally could not find question${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. Check the paper, and add ${missing.length === 1 ? 'it' : 'them'} with "+ Add question".`;

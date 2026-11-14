// Cloud drafting of a marking scheme from the question paper (photo, PDF or typed text).
// Only the QUESTIONS go to the cloud here — never pupils' work. The teacher reviews and edits the draft.
import { Schema, type Part } from 'firebase/ai';
import { z } from 'zod';
import type { MarkingScheme, Question } from '../domain/types';
import { fillTemplate } from './config';
import { authorGenerate, blobToPart, config } from './models';
import { recordInference } from './telemetry';

const QUESTION_TYPES = ['objective', 'numeric', 'short', 'points'] as const;

const DRAFT_SCHEMA = Schema.object({
  properties: {
    subject: Schema.string(),
    level: Schema.string(),
    questions: Schema.array({
      items: Schema.object({
        properties: {
          q: Schema.integer(),
          prompt: Schema.string(),
          max: Schema.integer(),
          type: Schema.enumString({ enum: [...QUESTION_TYPES] }),
          correctOptions: Schema.array({ items: Schema.string() }),
          acceptNumbers: Schema.array({ items: Schema.number() }),
          acceptText: Schema.array({ items: Schema.string() }),
          points: Schema.array({ items: Schema.string() }),
          reject: Schema.array({ items: Schema.string() }),
        },
        optionalProperties: ['correctOptions', 'acceptNumbers', 'acceptText', 'points', 'reject'],
      }),
    }),
  },
  optionalProperties: ['subject', 'level'],
});

const DraftQuestion = z.object({
  q: z.number().int().positive(),
  prompt: z.string(),
  max: z.number().int().positive().max(20),
  type: z.enum(QUESTION_TYPES),
  correctOptions: z.array(z.string()).optional(),
  acceptNumbers: z.array(z.number()).optional(),
  acceptText: z.array(z.string()).optional(),
  points: z.array(z.string()).optional(),
  reject: z.array(z.string()).optional(),
});
const Draft = z.object({ subject: z.string().optional(), level: z.string().optional(), questions: z.array(DraftQuestion).min(1) });

/** Converts the flat model output into the strongly-typed domain question, dropping unusable ones. */
export function toQuestion(d: z.infer<typeof DraftQuestion>): Question | null {
  const base = { q: d.q, prompt: d.prompt, max: d.max };
  // Only set when there is a list: Firestore rejects undefined fields (saving a teacher's scheme crashed on this).
  const reject = d.reject?.length ? { reject: d.reject } : {};
  switch (d.type) {
    case 'objective':
      return d.correctOptions?.length ? { ...base, type: 'objective', correct: d.correctOptions.map((c) => c.trim().toUpperCase()) } : null;
    case 'numeric':
      return d.acceptNumbers?.length ? { ...base, type: 'numeric', accept: d.acceptNumbers } : null;
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

/** Asks the model to name the subject and level so an untouched form never prints the wrong ones. Same text on Android. */
export const DETECT_LABELS_NOTE = 'Also return "subject" and "level": the subject and the class or level this paper is for, as short labels '
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

export async function draftScheme(source: SchemeSource, subject: string, level: string): Promise<MarkingScheme> {
  if (!hasPaper(source) && !hasGuide(source)) throw new Error('Add the question paper or your marking scheme (photo, PDF or typed) first.');
  const parts: (string | Part)[] = [fillTemplate(config('prompt_scheme_draft'), {
    subject: subject.trim() || 'the subject shown on the paper', level: level.trim() || 'the class or level shown on the paper',
  }), DETECT_LABELS_NOTE];
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

  const started = performance.now();
  const { text } = await authorGenerate(DRAFT_SCHEMA, parts);
  recordInference({ kind: 'author', source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = Draft.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('The drafted marking scheme was incomplete. Try a clearer photo or type the questions.');
  const questions = parsed.data.questions.map(toQuestion).filter((q): q is Question => q !== null).sort((a, b) => a.q - b.q);
  return { ...resolveLabels(subject, level, parsed.data), questions };
}

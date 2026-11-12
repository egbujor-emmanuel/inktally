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
const Draft = z.object({ questions: z.array(DraftQuestion).min(1) });

/** Converts the flat model output into the strongly-typed domain question, dropping unusable ones. */
export function toQuestion(d: z.infer<typeof DraftQuestion>): Question | null {
  const base = { q: d.q, prompt: d.prompt, max: d.max };
  switch (d.type) {
    case 'objective':
      return d.correctOptions?.length ? { ...base, type: 'objective', correct: d.correctOptions.map((c) => c.trim().toUpperCase()) } : null;
    case 'numeric':
      return d.acceptNumbers?.length ? { ...base, type: 'numeric', accept: d.acceptNumbers } : null;
    case 'short':
      return d.acceptText?.length ? { ...base, type: 'short', accept: d.acceptText, reject: d.reject } : null;
    case 'points':
      return d.points?.length ? { ...base, type: 'points', points: d.points, reject: d.reject } : null;
  }
}

export interface SchemeSource { images?: Blob[]; pdf?: Blob; text?: string }

export async function draftScheme(source: SchemeSource, subject: string, level: string): Promise<MarkingScheme> {
  const parts: (string | Part)[] = [fillTemplate(config('prompt_scheme_draft'), { subject, level })];
  if (source.text) parts.push(`QUESTION PAPER:\n${source.text}`);
  for (const image of source.images ?? []) parts.push(await blobToPart(image));
  if (source.pdf) parts.push(await blobToPart(source.pdf));
  if (parts.length === 1) throw new Error('Add the question paper (photo, PDF or typed questions) first.');

  const started = performance.now();
  const { text } = await authorGenerate(DRAFT_SCHEMA, parts);
  recordInference({ kind: 'author', source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = Draft.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('The drafted marking scheme was incomplete. Try a clearer photo or type the questions.');
  const questions = parsed.data.questions.map(toQuestion).filter((q): q is Question => q !== null).sort((a, b) => a.q - b.q);
  return { subject, level, questions };
}

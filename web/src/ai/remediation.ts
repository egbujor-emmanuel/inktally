// Cloud: turns the class's actual mistakes on one question into a short catch-up activity.
// Only anonymised wrong answers are sent (no names, no images).
import { Schema } from 'firebase/ai';
import { z } from 'zod';
import type { Question } from '../domain/types';
import { fillTemplate } from './config';
import { authorModel, config } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';

const CATCH_UP_SCHEMA = Schema.object({
  properties: {
    explanation: Schema.string(),
    practice: Schema.array({ items: Schema.object({ properties: { question: Schema.string(), answer: Schema.string() } }) }),
  },
});
const CatchUp = z.object({
  explanation: z.string().min(1),
  practice: z.array(z.object({ question: z.string(), answer: z.string() })).min(1),
});
export type CatchUpSheet = z.infer<typeof CatchUp>;

const MAX_MISTAKES_SENT = 25;

export async function makeCatchUp(question: Question, mistakes: string[], subject: string, level: string): Promise<CatchUpSheet> {
  const unique = [...new Set(mistakes.map((m) => m.trim()).filter(Boolean))].slice(0, MAX_MISTAKES_SENT);
  if (!unique.length) throw new Error('No mistakes to work from yet.');
  const prompt = fillTemplate(config('prompt_remediation'), {
    level, subject, q: question.q, prompt: question.prompt, mistakes: unique.map((m) => `"${m}"`).join(', '),
  });
  const started = performance.now();
  const response = await withRetry(() => authorModel(CATCH_UP_SCHEMA).generateContent(prompt));
  recordInference({ kind: 'author', source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = CatchUp.safeParse(JSON.parse(response.response.text()));
  if (!parsed.success) throw new Error('The catch-up sheet came back incomplete. Please try again.');
  return parsed.data;
}

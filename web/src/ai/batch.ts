// Quota-saving cloud calls: one request reads every answer box on a sheet, and one request checks every marking
// point of a theory answer. Used only when the read goes to the cloud anyway (no on-device model, or the cloud
// verification pass). On-device (Gemini Nano) stays one small prompt per answer — its limits are why we split.
import { InferenceMode, Schema, type Part } from 'firebase/ai';
import { z } from 'zod';
import type { QuestionType } from '../domain/types';
import { asPromptData, fillTemplate } from './config';
import { blobToPart, config, readerModel, judgeModel } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';
import { modelJson } from './config';

const HINTS: Record<QuestionType, string> = {
  objective: 'a multiple-choice answer: a single letter A, B, C, D or E',
  numeric: 'the answer part of a sum, for example "= 42" or "₦27,000"',
  short: 'a one-word or short-phrase answer',
  points: "a student's short written answer (one or more sentences)",
};

const BATCH_SCHEMA = Schema.object({
  properties: { answers: Schema.array({ items: Schema.object({ properties: { q: Schema.integer(), text: Schema.string() } }) }) },
});
const BatchResponse = z.object({ answers: z.array(z.object({ q: z.number().int(), text: z.string() })) });

const POINTS_SCHEMA = Schema.object({
  properties: {
    points: Schema.array({ items: Schema.boolean() }),
    rejected: Schema.array({ items: Schema.boolean() }),
  },
});
const PointsResponse = z.object({ points: z.array(z.boolean()), rejected: z.array(z.boolean()) });

const clean = (raw: string) => raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

/** Whether cloud reads should be batched (Remote Config switch, on by default). */
export const batchingEnabled = (): boolean => config('batch_cloud_reads').trim().toLowerCase() === 'true';

export interface CropToRead { q: number; type: QuestionType; blob: Blob }

/** Reads every answer box in ONE cloud request. Returns text by question number (missing = empty). */
export async function readAnswersBatch(crops: CropToRead[], kind: 'read' | 'verify' = 'read'): Promise<Map<number, string>> {
  if (!crops.length) return new Map();
  const parts: (string | Part)[] = [config('prompt_read_batch')];
  for (const c of crops) {
    parts.push(`ANSWER ${c.q} — ${HINTS[c.type]}:`);
    parts.push(await blobToPart(c.blob));
  }
  const started = performance.now();
  const response = await withRetry(() => readerModel(BATCH_SCHEMA, InferenceMode.ONLY_IN_CLOUD).generateContent(parts));
  recordInference({ kind, source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = BatchResponse.safeParse(modelJson(clean(response.response.text())));
  if (!parsed.success) throw new Error('The model returned an unexpected reading format');
  return new Map(parsed.data.answers.map((a) => [a.q, a.text.trim()]));
}

/** Checks every marking point (and, if none are found, every "do not accept" statement) in ONE cloud request. */
/** question: the question text, so a short answer is judged as a reply to it. template: the Remote Config prompt by default; the benchmark passes a candidate to compare wordings. */
export async function checkPointsBatch(answer: string, points: readonly string[], reject: readonly string[] = [], question = '', template = config('prompt_points_batch')): Promise<{ found: string[]; rejected: string[] }> {
  if (!answer.trim() || !points.length) return { found: [], rejected: [] };
  const prompt = fillTemplate(template, {
    answer: asPromptData(answer),
    question: asPromptData(question),
    points: points.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    reject: reject.length ? reject.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'none',
  });
  const started = performance.now();
  const response = await withRetry(() => judgeModel(POINTS_SCHEMA, InferenceMode.ONLY_IN_CLOUD).generateContent(prompt));
  recordInference({ kind: 'points', source: 'in_cloud', ms: Math.round(performance.now() - started) });
  const parsed = PointsResponse.safeParse(modelJson(clean(response.response.text())));
  if (!parsed.success) throw new Error('The model returned an unexpected point-check format');
  const found = points.filter((_, i) => parsed.data.points[i] === true);
  // Same rule as the per-point path: "do not accept" only matters when no marking point was found.
  const rejected = found.length ? [] : reject.filter((_, i) => parsed.data.rejected[i] === true);
  return { found, rejected };
}

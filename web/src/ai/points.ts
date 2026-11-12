// Theory answers: one tiny yes/no question per marking point. Small prompts fit the on-device
// model's limits (a long single prompt hit its output limit in testing) and each answer is auditable.
import { Schema } from 'firebase/ai';
import { z } from 'zod';
import type { ReadSource } from '../domain/types';
import { fillTemplate } from './config';
import { config, judgeModel, type ReadMode } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';

const YES_NO_SCHEMA = Schema.object({ properties: { present: Schema.boolean() } });
const YesNo = z.object({ present: z.boolean() });

export interface PointsResult { found: string[]; rejected: string[]; sources: ReadSource[] }

async function askPresent(prompt: string, mode: ReadMode | undefined, sources: ReadSource[]): Promise<boolean> {
  const started = performance.now();
  const response = await withRetry(() => judgeModel(YES_NO_SCHEMA, mode).generateContent(prompt));
  const source: ReadSource = response.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
  recordInference({ kind: 'points', source, ms: Math.round(performance.now() - started) });
  sources.push(source);
  const raw = response.response.text().replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  const parsed = YesNo.safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.present;
}

/**
 * Returns the marking points the model judges present, and — only when none are found —
 * which "do not accept" statements the answer makes (so a known wrong answer is a confident zero).
 */
export async function checkPoints(answer: string, points: readonly string[], reject: readonly string[] = [], mode?: ReadMode): Promise<PointsResult> {
  if (!answer.trim()) return { found: [], rejected: [], sources: [] };
  const found: string[] = [];
  const rejected: string[] = [];
  const sources: ReadSource[] = [];
  const rejectList = reject.length ? reject.map((r) => `"${r}"`).join(', ') : 'none';
  for (const point of points) {
    if (await askPresent(fillTemplate(config('prompt_point_check'), { answer, point, reject: rejectList }), mode, sources)) found.push(point);
  }
  if (!found.length) {
    for (const statement of reject) {
      if (await askPresent(fillTemplate(config('prompt_point_check'), { answer, point: statement, reject: 'none' }), mode, sources)) rejected.push(statement);
    }
  }
  return { found, rejected, sources };
}

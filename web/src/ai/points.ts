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

export interface PointsResult { found: string[]; sources: ReadSource[] }

/** Returns the marking points the model judges present in the pupil's answer. */
export async function checkPoints(answer: string, points: readonly string[], reject: readonly string[] = [], mode?: ReadMode): Promise<PointsResult> {
  if (!answer.trim()) return { found: [], sources: [] };
  const found: string[] = [];
  const sources: ReadSource[] = [];
  for (const point of points) {
    const prompt = fillTemplate(config('prompt_point_check'), {
      answer, point, reject: reject.length ? reject.map((r) => `"${r}"`).join(', ') : 'none',
    });
    const started = performance.now();
    const response = await withRetry(() => judgeModel(YES_NO_SCHEMA, mode).generateContent(prompt));
    const source: ReadSource = response.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
    recordInference({ kind: 'points', source, ms: Math.round(performance.now() - started) });
    sources.push(source);
    const raw = response.response.text().replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
    const parsed = YesNo.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.present) found.push(point);
  }
  return { found, sources };
}

// Reading only: the model transcribes one answer box. It never sees the question, so it cannot
// "auto-correct" a pupil's wrong answer into the right one (measured failure of whole-page reading on-device).
import { InferenceMode, Schema } from 'firebase/ai';
import { z } from 'zod';
import type { QuestionType, ReadSource } from '../domain/types';
import { fillTemplate } from './config';
import { blobToPart, config, readerModel, type ReadMode } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';

const READ_SCHEMA = Schema.object({ properties: { text: Schema.string() } });
const ReadResponse = z.object({ text: z.string() });

const HINTS: Record<QuestionType, string> = {
  objective: 'It is a multiple-choice answer: a single letter A, B, C, D or E.',
  numeric: 'It is the answer part of a sum, for example "= 42" or "₦27,000".',
  short: 'It is a one-word or short-phrase answer in English.',
  points: "It is a student's short written answer in English (one or more sentences).",
};

export interface ReadResult { text: string; source: ReadSource; ms: number }

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(cleaned);
}

/** Transcribes one cropped answer box. `mode` forces cloud for verification passes. */
export async function readAnswer(crop: Blob, type: QuestionType, mode?: ReadMode): Promise<ReadResult> {
  const prompt = fillTemplate(config('prompt_read_crop'), { hint: HINTS[type] });
  const image = await blobToPart(crop);
  const started = performance.now();
  const response = await withRetry(() => readerModel(READ_SCHEMA, mode).generateContent([prompt, image]));
  const ms = Math.round(performance.now() - started);
  const source: ReadSource = response.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
  recordInference({ kind: mode === InferenceMode.ONLY_IN_CLOUD ? 'verify' : 'read', source, ms });
  const parsed = ReadResponse.safeParse(parseJson(response.response.text()));
  if (!parsed.success) throw new Error('The model returned an unexpected reading format');
  return { text: parsed.data.text.trim(), source, ms };
}

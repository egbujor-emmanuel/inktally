// Exercise-book mode: no printed sheet, so the model transcribes every numbered answer on the page.
// PREFER_IN_CLOUD: the cloud reads whole pages reliably (14/14 in our benchmark); offline we fall back to
// on-device, whose whole-page reads can "auto-correct" pupils, so callers must treat those as unverified.
import { InferenceMode, Schema } from 'firebase/ai';
import { z } from 'zod';
import type { ReadSource } from '../domain/types';
import { blobToPart, readerModel, type ReadMode } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';

const PAGE_SCHEMA = Schema.object({
  properties: { answers: Schema.array({ items: Schema.object({ properties: { q: Schema.integer(), text: Schema.string() } }) }) },
});
const PageResponse = z.object({ answers: z.array(z.object({ q: z.number().int(), text: z.string() })) });

const PAGE_PROMPT = 'This is a photo of a student\'s handwritten exercise-book page. For each numbered answer, transcribe exactly what the student '
  + 'wrote after the question number, character by character. Keep every mistake — do NOT calculate, solve or correct anything. '
  + 'Ignore the student\'s name, the date and any teacher marks. Only include these question numbers: {numbers}.';

export interface PageRead { answers: Map<number, string>; source: ReadSource }

export async function readPage(photo: Blob, questionNumbers: number[], mode: ReadMode = InferenceMode.PREFER_IN_CLOUD): Promise<PageRead> {
  const prompt = PAGE_PROMPT.replace('{numbers}', questionNumbers.join(', '));
  const image = await blobToPart(photo);
  const started = performance.now();
  const response = await withRetry(() => readerModel(PAGE_SCHEMA, mode).generateContent([prompt, image]));
  const source: ReadSource = response.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
  recordInference({ kind: mode === InferenceMode.ONLY_IN_CLOUD ? 'verify' : 'read', source, ms: Math.round(performance.now() - started) });
  const raw = response.response.text().replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  const parsed = PageResponse.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('Could not read the page. Try a sharper photo in good light.');
  return { answers: new Map(parsed.data.answers.map((a) => [a.q, a.text.trim()])), source };
}

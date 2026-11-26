// Exercise-book mode: no printed sheet, so the model transcribes every numbered answer on the page.
// PREFER_IN_CLOUD: the cloud reads whole pages reliably (14/14 in our benchmark); offline we fall back to
// on-device, whose whole-page reads can "auto-correct" pupils, so callers must treat those as unverified.
import { InferenceMode, Schema } from 'firebase/ai';
import { qLabel } from '../domain/types';
import { z } from 'zod';
import type { ReadSource } from '../domain/types';
import { blobToPart, readerModel, type ReadMode } from './models';
import { withRetry } from './retry';
import { recordInference } from './telemetry';
import { alignPageAnswers } from './pageAlign';
import { modelJson } from './config';

const PAGE_SCHEMA = Schema.object({
  properties: { answers: Schema.array({ items: Schema.object({ properties: { label: Schema.string(), q: Schema.integer(), text: Schema.string() } }) }) },
});
const PageResponse = z.object({ answers: z.array(z.object({ label: z.string().optional(), q: z.number().int(), text: z.string() })) });

/** Same wording on Android (Ai.kt PAGE_PROMPT). */
const PAGE_PROMPT = 'This is a photo of a student\'s handwritten exercise-book page (several pages may be joined one above the other, '
  + 'separated by a grey band; an answer can continue onto the next page). The photo may be sideways or upside down. '
  + 'Go through the page in reading order. For each answer, text is the question label exactly as the student wrote it followed by '
  + 'everything written after it up to the next label, character by character (for example "7a) I ∝ V if the temperature is constant"). '
  + 'If nothing is written after a label before the next label, text is just the label. Put the label alone in label. '
  + 'Keep every mistake — do NOT calculate, '
  + 'solve or correct anything. Write a fraction set out with one number above another as (top)/(bottom), for example 50/0.4. Copy scientific and mathematical signs as the sign itself, for example ∝ (is proportional to), λ, ρ, Ω, √, ² and ⁻¹. '
  + 'Ignore the student\'s name, the date and any teacher marks. Only include these questions, and put the number on the left of '
  + 'the student\'s label into q: {numbers}.';

export interface PageRead { answers: Map<number, string>; source: ReadSource }

export async function readPage(photo: Blob, questions: { q: number; label?: string }[], mode: ReadMode = InferenceMode.PREFER_IN_CLOUD): Promise<PageRead> {
  const prompt = PAGE_PROMPT.replace('{numbers}', questions.map((x) => `${x.q} = "${qLabel(x)}"`).join(', '));
  const image = await blobToPart(photo);
  const started = performance.now();
  const response = await withRetry(() => readerModel(PAGE_SCHEMA, mode).generateContent([prompt, image]));
  const source: ReadSource = response.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
  recordInference({ kind: mode === InferenceMode.ONLY_IN_CLOUD ? 'verify' : 'read', source, ms: Math.round(performance.now() - started) });
  const raw = response.response.text().replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  const parsed = PageResponse.safeParse(modelJson(raw));
  if (!parsed.success) throw new Error('Could not read the page. Try a sharper photo in good light.');
  return { answers: alignPageAnswers(parsed.data.answers, questions), source };
}

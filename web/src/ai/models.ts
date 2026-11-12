// Hybrid model factories. Every call through here goes via Firebase AI Logic.
import { getGenerativeModel, InferenceMode, Schema, type GenerativeModel, type ObjectSchema, type Part } from 'firebase/ai';
import { getValue } from 'firebase/remote-config';
import { ai, remoteConfig } from '../firebase/app';
import type { RemoteKey } from './config';
import { withRetry } from './retry';

export type ReadMode = (typeof InferenceMode)[keyof typeof InferenceMode];
const REQUEST_TIMEOUT_MS = 120_000;

export function config(key: RemoteKey): string {
  return getValue(remoteConfig, key).asString();
}

/** Chrome's Prompt API wants a plain JSON Schema object; serialising the SDK schema produces one. */
function plainJsonSchema(schema: ObjectSchema): object {
  return JSON.parse(JSON.stringify(schema)) as object;
}

function readMode(override?: ReadMode): ReadMode {
  if (override) return override;
  const fromConfig = config('read_mode') as ReadMode;
  return Object.values(InferenceMode).includes(fromConfig) ? fromConfig : InferenceMode.PREFER_ON_DEVICE;
}

/**
 * Reads handwriting: on-device (Gemini Nano via Chrome) when available, else the cloud model.
 * The same JSON schema constrains both, so callers get one shape regardless of where it ran.
 */
export function readerModel(schema: ObjectSchema, mode?: ReadMode): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: readMode(mode),
    inCloudParams: {
      model: config('cloud_read_model'),
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    },
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
      promptOptions: { responseConstraint: plainJsonSchema(schema) },
    },
  }, { timeout: REQUEST_TIMEOUT_MS });
}

/** Text-only yes/no style checks (marking points). Small enough to run on-device. */
export function judgeModel(schema: ObjectSchema, mode?: ReadMode): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: readMode(mode),
    inCloudParams: {
      model: config('cloud_read_model'),
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    },
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
      promptOptions: { responseConstraint: plainJsonSchema(schema) },
    },
  }, { timeout: REQUEST_TIMEOUT_MS });
}

/** Long-form authoring (marking schemes, catch-up worksheets): cloud only, needs PDFs and long output. */
export function authorModel(schema: ObjectSchema, modelName = config('cloud_author_model'), timeout = AUTHOR_TIMEOUT_MS): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: modelName,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    },
  }, { timeout });
}

const AUTHOR_TIMEOUT_MS = 30_000;
const AUTHOR_ATTEMPTS = 1;
const FALLBACK_ATTEMPTS = 3;

/**
 * Generates with the stronger authoring model, falling back to the fast read model when the
 * stronger one is overloaded or slow (we measured "high demand" errors during testing).
 */
export async function authorGenerate(schema: ObjectSchema, request: string | (string | Part)[]): Promise<{ text: string; model: string }> {
  const primary = config('cloud_author_model');
  try {
    const r = await withRetry(() => authorModel(schema, primary).generateContent(request), AUTHOR_ATTEMPTS);
    return { text: r.response.text(), model: primary };
  } catch {
    const fallback = config('cloud_read_model');
    if (fallback === primary) throw new Error('The cloud is busy right now. Please try again in a minute.');
    const r = await withRetry(() => authorModel(schema, fallback, REQUEST_TIMEOUT_MS).generateContent(request), FALLBACK_ATTEMPTS);
    return { text: r.response.text(), model: fallback };
  }
}

export async function blobToPart(blob: Blob): Promise<Part> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  return { type: 'inlineData', inlineData: { data: btoa(binary), mimeType: blob.type || 'image/png' } };
}

/**
 * Chrome needs a user gesture to start the on-device model download. Call from a click handler.
 * Resolves when ready; progress is reported 0..1.
 */
export async function warmUpOnDevice(onProgress?: (fraction: number) => void): Promise<void> {
  const model = readerModel(Schema.object({ properties: { text: Schema.string() } }), InferenceMode.PREFER_ON_DEVICE);
  await model.initializeDeviceModel(onProgress);
}

export type DeviceAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

/** Reports whether Chrome's built-in Gemini Nano can run here (no download is triggered). */
export async function onDeviceAvailability(): Promise<DeviceAvailability> {
  const lm = (globalThis as { LanguageModel?: { availability: (o?: object) => Promise<string> } }).LanguageModel;
  if (!lm) return 'unsupported';
  try {
    const status = await lm.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
    return (['available', 'downloadable', 'downloading', 'unavailable'].includes(status) ? status : 'unavailable') as DeviceAvailability;
  } catch {
    return 'unavailable';
  }
}

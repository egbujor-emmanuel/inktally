// Hybrid model factories. Every call through here goes via Firebase AI Logic.
import { getGenerativeModel, InferenceMode, Schema, ThinkingLevel, type GenerativeModel, type ObjectSchema, type Part, type ThinkingConfig } from 'firebase/ai';
import { getValue } from 'firebase/remote-config';
import { ai, remoteConfig } from '../firebase/app';
import type { RemoteKey } from './config';
import { isTransient, withRetry } from './retry';
import { friendlyCloudError } from './errors';

export type ReadMode = (typeof InferenceMode)[keyof typeof InferenceMode];
const REQUEST_TIMEOUT_MS = 120_000;

export function config(key: RemoteKey): string {
  return getValue(remoteConfig, key).asString();
}

/** Thinking level from Remote Config; anything unrecognised falls back to the model's default. */
function thinking(key: 'read_thinking' | 'author_thinking'): { thinkingConfig?: ThinkingConfig } {
  const level = config(key).trim().toUpperCase();
  return (Object.values(ThinkingLevel) as string[]).includes(level) ? { thinkingConfig: { thinkingLevel: level as ThinkingConfig['thinkingLevel'] } } : {};
}

/** Chrome's Prompt API wants a plain JSON Schema object; serialising the SDK schema produces one. */
function plainJsonSchema(schema: ObjectSchema): object {
  return JSON.parse(JSON.stringify(schema)) as object;
}

/** Cached once per session: if Chrome cannot run Gemini Nano here, skip the doomed on-device attempt. */
let deviceUsable: boolean | null = null;
/** True only when Gemini Nano is downloaded and ready, i.e. reading works with no connection at all. */
let deviceReadyOffline = false;
export const canReadOffline = (): boolean => deviceReadyOffline;
export async function refreshDeviceCapability(): Promise<void> {
  const status = await onDeviceAvailability();
  deviceUsable = status === 'available' || status === 'downloadable' || status === 'downloading';
  deviceReadyOffline = status === 'available';
}

function readMode(override?: ReadMode): ReadMode {
  if (override) return override;
  const fromConfig = config('read_mode') as ReadMode;
  const mode = Object.values(InferenceMode).includes(fromConfig) ? fromConfig : InferenceMode.PREFER_ON_DEVICE;
  if (deviceUsable === false && mode === InferenceMode.PREFER_ON_DEVICE) return InferenceMode.PREFER_IN_CLOUD;
  return mode;
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
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...thinking('read_thinking') },
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
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...thinking('read_thinking') },
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
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2, ...thinking('author_thinking') },
    },
  }, { timeout });
}

/** A full question-paper photo took 10-45 s in testing; give the first attempt room before retrying. */
const AUTHOR_TIMEOUT_MS = 60_000;
const AUTHOR_ATTEMPTS = 1;
const FALLBACK_ATTEMPTS = 2;

/**
 * Generates with the stronger authoring model, falling back to the fast read model when the
 * stronger one is overloaded or slow (we measured "high demand" errors during testing).
 */
export async function authorGenerate(schema: ObjectSchema, request: string | (string | Part)[]): Promise<{ text: string; model: string }> {
  const primary = config('cloud_author_model');
  try {
    const r = await withRetry(() => authorModel(schema, primary).generateContent(request), AUTHOR_ATTEMPTS);
    return { text: r.response.text(), model: primary };
  } catch (primaryError: unknown) {
    const fallback = config('cloud_read_model');
    if (fallback === primary || !isTransient(primaryError)) {
      // Same model, or a non-transient failure (App Check, permission, bad request): retrying cannot help.
      if (fallback === primary && isTransient(primaryError)) {
        const r = await withRetry(() => authorModel(schema, primary, REQUEST_TIMEOUT_MS).generateContent(request), FALLBACK_ATTEMPTS).catch((e: unknown) => { throw friendlyCloudError(e); });
        return { text: r.response.text(), model: primary };
      }
      throw friendlyCloudError(primaryError);
    }
    const r = await withRetry(() => authorModel(schema, fallback, REQUEST_TIMEOUT_MS).generateContent(request), FALLBACK_ATTEMPTS).catch((e: unknown) => { throw friendlyCloudError(e); });
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

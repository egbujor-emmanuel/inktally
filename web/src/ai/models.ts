// Hybrid model factories. Every call through here goes via Firebase AI Logic.
import { getGenerativeModel, InferenceMode, Schema, ThinkingLevel, type GenerativeModel, type ObjectSchema, type Part, type ThinkingConfig } from 'firebase/ai';
import { getValue } from 'firebase/remote-config';
import { ai, remoteConfig } from '../firebase/app';
import type { RemoteKey } from './config';
import { isTransient, setModelErrorHandler, withRetry } from './retry';
import { friendlyCloudError } from './errors';

export type ReadMode = (typeof InferenceMode)[keyof typeof InferenceMode];
const REQUEST_TIMEOUT_MS = 120_000;

export function config(key: RemoteKey): string {
  return getValue(remoteConfig, key).asString();
}

// ---- Dynamic routing across cloud models (quota-aware) ----
const QUOTA = /quota|RESOURCE_EXHAUSTED|\b429\b|rate.?limit/i;
const UNSUPPORTED_THINKING = /thinking level .* not supported|thinking.*not supported/i;
/** Model -> time (ms) until which it is skipped. Rate limits expire in a minute; daily quotas in hours. */
const exhausted = new Map<string, number>();
const isExhausted = (m: string) => (exhausted.get(m) ?? 0) > Date.now();
/** "High demand" from one model: give it a minute and send requests to the next model meanwhile (25 Nov). */
const OVERLOADED = /high demand|overloaded|\b503\b|UNAVAILABLE/i;
const BUSY_MS = 60_000;
const busy = new Map<string, number>();
const isBusy = (m: string) => (busy.get(m) ?? 0) > Date.now();
const noThinking = new Set<string>();
const errorText = (e: unknown) => (e instanceof Error ? `${e.name} ${e.message}` : String(e));
/** Which cloud model each failed request used, so concurrent requests never blame the wrong model. */
const modelOfError = new WeakMap<object, string>();
export const failedModel = (error: unknown): string | undefined => (error !== null && typeof error === 'object' ? modelOfError.get(error) : undefined);

/** Tags any error from this model instance with its cloud model name (per request, no shared state). */
function attributed(model: GenerativeModel, name: string): GenerativeModel {
  const generate = model.generateContent.bind(model);
  model.generateContent = async (request) => {
    try { return await generate(request); } catch (error: unknown) {
      if (error !== null && typeof error === 'object') modelOfError.set(error, name);
      throw error;
    }
  };
  return model;
}

/** Primary cloud model, then the Remote Config fallbacks, skipping any whose quota is used up or that is overloaded right now. */
export function activeCloudModel(primary = config('cloud_read_model')): string {
  const chain = [primary, ...config('cloud_fallback_models').split(',').map((m) => m.trim()).filter(Boolean)];
  return chain.find((m) => !isExhausted(m) && !isBusy(m)) ?? chain.find((m) => !isExhausted(m)) ?? primary;
}

/** Decides whether a failed request should be retried on another model. Exported for tests. */
export function handleModelError(error: unknown): boolean {
  const model = failedModel(error);
  if (!model) return false;
  const text = errorText(error);
  if (UNSUPPORTED_THINKING.test(text) && !noThinking.has(model)) { noThinking.add(model); return true; }
  if (QUOTA.test(text)) {
    // Already marked used up and still asked for: the caller's own chain has nothing else left, so switching again
    // would just repeat the same request (this looped forever when every model's quota ran out, 23 Nov).
    if (isExhausted(model)) return false;
    const daily = /per ?day|PerDay|daily/i.test(text);
    exhausted.set(model, Date.now() + (daily ? 12 * 3_600_000 : 60_000));
    const next = activeCloudModel();
    return next !== model && !isExhausted(next); // only retry if a model with quota left remains
  }
  if (OVERLOADED.test(text)) {
    // Already benched and still asked for: every model is busy, so back off on this one instead of switching again.
    if (isBusy(model)) return false;
    busy.set(model, Date.now() + BUSY_MS);
    const next = activeCloudModel();
    return next !== model && !isBusy(next);
  }
  return false;
}
setModelErrorHandler(handleModelError);

/** Test hook: forget every exhausted / no-thinking model. */
export function resetModelRouting(): void { exhausted.clear(); busy.clear(); noThinking.clear(); }

/** Thinking level from Remote Config; anything unrecognised (or unsupported by the model) uses the model's default. */
function thinking(key: 'read_thinking' | 'author_thinking', model: string): { thinkingConfig?: ThinkingConfig } {
  if (noThinking.has(model)) return {};
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
/** Re-checks Gemini Nano. Called at start-up, after a download finishes, and whenever the connection changes. */
export async function refreshDeviceCapability(): Promise<DeviceAvailability> {
  const status = await onDeviceAvailability();
  deviceUsable = status === 'available' || status === 'downloadable' || status === 'downloading';
  deviceReadyOffline = status === 'available';
  return status;
}

/**
 * True when a read with this mode will go to the cloud (so it can be batched). Same rule as Android's
 * Ai.cloudWillRead(deviceReady): unless reads are forced on-device, they go to the cloud whenever Gemini Nano is not
 * downloaded and ready (a "downloadable" model is fetched in the background; this read still goes to the cloud).
 */
export function cloudWillRead(override?: ReadMode): boolean {
  const mode = readMode(override);
  if (mode === InferenceMode.ONLY_ON_DEVICE) return false;
  return mode === InferenceMode.ONLY_IN_CLOUD || mode === InferenceMode.PREFER_IN_CLOUD || !deviceReadyOffline;
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
  const cloudModel = activeCloudModel();
  return attributed(getGenerativeModel(ai, {
    mode: readMode(mode),
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...thinking('read_thinking', cloudModel) },
    },
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
      promptOptions: { responseConstraint: plainJsonSchema(schema) },
    },
  }, { timeout: REQUEST_TIMEOUT_MS }), cloudModel);
}

/** Text-only yes/no style checks (marking points). Small enough to run on-device. */
export function judgeModel(schema: ObjectSchema, mode?: ReadMode): GenerativeModel {
  const cloudModel = activeCloudModel();
  return attributed(getGenerativeModel(ai, {
    mode: readMode(mode),
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...thinking('read_thinking', cloudModel) },
    },
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
      promptOptions: { responseConstraint: plainJsonSchema(schema) },
    },
  }, { timeout: REQUEST_TIMEOUT_MS }), cloudModel);
}

/** Long-form authoring (marking schemes, catch-up worksheets): cloud only, needs PDFs and long output. */
export function authorModel(schema: ObjectSchema, modelName = config('cloud_author_model'), timeout = AUTHOR_TIMEOUT_MS): GenerativeModel {
  const model = activeCloudModel(modelName);
  return attributed(getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...thinking('author_thinking', model) },
    },
  }, { timeout }), model);
}

/** A full question-paper photo took 10-45 s in testing; give the first attempt room before retrying. */
const AUTHOR_TIMEOUT_MS = 60_000;

/**
 * Generates with the stronger authoring model, falling back to the fast read model when the
 * stronger one is overloaded or slow (we measured "high demand" errors during testing).
 */
export async function authorGenerate(schema: ObjectSchema, request: string | (string | Part)[]): Promise<{ text: string; model: string }> {
  // Every allowed cloud model in turn; when all are overloaded (seen in the WAEC dry run, 23 Nov), pause and go round
  // again. One overall budget, so the teacher gets an answer or a clear message, never an endless wait.
  const deadline = Date.now() + AUTHOR_BUDGET_MS;
  const primary = config('cloud_author_model');
  const chain = [...new Set([primary, config('cloud_read_model'), ...config('cloud_fallback_models').split(',').map((m) => m.trim())].filter(Boolean))];
  let lastError: unknown = new Error('timeout: the cloud took too long');
  for (let round = 0; round <= AUTHOR_PAUSES_MS.length; round++) {
    for (const model of chain) {
      if (isExhausted(model)) continue;
      const left = deadline - Date.now();
      if (left < MIN_ATTEMPT_MS) throw friendlyCloudError(lastError);
      const timeout = Math.min(model === primary ? AUTHOR_TIMEOUT_MS : REQUEST_TIMEOUT_MS, left);
      try {
        const r = await withRetry(() => authorModel(schema, model, timeout).generateContent(request), 1);
        return { text: r.response.text(), model };
      } catch (error: unknown) {
        lastError = error;
        const busy = isTransient(error) || /quota|RESOURCE_EXHAUSTED|\b429\b/i.test(error instanceof Error ? error.message : String(error));
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        // App Check, permission or a bad request: another model or another try cannot help.
        if (!busy || offline) throw friendlyCloudError(error);
      }
    }
    const pause = AUTHOR_PAUSES_MS[round];
    if (pause === undefined || deadline - Date.now() < pause + MIN_ATTEMPT_MS) break;
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
  throw friendlyCloudError(lastError);
}

/** The longest one drafting call may take, across every model and round. */
const AUTHOR_BUDGET_MS = 150_000;
/** Pauses before going round the models again when all of them are overloaded. */
const AUTHOR_PAUSES_MS = [5_000, 15_000];
/** Not worth starting another attempt with less time than this left. */
const MIN_ATTEMPT_MS = 15_000;

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

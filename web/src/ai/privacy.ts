// Private mode: pupils' work never reaches a cloud AI. Every reading and marking-point check runs on this device
// (Gemini Nano), the cloud check is off, and only the teacher's own material (question paper, marking guide) may be
// sent to the cloud to draft an answer key. Photos never leave the device in any mode (they live in IndexedDB).
//
// Enforced twice: the model layer asks only for on-device inference, and a network guard refuses every request to a
// cloud AI endpoint that is not tagged as the teacher's own material. The guard is what makes the promise hold even
// if the SDK falls back to the cloud by itself (a browser without Chrome's Prompt API sends ONLY_ON_DEVICE requests to
// the cloud). Same rules on Android (ai/Privacy.kt).
import { useSyncExternalStore } from 'react';

const KEY = 'inktally.privateMode';

function stored(): boolean {
  try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}

let privateMode = stored();
const listeners = new Set<() => void>();

export const isPrivate = (): boolean => privateMode;

/** A device setting: the teacher decides, per phone or laptop, that pupils' work stays on it. */
export function setPrivate(on: boolean): void {
  privateMode = on;
  try { globalThis.localStorage?.setItem(KEY, on ? '1' : '0'); } catch { /* the setting still holds for this session */ }
  listeners.forEach((listener) => listener());
}

export function usePrivateMode(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, isPrivate, isPrivate);
}

/**
 * A random key made fresh every time the app starts. Only drafting code adds it, inside TEACHER_MATERIAL; nothing a pupil
 * writes and no Remote Config value can contain it, so the tag cannot be forged (security review, 26 Nov).
 */
const SESSION_KEY = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^0-9a-z]/gi, '');

/** Added to a drafting request built only from the teacher's own material. Nothing else may reach the cloud in Private mode. */
export const TEACHER_MATERIAL = `Source: the teacher’s own question paper or marking guide (no pupil work), ref ${SESSION_KEY}.`;

export const PRIVATE_BLOCKED = 'Private mode is on, so pupils’ work is read only on this device and never sent to the cloud.';

export class PrivateModeError extends Error {
  constructor() { super(PRIVATE_BLOCKED); this.name = 'PrivateModeError'; }
}

// Includes regional Vertex endpoints such as us-central1-aiplatform.googleapis.com.
const AI_HOST = /(^|[.-])(firebasevertexai|generativelanguage|aiplatform)\.googleapis\.com$/i;
/** What a request carrying pupil work looks like, whatever host it is sent to: an image part or a student's answer. */
const PUPIL_SHAPED = /inlineData|<student_answer>/;

/**
 * True when Private mode must refuse this request: one to a cloud AI endpoint, or one shaped like pupil work to any
 * host, unless it carries this session's teacher-material key.
 */
export function blocksCloudRequest(url: string, body: string | null): boolean {
  if (!privateMode) return false;
  const text = body ?? '';
  if (text.includes(SESSION_KEY)) return false;
  let host = '';
  try { host = new URL(url).hostname.replace(/\.$/, ''); } catch { /* unparseable: judged by its body alone */ }
  return AI_HOST.test(host) || PUPIL_SHAPED.test(text);
}

async function bodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (typeof init?.body === 'string') return init.body;
  if (input instanceof Request) return input.clone().text().catch(() => null);
  return null;
}

let installed = false;

/** Wraps fetch once, at start-up, so no code path (ours or the SDK's) can send pupils' work in Private mode. */
export function installPrivacyGuard(target: { fetch: typeof fetch } = globalThis): void {
  if (installed && target === globalThis) return;
  const original = target.fetch.bind(target);
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (privateMode && blocksCloudRequest(url, await bodyText(input, init))) throw new PrivateModeError();
    return original(input, init);
  };
  if (target === globalThis) installed = true;
}

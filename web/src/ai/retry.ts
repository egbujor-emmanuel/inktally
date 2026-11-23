// Cloud models are sometimes overloaded ("high demand", 5xx, timeouts). We measured this in testing,
// so every cloud-capable call retries with exponential backoff before giving up.

const MAX_ATTEMPTS = 4;
/** At most this many immediate switches to another model per call, so a misrouted quota error can never loop. */
const MAX_SWITCHES = 3;
const BASE_DELAY_MS = 2_000;
/** Set by the model layer: switches to the next cloud model on quota / unsupported-option errors. Returns true if it switched. */
let onModelError: ((error: unknown) => boolean) | null = null;
export function setModelErrorHandler(handler: (error: unknown) => boolean): void { onModelError = handler; }

const TRANSIENT = /high demand|overloaded|unavailable|deadline|timeout|\b50[0-4]\b|fetch-error|network/i;

export function isTransient(error: unknown): boolean {
  return TRANSIENT.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = MAX_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  let switches = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      // Quota used up on this model (or it rejects an option): route to the next model and try again at once.
      if (switches < MAX_SWITCHES && onModelError?.(error)) { switches += 1; attempt -= 1; continue; }
      if (!isTransient(error) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

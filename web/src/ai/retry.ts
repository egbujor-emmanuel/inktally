// Cloud models are sometimes overloaded ("high demand", 5xx, timeouts). We measured this in testing,
// so every cloud-capable call retries with exponential backoff before giving up.

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 2_000;
const TRANSIENT = /high demand|overloaded|unavailable|deadline|timeout|\b50[0-4]\b|fetch-error|network/i;

export function isTransient(error: unknown): boolean {
  return TRANSIENT.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = MAX_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Turns raw Firebase / Gemini failures into messages a teacher can act on, without hiding the cause.

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/app.?check|attestation|appCheck\//i, 'This browser could not be verified by App Check, so the cloud refused the request. Reload the page; if it keeps happening, tell us.'],
  [/permission|insufficient|PERMISSION_DENIED/i, 'The server refused to save this (permission denied). Reload the page and try again.'],
  [/quota|RESOURCE_EXHAUSTED|429/i, 'The free cloud quota is used up for the moment. Try again in a minute.'],
  [/high demand|overloaded|unavailable|\b50[0-4]\b/i, 'The cloud model is overloaded right now. Try again in a minute.'],
  [/deadline|timeout|timed out/i, 'The cloud took too long to answer. Try again; a clearer photo is faster.'],
  [/network|fetch-error|Failed to fetch|offline/i, 'No connection to the cloud. Check your internet and try again.'],
];

export function friendlyCloudError(error: unknown): Error {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const hit = RULES.find(([pattern]) => pattern.test(raw));
  const detail = raw.replace(/\s+/g, ' ').slice(0, 160);
  return new Error(hit ? `${hit[1]} (${detail})` : detail || 'Something went wrong talking to the cloud.');
}

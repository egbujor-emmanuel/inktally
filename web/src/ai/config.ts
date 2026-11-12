// Model names and prompts live in Remote Config so they can change without shipping a new app
// (and so proprietary prompt engineering is not hard-coded). These are the offline defaults.

export const REMOTE_DEFAULTS = {
  /** Cloud model that reads crops and whole pages. Free tier, measured 14/14 on our handwriting set. */
  cloud_read_model: 'gemini-3.5-flash-lite',
  /** Cloud model that drafts marking schemes and catch-up worksheets. */
  cloud_author_model: 'gemini-3.8-flash',
  /** prefer_on_device | prefer_in_cloud | only_on_device | only_in_cloud */
  read_mode: 'prefer_on_device',

  prompt_read_crop:
    'Transcribe exactly what is handwritten in this image, character by character. {hint} '
    + 'Do NOT calculate, solve or correct anything; if the writing is wrong, copy it wrong. '
    + 'If nothing is written, return an empty string.',
  prompt_point_check:
    'A pupil wrote this answer (spelling may be poor; judge meaning): "{answer}"\n'
    + 'Does the answer clearly state this specific marking point: "{point}"? '
    + 'Answer only for that exact point. Do not give credit for a statement listed as not acceptable: {reject}.',
  prompt_scheme_draft:
    'You are an experienced Nigerian teacher writing a marking scheme for {level} {subject}. '
    + 'From the question paper provided, list every question with: its number, the question text, the maximum marks, '
    + 'the type (objective = A-E option, numeric = a number, short = a word or phrase, points = a theory answer marked point by point), '
    + 'and the answer key (correct option letters, accepted numbers, accepted words, or marking points with common acceptable wordings). '
    + 'Add answers that must not be accepted when pupils commonly confuse them.',
  prompt_remediation:
    'Pupils in a {level} {subject} class made these mistakes on question {q} ("{prompt}"): {mistakes}. '
    + 'Write a short catch-up activity for them: one plain-English explanation of the misunderstanding (max 60 words) '
    + 'and 4 practice questions of increasing difficulty with answers.',
} as const;

export type RemoteKey = keyof typeof REMOTE_DEFAULTS;

/** Fills {placeholders} in a prompt template. Unknown placeholders are left as-is. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

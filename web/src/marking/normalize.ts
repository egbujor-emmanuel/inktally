// Pure helpers that turn a model's transcription of handwriting into comparable values.
// Deliberately conservative: anything ambiguous is reported, never silently "fixed".

/** Characters models commonly emit for handwritten digits. Applied only in numeric context. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  'б': '6', 'Б': '6', 'O': '0', 'o': '0', 'О': '0', 'о': '0', 'D': '0',
  'l': '1', 'I': '1', '|': '1', 'i': '1', '!': '1',
  'Z': '2', 'z': '2', 'S': '5', 's': '5', 'B': '8', 'g': '9', 'q': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

// "#" before a number is how many Nigerian teachers and pupils write ₦ (and how models often transcribe it).
const CURRENCY_AND_SPACING = /[₦$£€,\s]|(?<![a-z])N(?=\d)|#(?=\d)/gi;

export interface NumericParse {
  value: number | null;
  /** false when lookalike characters had to be mapped to digits. */
  clean: boolean;
  /** true when a minus sign sits directly after "=" (often a stray pen stroke). */
  signAfterEquals: boolean;
}

/** Reads the numeric answer a pupil wrote, preferring whatever follows the last "=". */
export function parseNumericAnswer(raw: string): NumericParse {
  const afterEquals = raw.includes('=') ? raw.slice(raw.lastIndexOf('=') + 1) : raw;
  const signAfterEquals = /^\s*[-−–]/.test(afterEquals) && raw.includes('=');
  let clean = true;
  const mapped = [...afterEquals].map((ch) => {
    if (DIGIT_LOOKALIKES[ch] !== undefined) { clean = false; return DIGIT_LOOKALIKES[ch]; }
    return ch;
  }).join('');
  const compact = mapped.replace(/[−–]/g, '-').trim();

  const mixed = compact.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = Number(mixed[2]) / Number(mixed[3]);
    return { value: whole < 0 ? whole - frac : whole + frac, clean, signAfterEquals };
  }
  const stripped = compact.replace(CURRENCY_AND_SPACING, '');
  const fraction = stripped.match(/^(-?\d+)\/(\d+)$/);
  if (fraction && Number(fraction[2]) !== 0) {
    return { value: Number(fraction[1]) / Number(fraction[2]), clean, signAfterEquals };
  }
  const number = stripped.match(/^-?\d+(\.\d+)?%?$/);
  if (number) return { value: Number(stripped.replace('%', '')), clean, signAfterEquals };
  return { value: null, clean, signAfterEquals };
}

/** Extracts exactly one option letter A–E, or null if none or several are present. */
export function normalizeOptionLetter(raw: string): string | null {
  const withoutLabel = raw.replace(/^\s*Q?\d+\s*[:.)-]?\s*/i, '');
  const letters = withoutLabel.toUpperCase().match(/\b[A-E]\b/g);
  if (!letters) return null;
  const unique = [...new Set(letters)];
  return unique.length === 1 ? unique[0] : null;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

const canonical = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Similarity in [0, 1] based on edit distance, ignoring case and punctuation. */
export function textSimilarity(a: string, b: string): number {
  const x = canonical(a);
  const y = canonical(b);
  if (!x && !y) return 1;
  const longest = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / longest;
}

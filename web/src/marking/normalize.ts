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

/** Written fractions ("4⅜") become "4 3/8" so the mixed-number rule reads them. */
const VULGAR: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};
/**
 * A unit after the answer ("50 km/h", "8 g/cm³") is dropped BEFORE look-alike letters are mapped to digits, so the
 * unit's letters are never misread as digits. Multi-letter units may touch the number; one-letter units ("50 s") only
 * count after a space, so a misread digit such as "1s" (15) is never cut short.
 */
const UNIT = /(?:\s*(?:g\/cm\^3|kg\/m\^3|cm\^3|cm\^2|m\^3|m\^2|m\/s\^2|km\/hr?|kmh|kph|m\/s²|m\/s2|m\/s|ms-1|g\/cm³|g\/cm3|kg\/m³|kg\/m3|cm³|cm3|cm²|cm2|m³|m²|mm|cm|km|kg|mg|ml|litres?|liters?|secs?|seconds?|mins?|minutes?|hrs?|hours?|°c|°f|°|pa|units?)|\s+(?:s|m|g|h|l|k|n|j|w|v|a))\.?\s*$/i;

/** Superscript/subscript digits and the fraction slash ("4³/₈", "4³⁄₈") become ordinary "4 3/8". */
const SMALL_DIGITS = /([0-9])?([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\s*[\/⁄]\s*([₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)/g;
const smallToDigits = (_: string, whole: string | undefined, top: string, bottom: string): string => {
  const plain = (s: string) => [...s].map((c) => { const i = '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c); const j = '₀₁₂₃₄₅₆₇₈₉'.indexOf(c); return i >= 0 ? String(i) : j >= 0 ? String(j) : c; }).join('');
  return `${whole ? whole + ' ' : ''}${plain(top)}/${plain(bottom)}`;
};

/** Standard form: "1.0 × 10^5", "6.02 x 10²³", "2.5×10⁻³", "1e5" (after any unit has been dropped). */
const STANDARD_FORM = /^\s*(-?\d+(?:\.\d+)?)\s*(?:[x×*·]\s*10\s*(?:\^|\*\*)?\s*([-−⁻+]?[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+)|[eE]([-+]?\d+))\s*$/;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function standardForm(text: string): number | null {
  const m = text.match(STANDARD_FORM);
  if (!m) return null;
  const exp = (m[2] ?? m[3]).replace(/[−⁻]/g, '-').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUPERSCRIPT.indexOf(c)));
  const value = Number(m[1]) * 10 ** Number(exp);
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : null;
}

/** Reads the numeric answer a pupil wrote, preferring whatever follows the last "=". */
export function parseNumericAnswer(raw: string): NumericParse {
  const lastPart = (raw.includes('=') ? raw.slice(raw.lastIndexOf('=') + 1) : raw).replace(SMALL_DIGITS, smallToDigits);
  const afterEquals = lastPart.replace(UNIT, '').replace(/\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, f: string) => ` ${VULGAR[f]}`);
  const signAfterEquals = /^\s*[-−–]/.test(afterEquals) && raw.includes('=');
  const scientific = standardForm(afterEquals.replace(/,/g, ''));
  if (scientific !== null) return { value: scientific, clean: true, signAfterEquals };
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

/** Method marks are for working: an entry that is just "the answer" (a copied guide's answer mark) is not one. */
export const workingSteps = (points: readonly string[] | undefined): string[] =>
  (points ?? []).map((p) => p.trim()).filter((p) => p && !/^(the\s+)?(correct\s+|final\s+)?answers?\b[\s.:()0-9a-z-]*$/i.test(p));

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

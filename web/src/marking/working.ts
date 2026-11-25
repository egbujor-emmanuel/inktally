// Checks a student's working the way an examiner does before giving a method mark.
// A step that is worked out correctly but uses different operations from the guide's formula is a different
// relationship (50 ÷ 0.4 where the formula is v = fλ; 4 × 2 where the resistances add), whatever formula the reading
// shows: no method mark. The same operations with one wrong number (10 × 1000 × 1 for P = hρg) is a substitution slip,
// and so is an arithmetic slip (50 × 0.4 = 25): those can still earn the method mark.

/** Turns one side of an "=" into plain arithmetic (2 × 10 → 2*10), or null when it is not plain arithmetic. */
function asArithmetic(part: string): string | null {
  const expr = part
    .replace(/(\d)\s*[xX×·*]\s*(?=[\d(])/g, '$1*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, '');
  return /^[\d.()+\-*/^]+$/.test(expr) && /\d[)]*[+\-*/^][(]*[\d.]/.test(expr) ? expr : null;
}

/** The last plain arithmetic step in the working, e.g. "50/0.4" in "v = f/λ = 50/0.4 = 125 m/s". */
export function substitutedArithmetic(read: string): string | null {
  for (const part of read.split('=').slice(0, -1).reverse()) {
    const expr = asArithmetic(part);
    if (expr) return expr;
  }
  return null;
}

/** Evaluates + − × ÷ ^ and brackets. Returns null for anything it cannot read. */
export function evaluateArithmetic(expr: string): number | null {
  const tokens = expr.match(/\d*\.?\d+|[()+\-*/^]/g);
  if (!tokens || tokens.join('') !== expr) return null;
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number => {
    const t = tokens[i++];
    if (t === '-') return -factor();
    if (t === '(') { const v = sum(); if (tokens[i++] !== ')') throw new Error('bracket'); return v; }
    const n = Number(t);
    if (Number.isNaN(n)) throw new Error('number');
    return n;
  };
  const power = (): number => { const b = factor(); return peek() === '^' ? (i++, b ** power()) : b; };
  const product = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/') v = tokens[i++] === '*' ? v * power() : v / power();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + product() : v - product();
    return v;
  };
  try {
    const v = sum();
    return i === tokens.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The operations a formula or a line of working uses, as a sorted string of "+", "-" and "/". Multiplication and powers
 * are left out because written formulas leave them implicit (hρg, ½at²), and ½ or 1/2 is a number, not a division.
 */
export function operationSignature(text: string): string {
  const t = text
    .replace(/\b1\s*\/\s*2\b/g, '½')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, ' - ')
    .replace(/(^|[(+\-*/^=]\s*)-/g, '$1'); // a leading minus sign is a negative number, not a subtraction
  const ops = new Set<string>();
  if (t.includes('+')) ops.add('+');
  if (/\//.test(t)) ops.add('/');
  // A minus between two operands; a hyphen inside a word (re-marked) is not one.
  if (/(\s-\s|[\d)²³]\s*-\s*[\d(a-zA-Zα-ω]|[a-zA-Zα-ω]\s+-|-\s+[a-zA-Zα-ω(])/.test(t)) ops.add('-');
  return [...ops].sort().join('');
}

/** The operation signatures of the formulas a marking guide accepts as method ("v = fλ", "4 + 2 = 6 Ω, or I = V ÷ R"). */
function acceptedSignatures(methodPoints: readonly string[]): Set<string> {
  const formulas = methodPoints.flatMap((p) => p.split(/\bor\b|;/i)).filter((f) => /[=+÷/×]|\s[−–-]\s/.test(f));
  return new Set(formulas.map(operationSignature));
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 + 0.005 * Math.abs(b);

/** The number a step claims to give: the leading number (or arithmetic) of the next side of the "=". */
function claimedResult(next: string): number | null {
  const expr = asArithmetic(next);
  if (expr) return evaluateArithmetic(expr);
  const m = next.trim().match(/^[\d,]*\.?\d+/);
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

/**
 * A step of the working that is worked out correctly but does not follow the guide's formula: a different relationship.
 * With the guide's method formulas, every correct step is checked for the formula's operations. Without them, only the
 * last step is checked: correct arithmetic that lands on the student's own wrong answer. Returns the step (for the
 * teacher's note), or null when the working is consistent or cannot be read.
 */
export function workingContradictsKey(
  read: string, studentValue: number | null, accepted: number[], methodPoints: readonly string[] = [],
): { step: string; value: number } | null {
  if (studentValue === null) return null;
  const signatures = acceptedSignatures(methodPoints);
  const sides = read.split('=');
  for (let i = 0; i < sides.length - 1; i++) {
    const step = asArithmetic(sides[i]);
    if (!step) continue;
    const isLast = sides.slice(i + 1, -1).every((s) => !asArithmetic(s));
    if (!signatures.size && !isLast) continue;
    const value = evaluateArithmetic(step);
    const claimed = isLast ? studentValue : claimedResult(sides[i + 1]);
    if (value === null || claimed === null || !close(value, claimed)) continue; // an arithmetic slip, not a different formula
    if (accepted.some((a) => close(value, a))) continue;
    if (signatures.size ? !signatures.has(operationSignature(step)) : true) return { step, value };
  }
  return null;
}

export const contradictionReason = (c: { step: string; value: number }): string =>
  `The working ${c.step} = ${Number(c.value.toPrecision(6))} is worked out correctly but does not follow the marking guide's formula, so a different formula was used. No method mark — check it.`;

// Checks a student's working the way an examiner does before giving a method mark.
// If the numbers they substituted are worked out correctly but still miss the key's answer, they used a different
// relationship (e.g. 50 ÷ 0.4 where the formula is v = fλ), whatever formula the reading shows. That case earns no
// method mark. A slip in the arithmetic (50 × 0.4 = 25) does not stop a method mark.

/** The last plain arithmetic step in the working, e.g. "50/0.4" in "v = f/λ = 50/0.4 = 125 m/s". */
export function substitutedArithmetic(read: string): string | null {
  const parts = read.split('=').slice(0, -1).reverse();
  for (const part of parts) {
    const expr = part
      .replace(/(\d)\s*[x×·*]\s*(?=[\d(])/g, '$1*')
      .replace(/÷/g, '/')
      .replace(/[−–]/g, '-')
      .replace(/(\d),(?=\d{3}\b)/g, '$1')
      .replace(/\s+/g, '');
    if (/^[\d.()+\-*/^]+$/.test(expr) && /\d[)]*[+\-*/^][(]*[\d.]/.test(expr)) return expr;
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

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 + 0.005 * Math.abs(b);

/**
 * The working, done correctly, leads to the student's own wrong answer rather than the key's: a different relationship.
 * Returns the step (for the teacher's note), or null when the working is consistent or cannot be read.
 */
export function workingContradictsKey(read: string, studentValue: number | null, accepted: number[]): { step: string; value: number } | null {
  if (studentValue === null) return null;
  const step = substitutedArithmetic(read);
  if (!step) return null;
  const value = evaluateArithmetic(step);
  if (value === null || !close(value, studentValue) || accepted.some((a) => close(value, a))) return null;
  return { step, value };
}

export const contradictionReason = (c: { step: string; value: number }): string =>
  `The working ${c.step} = ${Number(c.value.toPrecision(6))} is worked out correctly but does not give the key's answer, so a different formula was used. No method mark — check it.`;

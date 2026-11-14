import { describe, expect, it } from 'vitest';
import { parseNumericAnswer, normalizeOptionLetter, textSimilarity } from './normalize';

describe('parseNumericAnswer', () => {
  it('reads the value after the last equals sign', () => {
    expect(parseNumericAnswer('15 + 9 = 23')).toEqual({ value: 23, clean: true, signAfterEquals: false });
  });

  it('accepts a bare answer box', () => {
    expect(parseNumericAnswer('12').value).toBe(12);
  });

  it('strips thousands separators and naira signs', () => {
    expect(parseNumericAnswer('= ₦27,000').value).toBe(27000);
    expect(parseNumericAnswer('N27,000').value).toBe(27000);
    expect(parseNumericAnswer('Answer = #27,000').value).toBe(27000); // "#" is a common way to write ₦
    expect(parseNumericAnswer('#').value).toBeNull();
  });

  it('maps handwriting lookalikes to digits (Cyrillic б for 6)', () => {
    const r = parseNumericAnswer('5б');
    expect(r.value).toBe(56);
    expect(r.clean).toBe(false);
  });

  it('parses fractions and mixed numbers', () => {
    expect(parseNumericAnswer('3/4').value).toBeCloseTo(0.75);
    expect(parseNumericAnswer('1 1/2').value).toBeCloseTo(1.5);
  });

  it('parses decimals', () => {
    expect(parseNumericAnswer('= 2.5').value).toBe(2.5);
  });

  it('notices a minus sign glued to the equals sign (common stroke misread)', () => {
    expect(parseNumericAnswer('=-1')).toEqual({ value: -1, clean: true, signAfterEquals: true });
  });

  it('returns null for an unreadable box', () => {
    expect(parseNumericAnswer('=').value).toBeNull();
    expect(parseNumericAnswer('').value).toBeNull();
    expect(parseNumericAnswer('abc').value).toBeNull();
  });
});

describe('normalizeOptionLetter', () => {
  it('extracts a single option letter', () => {
    expect(normalizeOptionLetter('Q3: b')).toBe('B');
    expect(normalizeOptionLetter('(C)')).toBe('C');
    expect(normalizeOptionLetter(' D. ')).toBe('D');
  });

  it('returns null when no single option is clear', () => {
    expect(normalizeOptionLetter('')).toBeNull();
    expect(normalizeOptionLetter('A or B')).toBeNull();
  });
});

describe('textSimilarity', () => {
  it('scores identical text as 1', () => {
    expect(textSimilarity('Abuja', 'abuja')).toBe(1);
  });

  it('tolerates a pupil spelling slip', () => {
    expect(textSimilarity('Fotosynthesis', 'photosynthesis')).toBeGreaterThan(0.8);
  });

  it('keeps different words apart', () => {
    expect(textSimilarity('runned', 'ran')).toBeLessThan(0.6);
  });
});

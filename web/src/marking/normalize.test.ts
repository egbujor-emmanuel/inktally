import { describe, expect, it } from 'vitest';
import { parseNumericAnswer, normalizeOptionLetter, textSimilarity, workingSteps } from './normalize';

describe('parseNumericAnswer', () => {
  it('reads the value after the last equals sign', () => {
    expect(parseNumericAnswer('15 + 9 = 23')).toEqual({ value: 23, clean: true, signAfterEquals: false });
  });

  it('accepts a bare answer box', () => {
    expect(parseNumericAnswer('12').value).toBe(12);
  });

  it('drops a unit after the answer without misreading its letters as digits', () => {
    expect(parseNumericAnswer('speed = 150 ÷ 3 = 50 km/h').value).toBe(50);
    expect(parseNumericAnswer('= 50km/hr').value).toBe(50);
    expect(parseNumericAnswer('240/30 = 8 g/cm³').value).toBe(8);
    expect(parseNumericAnswer('8g/cm3').value).toBe(8);
    expect(parseNumericAnswer('50 m/s').value).toBe(50);
    expect(parseNumericAnswer('12 cm²').value).toBe(12);
    expect(parseNumericAnswer('= 100 °C').value).toBe(100);
    expect(parseNumericAnswer('20 s').value).toBe(20);
    expect(parseNumericAnswer('1s').value).toBe(15); // a misread 15, not "1 second"
  });

  it('reads superscript fractions and caret units the way models write them', () => {
    expect(parseNumericAnswer('22/8 + 13/8 = 35/8 = 4³/₈').value).toBe(4.375);
    expect(parseNumericAnswer('Density = 240 / 30 = 80 g/cm^3').value).toBe(80);
  });

  it('reads standard form the way students and models write it', () => {
    expect(parseNumericAnswer('P = hρg = 10 × 1000 × 10 = 1.0 × 10^5 Pa').value).toBe(100000);
    expect(parseNumericAnswer('1 x 10⁵').value).toBe(100000);
    expect(parseNumericAnswer('1.0×10⁵ Pa').value).toBe(100000);
    expect(parseNumericAnswer('6.02 x 10^23').value).toBe(6.02e23);
    expect(parseNumericAnswer('2.5 × 10⁻³ m').value).toBe(0.0025);
    expect(parseNumericAnswer('1e5').value).toBe(100000);
    expect(parseNumericAnswer('100,000 Pa').value).toBe(100000);
  });

  it('reads the unit spellings students write in physics', () => {
    expect(parseNumericAnswer('a = 20/5 = 4 ms⁻²').value).toBe(4);
    expect(parseNumericAnswer('v = 50 × 0.4 = 20ms⁻¹').value).toBe(20);
    expect(parseNumericAnswer('1 × 10⁵ N/m²').value).toBe(100000);
    expect(parseNumericAnswer('100 joules').value).toBe(100);
    expect(parseNumericAnswer('100J').value).toBe(100);
    expect(parseNumericAnswer('s = 50m').value).toBe(50);
    expect(parseNumericAnswer('I = 12/6 = 2A').value).toBe(2);
    expect(parseNumericAnswer('2 Ω').value).toBe(2);
    expect(parseNumericAnswer('1s').value).toBe(15); // still a misread 15
    expect(parseNumericAnswer('a = 20/5 = 4 ms− 2').value).toBe(4);
    expect(parseNumericAnswer('v = 50 × 0.4 = 20m− 1').value).toBe(20);
    expect(parseNumericAnswer('p = 3 kg m s⁻¹').value).toBe(3);
  });

  it('reads written fractions such as 4⅜', () => {
    expect(parseNumericAnswer('35/8 = 4⅜').value).toBe(4.375);
    expect(parseNumericAnswer('2¾').value).toBe(2.75);
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

describe('workingSteps', () => {
  it('drops an "answer" entry copied from a guide, keeps real working', () => {
    expect(workingSteps(['uses speed = distance ÷ time (150 ÷ 3)', 'answer', 'Correct answer (1 mark)', 'final answer'])).toEqual(['uses speed = distance ÷ time (150 ÷ 3)']);
    expect(workingSteps(['finds the profit, ₦9,000'])).toEqual(['finds the profit, ₦9,000']);
    expect(workingSteps(undefined)).toEqual([]);
  });
});

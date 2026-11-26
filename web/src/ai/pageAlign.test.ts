import { describe, expect, test } from 'vitest';
import { alignPageAnswers, labelKey, leadingLabel, stripLabel } from './pageAlign';

const WAEC = ['1', '2', '3', '4', '5', '6(a)', '6(b)(i)', '6(b)(ii)', '7(a)', '7(b)', '8(a)', '8(b)', '9', '10'].map((label, i) => ({ q: i + 1, label }));

describe('matching what a student wrote to the marking scheme by label', () => {
  test('labels are compared without brackets, dots, spaces or a Q prefix', () => {
    expect(labelKey('7a)')).toBe('7a');
    expect(labelKey('6b(ii)')).toBe(labelKey('6(b)(ii)'));
    expect(labelKey('Q10.')).toBe('10');
    expect(labelKey('6b(i)')).not.toBe(labelKey('6b(ii)'));
  });

  test('Script 3 (photographed sideways): the label the student wrote wins over a shifted question number', () => {
    // What the model returned on 25 Nov: every number from 7(a) on was one too high, but the labels were right.
    const read = [
      { q: 8, label: '6b(ii)', text: '' },
      { q: 10, label: '7a)', text: 'I ∝ V if the temperature is constant' },
      { q: 11, label: '7b)', text: 'I = V/R = 12/6 = 2A' },
      { q: 12, label: '8a)', text: 'Longitudinal waves vibrate along the direction of travel.' },
    ];
    const aligned = alignPageAnswers(read, WAEC);
    expect(aligned.get(9)).toBe('I ∝ V if the temperature is constant');
    expect(aligned.get(10)).toBe('I = V/R = 12/6 = 2A');
    expect(aligned.get(11)).toBe('Longitudinal waves vibrate along the direction of travel.');
    expect(aligned.get(8)).toBe('');
  });

  test('the label at the start of the transcript is read off it', () => {
    const keys = new Set(WAEC.map((x) => labelKey(x.label)));
    expect(leadingLabel('6b(ii) 4', keys)).toEqual({ key: '6bii', rest: '4' });
    expect(leadingLabel('8a)(i) Transverse waves can be polarised', keys)).toEqual({ key: '8a', rest: '(i) Transverse waves can be polarised' });
    expect(leadingLabel('9) 100,000 Pa', keys)).toEqual({ key: '9', rest: '100,000 Pa' });
    expect(leadingLabel('10) 100 joules', keys)).toEqual({ key: '10', rest: '100 joules' });
    expect(leadingLabel('6b(ii)', keys)).toEqual({ key: '6bii', rest: '' });
    expect(leadingLabel('Acceleration is change in speed', keys)).toBeNull();
    expect(leadingLabel('2) 2 m/s', new Set(['2', '22']))).toEqual({ key: '2', rest: '2 m/s' });
  });

  test('Script 3, 25 Nov run 1: the model put 7(a)’s line under the blank 6(b)(ii), but the line carries its own label', () => {
    const read = [
      { q: 8, label: '6b(ii)', text: '7a) I ∝ V if the temperature is constant' },
      { q: 9, label: '7a)', text: '7b) I = V / R = 12 / 6 = 2 A' },
      { q: 13, label: '9)', text: '10) 100 joules' },
    ];
    const aligned = alignPageAnswers(read, WAEC);
    expect(aligned.get(9)).toBe('I ∝ V if the temperature is constant');
    expect(aligned.get(10)).toBe('I = V / R = 12 / 6 = 2 A');
    expect(aligned.get(14)).toBe('100 joules');
    expect(aligned.has(8)).toBe(false);
    expect(aligned.has(13)).toBe(false);
  });

  test('without a usable label the model\'s question number is used, never overwriting a label match', () => {
    const aligned = alignPageAnswers([{ q: 2, label: '', text: 'C' }, { q: 3, label: '2', text: 'B' }, { q: 99, label: 'x', text: '?' }], WAEC);
    expect(aligned.get(2)).toBe('B');
    expect(aligned.has(3)).toBe(false);
    expect(aligned.has(99)).toBe(false);
  });

  test('plain numbering (no printed labels) still matches', () => {
    expect(alignPageAnswers([{ q: 5, label: '1)', text: 'B' }], [{ q: 1 }, { q: 2 }]).get(1)).toBe('B');
  });

  test('Script 3, 26 Nov: a label matching no question ("6b)" for 6(b)(i)) is still taken off the answer; numbers keep their decimals', () => {
    expect(stripLabel('6b) 4')).toBe('4');
    expect(stripLabel('10) 100 joules')).toBe('100 joules');
    expect(stripLabel('1.5 A')).toBe('1.5 A');
    expect(stripLabel('100,000 Pa')).toBe('100,000 Pa');
    expect(alignPageAnswers([{ q: 7, label: '6b(i)', text: '6b) 4' }], [{ q: 7, label: '6(b)(i)' }]).get(7)).toBe('4');
  });
});

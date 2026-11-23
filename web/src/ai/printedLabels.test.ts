import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Question } from '../domain/types';
import { alignToPrinted, printedLabels } from './printedLabels';

describe('labels printed in a typed marking guide', () => {
  test('the WAEC physics guide', () => {
    const guide = readFileSync(resolve(__dirname, '../../../docs/real-test/guide.txt'), 'utf8');
    expect(printedLabels(guide)).toEqual(['1', '2', '3', '4', '5', '6(a)', '6(b)(i)', '6(b)(ii)', '7(a)', '7(b)', '8(a)', '8(b)', '9', '10']);
  });
  test('parts printed on their own lines under the question number', () => {
    const text = '1. Define work.\n2. (a) State Newton\'s first law.\n(b) A 2 kg mass...\n(i) Find the force.\n(ii) Find the work done.\n3. B';
    expect(printedLabels(text)).toEqual(['1', '2(a)', '2(b)(i)', '2(b)(ii)', '3']);
  });
  test('a heading with parts under it is not its own question', () => {
    expect(printedLabels('6.\n(a) Define speed.\n(b) Define velocity.\n7. 12 m/s')).toEqual(['6(a)', '6(b)', '7']);
  });
  test('lines that start with a number but are not questions are skipped', () => {
    expect(printedLabels('1. B\n2 marks for the method\n2. C\n10 m is the height')).toEqual(['1', '2']);
  });
  test('prose with no numbered list gives nothing', () => {
    expect(printedLabels('Accept any answer that mentions photosynthesis.')).toEqual([]);
  });
});

describe('aligning a draft to the printed labels', () => {
  const q = (n: number, label?: string): Question => ({ q: n, type: 'objective', prompt: '', max: 1, correct: ['A'], ...(label ? { label } : {}) });
  test('a complete draft takes the printed labels in order', () => {
    const { questions, missing } = alignToPrinted([q(1), q(2, '6(b)'), q(3, '7')], ['1', '6(a)', '6(b)']);
    expect(questions.map((x) => [x.q, x.label])).toEqual([[1, undefined], [2, '6(a)'], [3, '6(b)']]);
    expect(missing).toEqual([]);
  });
  test('a short draft keeps matching labels and names the rest', () => {
    const { questions, missing } = alignToPrinted([q(1), q(7, '6(b)(ii)')], ['1', '6(a)', '6(b)(ii)']);
    expect(questions.map((x) => [x.q, x.label])).toEqual([[1, undefined], [3, '6(b)(ii)']]);
    expect(missing).toEqual([2]);
  });
});

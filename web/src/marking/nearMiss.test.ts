import { describe, expect, test } from 'vitest';
import type { Mark, NumericQuestion } from '../domain/types';
import { flagNearMiss } from './engine';

const q = (key: number): NumericQuestion => ({ q: 1, type: 'numeric', prompt: 'Q', max: 1, accept: [key] });
const wrong = (read: string): Mark => ({ q: 1, max: 1, read, readSource: 'in_cloud', awarded: 0, engine: 'code', status: 'verified', reasons: [] });

describe('a wrong number one character from the key is flagged, not silently marked wrong', () => {
  test('the five MNIST misreads of correct answers (26 Nov) are all flagged, marks unchanged', () => {
    for (const [key, read] of [[521, '52.1'], [203, '263'], [646, '146'], [618, '6/8'], [798, '298']] as const) {
      const m = flagNearMiss(q(key), wrong(read));
      expect(m.status).toBe('flagged');
      expect(m.awarded).toBe(0);
      expect(m.reasons.at(-1)).toMatch(/one character away from the key/);
    }
  });
  test('a clearly different answer, a short key, a full mark or a teacher’s mark is left alone', () => {
    expect(flagNearMiss(q(20), wrong('v = fλ = 50/0.4 = 125 m/s')).status).toBe('verified');
    expect(flagNearMiss(q(4), wrong('9')).status).toBe('verified');
    expect(flagNearMiss(q(521), { ...wrong('521'), awarded: 1 }).status).toBe('verified');
    expect(flagNearMiss(q(521), { ...wrong('52.1'), status: 'reviewed' }).status).toBe('reviewed');
  });
  test('the number is read from the final answer, after the working', () => {
    expect(flagNearMiss(q(100000), wrong('P = hρg = 10 × 1000 × 1 = 10,000 Pa')).status).toBe('flagged');
    expect(flagNearMiss(q(100), wrong('PE = mgh = 2 × 10 × 5 = 1000 J')).status).toBe('flagged');
  });
});

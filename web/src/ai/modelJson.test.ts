import { describe, expect, test } from 'vitest';
import { modelJson } from './config';

describe('a model’s JSON reply is read through what some models wrap around it', () => {
  test('plain, fenced, and closing-fence-only replies (Gemma 4, 26 Nov) all read', () => {
    expect(modelJson('{"a":1}')).toEqual({ a: 1 });
    expect(modelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(modelJson('{"answers": [{"q": 1}]}\n```')).toEqual({ answers: [{ q: 1 }] });
    expect(modelJson('Here it is: {"a":1} Done.')).toEqual({ a: 1 });
  });
  test('a reply with no JSON at all still throws, so the answer is flagged, never guessed', () => {
    expect(() => modelJson('Yes, the answer states it.')).toThrow();
  });
});

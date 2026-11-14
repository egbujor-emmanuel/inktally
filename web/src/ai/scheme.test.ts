// Drafted / copied marking schemes become questions that Firestore can store (reviewer A2 P0: saving crashed).
import { describe, expect, test, vi } from 'vitest';

vi.mock('../firebase/app', () => ({ ai: {}, remoteConfig: {}, db: {}, auth: {} }));
vi.mock('firebase/remote-config', () => ({ getValue: () => ({ asString: () => '' }) }));

const { toQuestion } = await import('./scheme');

/** Firestore refuses any field whose value is undefined, at any depth. */
const hasUndefined = (value: unknown): boolean =>
  value === undefined || (typeof value === 'object' && value !== null && Object.values(value).some(hasUndefined));

describe('toQuestion', () => {
  test('a short answer with no "do not accept" list has no reject field at all', () => {
    const q = toQuestion({ q: 4, type: 'short', prompt: 'Capital of Nigeria', max: 1, acceptText: ['Abuja', 'FCT'] });
    expect(q).toEqual({ q: 4, type: 'short', prompt: 'Capital of Nigeria', max: 1, accept: ['Abuja', 'FCT'] });
    expect(hasUndefined(q)).toBe(false);
  });

  test('a theory question with no "do not accept" list has no reject field at all', () => {
    const q = toQuestion({ q: 3, type: 'points', prompt: 'Two functions of blood', max: 2, points: ['carries oxygen', 'fights germs'] });
    expect(q && 'reject' in q).toBe(false);
    expect(hasUndefined(q)).toBe(false);
  });

  test('a "do not accept" list from the teacher is kept exactly', () => {
    const q = toQuestion({ q: 5, type: 'short', prompt: 'Past tense of run', max: 2, acceptText: ['ran'], reject: ['runned'] });
    expect(q).toMatchObject({ accept: ['ran'], reject: ['runned'] });
  });

  test('questions with no usable answer are dropped', () => {
    expect(toQuestion({ q: 1, type: 'objective', prompt: 'Pick one', max: 1 })).toBeNull();
    expect(toQuestion({ q: 2, type: 'numeric', prompt: '7 x 8', max: 1, acceptNumbers: [] })).toBeNull();
  });
});

describe('subject and level labels', async () => {
  const { resolveLabels } = await import('./scheme');
  test('what the teacher typed wins over what the paper says', () => {
    expect(resolveLabels('Biology', 'SS 1', { subject: 'Chemistry', level: 'SS 2' })).toEqual({ subject: 'Biology', level: 'SS 1' });
  });
  test('an empty form takes the subject and level read from the paper', () => {
    expect(resolveLabels(' ', '', { subject: 'English Language', level: 'JSS 1' })).toEqual({ subject: 'English Language', level: 'JSS 1' });
  });
  test('nothing typed and nothing on the paper gives a neutral label, never a made-up subject', () => {
    expect(resolveLabels('', '', {})).toEqual({ subject: 'General', level: '' });
  });
  test('labels from the model are cleaned and capped', () => {
    const r = resolveLabels('', '', { subject: '<b>"Maths"</b>' + 'x'.repeat(100) });
    expect(r.subject).not.toMatch(/[<>"]/);
    expect(r.subject.length).toBeLessThanOrEqual(60);
  });
});

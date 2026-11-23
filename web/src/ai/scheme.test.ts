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

  test('method marks from the scheme are kept on calculations worth more than 1 mark', () => {
    const q = toQuestion({ q: 6, type: 'numeric', prompt: 'Average speed', max: 2, acceptNumbers: [50], methodPoints: ['uses speed = distance ÷ time'] });
    expect(q).toMatchObject({ accept: [50], methodPoints: ['uses speed = distance ÷ time'] });
    expect(toQuestion({ q: 7, type: 'numeric', prompt: 'One mark', max: 1, acceptNumbers: [8], methodPoints: ['x'] })).not.toHaveProperty('methodPoints');
    expect(toQuestion({ q: 8, type: 'numeric', prompt: 'No method', max: 2, acceptNumbers: [8] })).not.toHaveProperty('methodPoints');
  });

  test('questions with no usable answer are dropped', () => {
    expect(toQuestion({ q: 1, type: 'objective', prompt: 'Pick one', max: 1 })).toBeNull();
    expect(toQuestion({ q: 2, type: 'numeric', prompt: '7 x 8', max: 1, acceptNumbers: [] })).toBeNull();
  });
});

describe('drafts that leave questions out', async () => {
  const { missingQuestions, missingNotice } = await import('./scheme');
  test('gaps and a too-short list are both found', () => {
    expect(missingQuestions([1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13])).toEqual([6, 7]);
    expect(missingQuestions([1, 2, 3, 4, 5], 6)).toEqual([6]);
    expect(missingQuestions([1, 2, 3], 0)).toEqual([]);
  });
  test('the teacher is told exactly which questions to add', () => {
    expect(missingNotice([6, 7])).toBe('REDPEN could not find questions 6, 7. Check the paper, and add them with "+ Add question".');
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

// Editing the answer key after marking re-marks everyone from their stored readings (no AI call).
import { describe, expect, test } from 'vitest';
import type { Mark, Question } from '../domain/types';
import { markNumeric, markObjective, markShort } from './engine';
import { POINTS_CHANGED_REASON, REMARK_REASON, remarkAll, remarkNotice, remarkOne } from './remark';

const objQ: Question = { q: 1, type: 'objective', prompt: 'Pick one', max: 1, correct: ['B'] };
const numQ: Question = { q: 2, type: 'numeric', prompt: '15 + 9', max: 1, accept: [23] };
const shortQ: Question = { q: 3, type: 'short', prompt: 'Capital of Nigeria', max: 1, accept: ['Abuja'], spellingTolerant: true };
const ptsQ: Question = { q: 4, type: 'points', prompt: 'Two functions of blood', max: 2, points: ['carries oxygen', 'fights germs'] };

describe('remarkOne', () => {
  test('a corrected numeric key re-marks the stored reading — up for the right answer, down for the wrong one', () => {
    const fixed: Question = { ...numQ, accept: [24] };
    const right = markNumeric(numQ as never, '24', 'in_cloud');
    const wrong = markNumeric(numQ as never, '23', 'in_cloud');
    expect(right.awarded).toBe(0);
    expect(remarkOne(numQ, fixed, right)).toMatchObject({ awarded: 1, read: '24' });
    expect(remarkOne(numQ, fixed, wrong).awarded).toBe(0);
    expect(remarkOne(numQ, fixed, right).reasons.at(-1)).toBe(REMARK_REASON);
  });

  test('a changed letter or an extra accepted word is re-marked by code', () => {
    expect(remarkOne(objQ, { ...objQ, correct: ['C'] }, markObjective(objQ as never, 'C', 'in_cloud')).awarded).toBe(1);
    expect(remarkOne(shortQ, { ...shortQ, accept: ['Abuja', 'FCT'] }, markShort(shortQ as never, 'FCT', 'in_cloud')).awarded).toBe(1);
  });

  test('a teacher-set mark, an unchanged question and a removed question leave the mark alone', () => {
    const teacher: Mark = { ...markNumeric(numQ as never, '24', 'in_cloud'), engine: 'teacher', status: 'reviewed', awarded: 1 };
    expect(remarkOne(numQ, { ...numQ, accept: [99] }, teacher)).toBe(teacher);
    const m = markNumeric(numQ as never, '24', 'in_cloud');
    expect(remarkOne(numQ, { ...numQ }, m)).toBe(m);
    expect(remarkOne(numQ, undefined, m)).toBe(m);
  });

  test('a reading still waiting for the cloud check keeps waiting after re-marking', () => {
    const device = markNumeric(numQ as never, '24', 'on_device');
    expect(remarkOne(numQ, { ...numQ, accept: [24] }, device).status).toBe('provisional');
  });

  test('changed marking points flag the theory answer for the teacher instead of re-judging it silently', () => {
    const m: Mark = { q: 4, read: 'it carries oxygen', readSource: 'in_cloud', max: 2, awarded: 1, engine: 'ai-points', status: 'verified', reasons: [] };
    const next = remarkOne(ptsQ, { ...ptsQ, max: 1, points: ['carries oxygen'] }, m);
    expect(next).toMatchObject({ status: 'flagged', max: 1, awarded: 1 });
    expect(next.reasons.at(-1)).toBe(POINTS_CHANGED_REASON);
  });
});

describe('the hybrid safety net survives an answer-key edit', () => {
  const fixed: Question = { ...numQ, accept: [24] };

  test('a device/cloud disagreement stays "Check this" with both readings', () => {
    const disagree: Mark = { ...markNumeric(numQ as never, '24', 'in_cloud'), status: 'flagged', reasons: ['Device read "23" (1/1); cloud read "24" (0/1). Which is right?'] };
    const next = remarkOne(numQ, fixed, disagree);
    expect(next.status).toBe('flagged');
    expect(next.reasons.some((r) => r.includes('Which is right?'))).toBe(true);
  });

  test('a held reading stays held', () => {
    const held: Mark = { ...markNumeric(numQ as never, '24', 'on_device'), status: 'flagged', reasons: ['Held for checking: on this assignment Gemini Nano has read “21” as “24” before, so check this one.'] };
    const next = remarkOne(numQ, fixed, held);
    expect(next.status).toBe('flagged');
    expect(next.reasons.some((r) => r.startsWith('Held for checking:'))).toBe(true);
  });

  test('a failed read is left exactly as it was', () => {
    const failed: Mark = { q: 2, read: '', readSource: 'on_device', max: 1, awarded: 0, engine: 'code', status: 'flagged', reasons: ['Could not read this answer (quota).'] };
    expect(remarkOne(numQ, fixed, failed)).toBe(failed);
  });

  test('a mark confirmed by the cloud check stays Verified', () => {
    const confirmed: Mark = { ...markNumeric(numQ as never, '24', 'in_cloud'), reasons: ['Answer 24.', 'On-device mark confirmed by the cloud check.'] };
    const next = remarkOne(numQ, fixed, confirmed);
    expect(next.status).toBe('verified');
    expect(next.reasons.some((r) => /confirmed by the cloud check/i.test(r))).toBe(true);
  });

  test('a number that earned method marks is flagged, not re-marked without them', () => {
    const method: Mark = { q: 2, read: '15 + 9 = 23, working shown', readSource: 'in_cloud', max: 1, awarded: 1, engine: 'ai-points', status: 'verified', reasons: [], pointsFound: ['correct method'] };
    const next = remarkOne(numQ, fixed, method);
    expect(next).toMatchObject({ status: 'flagged', awarded: 1 });
  });
});

describe('remarkAll', () => {
  test('counts what went up, what went down and what needs a look, per answer', () => {
    const before = [numQ, ptsQ];
    const after = [{ ...numQ, accept: [24] }, { ...ptsQ, points: ['carries oxygen', 'fights infection'] }];
    const theory: Mark = { q: 4, read: 'carries oxygen', readSource: 'in_cloud', max: 2, awarded: 1, engine: 'ai-points', status: 'verified', reasons: [] };
    const subs = [
      { id: 'a', marks: [markNumeric(numQ as never, '24', 'in_cloud'), theory] },
      { id: 'b', marks: [markNumeric(numQ as never, '23', 'in_cloud')] },
    ];
    const { updates, summary } = remarkAll(before, after, subs);
    expect(summary).toEqual({ students: 2, up: 1, down: 1, toCheck: 1 });
    expect(updates.map((u) => u.submissionId)).toEqual(['a', 'b']);
    expect(remarkNotice(summary)).toBe('Answer key saved. Re-marked 2 students: 1 answer went up, 1 went down, 1 to check.');
    expect(remarkNotice({ students: 0, up: 0, down: 0, toCheck: 0 })).toBe('Answer key saved. No marks changed.');
  });
});

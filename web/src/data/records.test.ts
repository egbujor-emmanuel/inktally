import { describe, expect, it } from 'vitest';
import { registerRows, safeText } from './excel';
import { wrapLines } from '../scan/letterhead';
import type { Submission } from './store';
import type { Question } from '../domain/types';

const questions: Question[] = [
  { q: 1, type: 'objective', prompt: 'a', max: 1, correct: ['B'] },
  { q: 2, type: 'short', prompt: 'b', max: 2, accept: ['x'] },
];
const sub = (id: string, marks: Submission['marks'], comment?: string): Submission => ({ id, assignmentId: 'a', ownerUid: 'u', pupil: id, marks, comment });
const mark = (q: number, awarded: number, max: number, status: Submission['marks'][number]['status'] = 'verified') =>
  ({ q, read: '', readSource: 'in_cloud' as const, awarded, max, engine: 'code' as const, status, reasons: [] });

describe('safeText', () => {
  it('neutralises spreadsheet formulas typed into names or comments', () => {
    expect(safeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeText('+1')).toBe(`'+1`);
    expect(safeText('@cmd')).toBe(`'@cmd`);
  });
  it('leaves ordinary text alone', () => {
    expect(safeText('Ada O. — good work')).toBe('Ada O. — good work');
  });
});

describe('registerRows', () => {
  it('totals scores, leaves unmarked questions empty and counts unchecked marks', () => {
    const rows = registerRows(questions, [sub('p1', [mark(1, 1, 1), mark(2, 1, 2, 'flagged')], 'Revise Q2'), sub('p2', [mark(1, 0, 1)])]);
    expect(rows[0]).toMatchObject({ scores: [1, 1], total: 2, unchecked: 1 });
    expect(rows[0].submission.comment).toBe('Revise Q2');
    expect(rows[1]).toMatchObject({ scores: [0, null], total: 0, unchecked: 0 });
  });
});

describe('wrapLines', () => {
  const measure = (s: string) => s.length; // 1 unit per character
  it('wraps words to the width', () => {
    expect(wrapLines(measure, 'good work on fractions today', 12)).toEqual(['good work on', 'fractions', 'today']);
  });
  it('keeps paragraphs separate and never drops an over-long word', () => {
    expect(wrapLines(measure, 'supercalifragilistic\nok', 5)).toEqual(['supercalifragilistic', 'ok']);
  });
});

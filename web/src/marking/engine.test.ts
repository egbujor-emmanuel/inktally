import { describe, expect, it } from 'vitest';
import type { NumericQuestion, ObjectiveQuestion, PointsQuestion, ShortQuestion } from '../domain/types';
import { markObjective, markNumeric, markShort, markPoints } from './engine';

const numeric = (accept: number[], extra: Partial<NumericQuestion> = {}): NumericQuestion => ({
  q: 2, prompt: '15 + 9', max: 1, type: 'numeric', accept, ...extra,
});

describe('short answers that are really numbers', () => {
  const q = { q: 8, type: 'short' as const, prompt: 'Solve', max: 2, accept: ['x = 8', '8'] };
  const frac = { q: 10, type: 'short' as const, prompt: 'Simplify', max: 2, accept: ['4⅜', '35/8', '4.375'] };
  it('marks the final answer after working', () => {
    expect(markShort(q as never, '4x - 2x = 9 + 7, 2x = 16, x = 8', 'in_cloud').awarded).toBe(2);
    expect(markShort(q as never, '2x = 16, x = 8', 'in_cloud').awarded).toBe(2);
  });
  it('accepts the same number written another way', () => {
    expect(markShort(frac as never, '22/8 + 13/8 = 35/8 = 4 3/8', 'in_cloud').awarded).toBe(2);
    expect(markShort(q as never, '2x = 2, x = 1', 'in_cloud').awarded).toBe(0);
  });
});

describe('markNumeric (code decides, never the model)', () => {
  it('marks the pupil wrong when they wrote 23 for 15 + 9', () => {
    const m = markNumeric(numeric([24]), '= 23', 'on_device');
    expect(m.awarded).toBe(0);
    expect(m.engine).toBe('code');
    expect(m.status).toBe('provisional');
  });

  it('marks a correct cloud read as verified', () => {
    const m = markNumeric(numeric([56]), '= 56', 'in_cloud');
    expect(m.awarded).toBe(1);
    expect(m.status).toBe('verified');
  });

  it('flags an unreadable box instead of marking it wrong', () => {
    const m = markNumeric(numeric([1]), '=', 'on_device');
    expect(m.status).toBe('flagged');
    expect(m.awarded).toBe(0);
  });

  it('flags a lookalike-corrected read even when it matches', () => {
    const m = markNumeric(numeric([56]), '5б', 'on_device');
    expect(m.awarded).toBe(1);
    expect(m.status).toBe('flagged');
  });

  it('flags the "=-1" stroke ambiguity rather than marking it wrong', () => {
    const m = markNumeric(numeric([1]), '=-1', 'in_cloud');
    expect(m.status).toBe('flagged');
  });

  it('accepts any listed value within tolerance', () => {
    expect(markNumeric(numeric([0.75], { tolerance: 0.001 }), '3/4', 'in_cloud').awarded).toBe(1);
  });
});

describe('markObjective', () => {
  const q: ObjectiveQuestion = { q: 3, prompt: 'She ___ to school', max: 1, type: 'objective', correct: ['A'] };

  it('marks a wrong option as zero', () => {
    expect(markObjective(q, 'B', 'in_cloud').awarded).toBe(0);
  });

  it('marks the right option', () => {
    expect(markObjective(q, '(a)', 'in_cloud').awarded).toBe(1);
  });

  it('flags an unclear choice', () => {
    expect(markObjective(q, 'A or B', 'in_cloud').status).toBe('flagged');
  });
});

describe('markShort', () => {
  const q: ShortQuestion = { q: 3, prompt: 'Process by which green plants make food', max: 1, type: 'short', accept: ['photosynthesis'] };

  it('accepts a spelling slip when tolerant', () => {
    expect(markShort(q, 'Fotosynthesis', 'in_cloud').awarded).toBe(1);
  });

  it('refuses a rejected answer even if similar', () => {
    const strict: ShortQuestion = { ...q, prompt: 'Past tense of run', accept: ['ran'], reject: ['runned'] };
    expect(markShort(strict, 'runned', 'in_cloud').awarded).toBe(0);
  });

  it('flags a near-miss it cannot decide', () => {
    const m = markShort(q, 'photo', 'in_cloud');
    expect(m.status).toBe('flagged');
  });
});

describe('markPoints (AI answers yes/no per point; code adds them up)', () => {
  const liver: PointsQuestion = {
    q: 2, prompt: 'State three functions of the liver.', max: 3, type: 'points',
    points: ['produces bile', 'stores glycogen', 'removes toxins', 'deamination'],
  };

  it('awards partial credit for two of three points', () => {
    const m = markPoints(liver, 'It makes bile and stores sugar', 'in_cloud', ['produces bile', 'stores glycogen']);
    expect(m.awarded).toBe(2);
    expect(m.max).toBe(3);
    expect(m.pointsFound).toEqual(['produces bile', 'stores glycogen']);
    expect(m.status).toBe('verified');
  });

  it('caps at max', () => {
    const m = markPoints({ ...liver, max: 2 }, 'x', 'in_cloud', ['produces bile', 'stores glycogen', 'removes toxins']);
    expect(m.awarded).toBe(2);
  });

  it('flags a non-empty answer where no point was found (possible misread)', () => {
    const m = markPoints(liver, 'It may bite and saves sugar', 'on_device', []);
    expect(m.status).toBe('flagged');
  });

  it('gives zero without a flag for a blank answer', () => {
    const m = markPoints(liver, '', 'in_cloud', []);
    expect(m.awarded).toBe(0);
    expect(m.status).toBe('verified');
  });

  it('gives a confident zero (no flag) when the answer is a listed unacceptable answer', () => {
    const redCell: PointsQuestion = {
      q: 4, prompt: 'Function of the red blood cell?', max: 1, type: 'points',
      points: ['transports oxygen'], reject: ['fights disease (that is the white blood cell)'],
    };
    const m = markPoints(redCell, 'To fight diseases.', 'in_cloud', [], ['fights disease (that is the white blood cell)']);
    expect(m.awarded).toBe(0);
    expect(m.status).toBe('verified');
    expect(m.reasons.join(' ')).toMatch(/not accepted/i);
  });

  it('ignores points the model claims that are not in the scheme', () => {
    const m = markPoints(liver, 'x', 'in_cloud', ['made up point']);
    expect(m.awarded).toBe(0);
  });
});

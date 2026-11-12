import { describe, expect, it } from 'vitest';
import { applyHomography, computeHomography } from './homography';

describe('computeHomography', () => {
  it('recovers a pure scale + translation', () => {
    const from = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const to = from.map((p) => ({ x: p.x * 3 + 5, y: p.y * 3 + 7 }));
    const h = computeHomography(from, to);
    const p = applyHomography(h, { x: 4, y: 6 });
    expect(p.x).toBeCloseTo(17);
    expect(p.y).toBeCloseTo(25);
  });

  it('maps all four corners of a tilted, perspective-distorted page exactly', () => {
    const sheet = [{ x: 15, y: 15 }, { x: 195, y: 15 }, { x: 195, y: 282 }, { x: 15, y: 282 }];
    const photo = [{ x: 120, y: 90 }, { x: 860, y: 140 }, { x: 900, y: 1210 }, { x: 60, y: 1150 }];
    const h = computeHomography(sheet, photo);
    sheet.forEach((s, i) => {
      const p = applyHomography(h, s);
      expect(p.x).toBeCloseTo(photo[i].x, 6);
      expect(p.y).toBeCloseTo(photo[i].y, 6);
    });
  });

  it('rejects collinear points', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(() => computeHomography(line, line)).toThrow();
  });
});

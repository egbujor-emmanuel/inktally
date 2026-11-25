import { describe, expect, test } from 'vitest';
import { STITCH_GAP, STITCH_MAX_WIDTH, stitchLayout } from './stitch';

describe('joining the pages of one student\'s script', () => {
  test('two phone photos stack top to bottom at one width, with a gap between pages', () => {
    const { width, height, rects } = stitchLayout([{ w: 960, h: 1280 }, { w: 960, h: 1280 }]);
    expect(width).toBe(960);
    expect(rects).toEqual([{ x: 0, y: 0, w: 960, h: 1280 }, { x: 0, y: 1280 + STITCH_GAP, w: 960, h: 1280 }]);
    expect(height).toBe(2 * 1280 + STITCH_GAP);
  });
  test('large photos shrink to the maximum width and keep their shape', () => {
    const { width, rects } = stitchLayout([{ w: 3000, h: 4000 }, { w: 1500, h: 2000 }]);
    expect(width).toBe(STITCH_MAX_WIDTH);
    expect(rects[0].h).toBe(Math.round((4000 * STITCH_MAX_WIDTH) / 3000));
    expect(rects[1].h).toBe(Math.round((2000 * STITCH_MAX_WIDTH) / 1500));
  });
  test('a sideways page keeps its own proportions', () => {
    const { rects } = stitchLayout([{ w: 960, h: 1280 }, { w: 1280, h: 960 }]);
    // Shared width is the widest page (1280), so the portrait page scales to 1280 × 1707 above it.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 1280, h: 1707 });
    expect(rects[1]).toEqual({ x: 0, y: 1707 + STITCH_GAP, w: 1280, h: 960 });
  });
  test('no pages is an error', () => {
    expect(() => stitchLayout([])).toThrow();
  });
});

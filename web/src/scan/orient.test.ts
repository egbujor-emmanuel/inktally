import { describe, expect, test } from 'vitest';
import { inkMask, lineVotes, marginScore, quarterTurn, uprightTurn, type Mask } from './orient';

/** A page of handwriting: lines of letter-sized blobs, each line starting at the same margin and ending raggedly. */
function writtenPage(w = 300, h = 400): Mask {
  const ink = new Uint8Array(w * h);
  const lengths = [24, 9, 17, 30, 12, 26, 7, 20, 15, 28, 11, 22, 18, 25, 10, 27];
  lengths.forEach((letters, line) => {
    const top = 20 + line * 22;
    for (let l = 0; l < letters && 20 + l * 9 < w - 6; l++) {
      for (let y = top; y < top + 5; y++) for (let x = 20 + l * 9; x < 25 + l * 9; x++) ink[y * w + x] = 1;
    }
  });
  return { w, h, ink };
}

describe('turning a sideways exercise-book photo upright', () => {
  test('an upright page is left alone', () => {
    const page = writtenPage();
    expect(lineVotes(page).horizontal).toBeGreaterThan(lineVotes(page).vertical);
    expect(marginScore(page)).toBeGreaterThan(0);
    expect(uprightTurn(page)).toBe(0);
  });
  test('a page photographed turned clockwise is turned back anticlockwise (270° clockwise)', () => {
    expect(uprightTurn(quarterTurn(writtenPage(), true))).toBe(270);
  });
  test('a page photographed turned anticlockwise is turned back clockwise (90°)', () => {
    expect(uprightTurn(quarterTurn(writtenPage(), false))).toBe(90);
  });
  test('a blank or nearly blank photo is never turned', () => {
    expect(uprightTurn({ w: 50, h: 80, ink: new Uint8Array(50 * 80) })).toBe(0);
  });
  test('a quarter turn there and back is the same page', () => {
    const page = writtenPage(40, 60);
    expect(quarterTurn(quarterTurn(page, true), false)).toEqual(page);
  });
  test('ink is what is darker than the paper around it, not what is in shadow', () => {
    const w = 60, h = 60;
    const gray: number[] = Array.from({ length: w * h }, (_, i) => (i % w < 30 ? 120 : 220)); // half the page in shadow
    gray[30 * w + 10] = 60; gray[30 * w + 45] = 150; // a pen mark in each half
    const { ink } = inkMask(gray, w, h);
    expect(ink[30 * w + 10]).toBe(1);
    expect(ink[30 * w + 45]).toBe(1);
    expect(ink[10 * w + 5]).toBe(0);
    expect(ink[10 * w + 50]).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { findFiducials, type GrayImage } from './fiducials';
import { applyHomography, computeHomography } from './homography';
import { A4, FIDUCIAL_CENTRES, FIDUCIAL_SIZE_MM } from './layout';

/** Renders a synthetic photo of a sheet: paper, four solid squares, some handwriting-like strokes. */
function syntheticPhoto(photoCorners: { x: number; y: number }[], width = 900, height = 1200): GrayImage {
  const data = new Uint8Array(width * height).fill(70); // dark table
  const sheetToPhoto = computeHomography(
    [{ x: 0, y: 0 }, { x: A4.width, y: 0 }, { x: A4.width, y: A4.height }, { x: 0, y: A4.height }], photoCorners,
  );
  const photoToSheet = computeHomography(
    photoCorners, [{ x: 0, y: 0 }, { x: A4.width, y: 0 }, { x: A4.width, y: A4.height }, { x: 0, y: A4.height }],
  );
  const half = FIDUCIAL_SIZE_MM / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applyHomography(photoToSheet, { x, y });
      if (s.x < 0 || s.y < 0 || s.x > A4.width || s.y > A4.height) continue;
      let v = 235; // paper
      if (FIDUCIAL_CENTRES.some((c) => Math.abs(s.x - c.x) <= half && Math.abs(s.y - c.y) <= half)) v = 15;
      // thin "handwriting" strokes that must NOT be mistaken for markers
      if (Math.abs(s.y - 80) < 0.4 && s.x > 40 && s.x < 150) v = 30;
      if (Math.abs(s.x - 60) < 0.4 && s.y > 100 && s.y < 160) v = 30;
      data[y * width + x] = v;
    }
  }
  void sheetToPhoto;
  return { width, height, data };
}

describe('findFiducials', () => {
  it('finds all four corners of a tilted, perspective-distorted sheet', () => {
    const photoCorners = [{ x: 110, y: 70 }, { x: 820, y: 120 }, { x: 860, y: 1150 }, { x: 60, y: 1100 }];
    const result = findFiducials(syntheticPhoto(photoCorners));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const toPhoto = computeHomography(
      [{ x: 0, y: 0 }, { x: A4.width, y: 0 }, { x: A4.width, y: A4.height }, { x: 0, y: A4.height }], photoCorners,
    );
    FIDUCIAL_CENTRES.forEach((c, i) => {
      const expected = applyHomography(toPhoto, c);
      expect(Math.hypot(result.corners[i].x - expected.x, result.corners[i].y - expected.y)).toBeLessThan(4);
    });
  });

  it('explains what is wrong when markers are missing', () => {
    const blank: GrayImage = { width: 200, height: 300, data: new Uint8Array(200 * 300).fill(230) };
    const result = findFiducials(blank);
    expect(result.ok).toBe(false);
  });
});

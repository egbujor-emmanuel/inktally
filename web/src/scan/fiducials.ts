// Finds the four solid black corner squares of an InkTally sheet in a grayscale photo.
// Pure function over a luminance buffer so it runs offline and is unit-testable.
import type { Point } from './homography';

export interface GrayImage { width: number; height: number; data: Uint8Array }

interface Blob { area: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number }

/** Otsu's method: the threshold that best separates ink from paper. */
export function otsuThreshold(gray: GrayImage): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray.data) hist[v]++;
  const total = gray.data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** 4-connected dark components via an explicit stack (no recursion limits). */
function darkBlobs(gray: GrayImage, threshold: number): Blob[] {
  const { width, height, data } = gray;
  const seen = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start] > threshold) continue;
    const blob: Blob = { area: 0, minX: width, minY: height, maxX: 0, maxY: 0, sumX: 0, sumY: 0 };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % width;
      const y = (idx - x) / width;
      blob.area++; blob.sumX += x; blob.sumY += y;
      if (x < blob.minX) blob.minX = x; if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y; if (y > blob.maxY) blob.maxY = y;
      const neighbours = [x > 0 ? idx - 1 : -1, x < width - 1 ? idx + 1 : -1, y > 0 ? idx - width : -1, y < height - 1 ? idx + width : -1];
      for (const n of neighbours) {
        if (n >= 0 && !seen[n] && data[n] <= threshold) { seen[n] = 1; stack.push(n); }
      }
    }
    blobs.push(blob);
  }
  return blobs;
}

const MIN_SIDE_FRACTION = 0.02;
const MAX_SIDE_FRACTION = 0.14;
const MIN_FILL = 0.72;
const MAX_ASPECT_SKEW = 0.45;

/** Solid, roughly square blobs of plausible size: candidate corner markers. */
function isMarkerLike(b: Blob, minDim: number): boolean {
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const side = Math.max(w, h);
  if (side < minDim * MIN_SIDE_FRACTION || side > minDim * MAX_SIDE_FRACTION) return false;
  if (Math.abs(w - h) / side > MAX_ASPECT_SKEW) return false;
  return b.area / (w * h) >= MIN_FILL;
}

export type FiducialResult =
  | { ok: true; corners: [Point, Point, Point, Point] }
  | { ok: false; reason: string };

/**
 * Returns marker centroids ordered TL, TR, BR, BL (matching FIDUCIAL_CENTRES),
 * choosing for each image corner the candidate that lies furthest toward it.
 */
export function findFiducials(gray: GrayImage): FiducialResult {
  const minDim = Math.min(gray.width, gray.height);
  const candidates = darkBlobs(gray, otsuThreshold(gray))
    .filter((b) => isMarkerLike(b, minDim))
    .map((b) => ({ x: b.sumX / b.area, y: b.sumY / b.area }));
  if (candidates.length < 4) {
    return { ok: false, reason: `Found ${candidates.length} of 4 corner squares. Fit the whole sheet in the photo, in good light.` };
  }
  const pick = (score: (p: Point) => number): Point => candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
  const tl = pick((p) => -(p.x + p.y));
  const tr = pick((p) => p.x - p.y);
  const br = pick((p) => p.x + p.y);
  const bl = pick((p) => p.y - p.x);
  const corners: [Point, Point, Point, Point] = [tl, tr, br, bl];
  const distinct = new Set(corners.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size === 4;
  if (!distinct) return { ok: false, reason: 'Corner squares are ambiguous. Retake the photo straight above the sheet.' };
  return { ok: true, corners };
}

// Turns a sideways exercise-book photo upright before it is read. On a page photographed sideways the model attached
// every answer to the label above it (Script 3, 25 Nov), so the page is turned in code first, on the device, offline.
//
// 1) Which way do the lines run? Each blob of ink (a letter or word) looks at its two nearest neighbours: neighbours on
//    the same line are closer than those on the next line, so the directions pile up along the lines ("docstrum").
//    Measured on the real scripts: upright pages 1.3–2.9 horizontal per vertical neighbour, sideways pages 0.36–0.72.
// 2) Which way round? Handwriting starts at a straight left margin and ends ragged, so the upright side is the one where
//    the first ink of each row lines up better than the last (e2e/orient-check.mjs runs every real photo four ways).
// A page is only turned on clear evidence; upside-down pages are left alone (a wrong turn would cost more than it saves).

/** Longest side of the copy the page is analysed at, in pixels. */
export const ORIENT_SIDE = 480;
/** Turn only when there are fewer than this many horizontal neighbours per vertical one (sideways pages 0.36–0.72). */
export const SIDEWAYS_RATIO = 0.75;
/** And only when one side is clearly the straight margin (handwritten pages 35+, a printed sheet with boxes 2). */
export const MIN_MARGIN_EVIDENCE = 10;
const LOCAL_RADIUS = 15;
const INK_DARKER_BY = 18;
const MIN_BLOBS = 10;

export interface Mask { w: number; h: number; ink: Uint8Array }

/** Ink = noticeably darker than the paper around it (a local mean, so shadows and uneven light do not count). */
export function inkMask(gray: ArrayLike<number>, w: number, h: number): Mask {
  const k = LOCAL_RADIUS;
  const W = w + 1;
  const sums = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; sums[(y + 1) * W + x + 1] = sums[y * W + x + 1] + row; }
  }
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - k), y1 = Math.min(h, y + k);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - k), x1 = Math.min(w, x + k);
      const total = sums[y1 * W + x1] - sums[y0 * W + x1] - sums[y1 * W + x0] + sums[y0 * W + x0];
      if (gray[y * w + x] < total / ((y1 - y0) * (x1 - x0)) - INK_DARKER_BY) ink[y * w + x] = 1;
    }
  }
  return { w, h, ink };
}

interface InkBlob { size: number; cy: number; cx: number; height: number; width: number }

function blobs({ w, h, ink }: Mask): InkBlob[] {
  const seen = new Uint8Array(w * h);
  const out: InkBlob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || seen[start]) continue;
    seen[start] = 1; stack.push(start);
    let size = 0, sy = 0, sx = 0, minY = h, maxY = 0, minX = w, maxX = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      const y = Math.floor(i / w), x = i % w;
      size++; sy += y; sx += x;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (ink[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push({ size, cy: sy / size, cx: sx / size, height: maxY - minY + 1, width: maxX - minX + 1 });
  }
  return out;
}

/** How many nearest-neighbour directions run along rows versus along columns. */
export function lineVotes(mask: Mask, neighbours = 2): { horizontal: number; vertical: number; blobs: number } {
  // Letter-sized blobs only: not specks, not ruled lines, margins or the spiral binding.
  const pts = blobs(mask).filter((b) => b.size >= 4 && b.height < mask.h / 6 && b.width < mask.w / 3);
  let horizontal = 0, vertical = 0;
  for (let i = 0; i < pts.length; i++) {
    const nearest = pts.map((p, j) => ({ j, d: j === i ? Infinity : Math.hypot(p.cy - pts[i].cy, p.cx - pts[i].cx) }))
      .sort((a, b) => a.d - b.d).slice(0, neighbours);
    for (const { j } of nearest) {
      const angle = Math.abs((Math.atan2(pts[j].cy - pts[i].cy, pts[j].cx - pts[i].cx) * 180) / Math.PI) % 180;
      const fromHorizontal = Math.min(angle, 180 - angle);
      if (fromHorizontal < 30) horizontal++;
      else if (fromHorizontal > 60) vertical++;
    }
  }
  return { horizontal, vertical, blobs: pts.length };
}

/** The mask turned a quarter turn: clockwise when cw, else anticlockwise. */
export function quarterTurn({ w, h, ink }: Mask, cw: boolean): Mask {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = cw ? [h - 1 - y, x] : [y, w - 1 - x];
    out[ny * h + nx] = ink[y * w + x];
  }
  return { w: h, h: w, ink: out };
}

const spread = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

/** Positive when rows start at a straighter edge on the left than they end on the right, as upright writing does. */
export function marginScore({ w, h, ink }: Mask): number {
  const firsts: number[] = [], lasts: number[] = [];
  for (let y = 0; y < h; y++) {
    let first = -1, last = -1, count = 0;
    for (let x = 0; x < w; x++) if (ink[y * w + x]) { if (first < 0) first = x; last = x; count++; }
    if (count > 2) { firsts.push(first); lasts.push(last); }
  }
  return firsts.length < 5 ? 0 : spread(lasts) - spread(firsts);
}

/** Degrees to turn the page clockwise so its writing is upright: 0, 90 or 270. */
export function uprightTurn(mask: Mask): 0 | 90 | 270 {
  const { horizontal, vertical, blobs: count } = lineVotes(mask);
  if (count < MIN_BLOBS || horizontal >= SIDEWAYS_RATIO * vertical) return 0;
  const cw = marginScore(quarterTurn(mask, true)), ccw = marginScore(quarterTurn(mask, false));
  if (Math.abs(cw - ccw) < 2 * MIN_MARGIN_EVIDENCE) return 0;
  return cw > ccw ? 90 : 270;
}

/** Degrees to turn a decoded photo clockwise so its writing is upright (analysed at ORIENT_SIDE pixels). */
export function photoTurn(image: ImageBitmap): 0 | 90 | 270 {
  const scale = Math.min(1, ORIENT_SIDE / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
  const small = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  if (!small) return 0;
  small.drawImage(image, 0, 0, w, h);
  const rgba = small.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return uprightTurn(inkMask(gray, w, h));
}

/** The photo turned upright (a new JPEG), or the same photo when it already is or when the evidence is unclear. */
export async function uprightPhoto(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  try {
    const turn = photoTurn(bitmap);
    if (turn === 0) return photo;
    const canvas = new OffscreenCanvas(bitmap.height, bitmap.width);
    const g = canvas.getContext('2d');
    if (!g) return photo;
    g.translate(canvas.width / 2, canvas.height / 2);
    g.rotate((turn * Math.PI) / 180);
    g.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  } finally {
    bitmap.close();
  }
}

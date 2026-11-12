// Produces a "marked copy" of the pupil's own work: red ticks/crosses + scores drawn on it, total circled.
// This removes the second, physical round of marking — the teacher prints/shares this and writes only the total.
import type { Mark } from '../domain/types';
import { applyHomography, type Homography } from './homography';
import { A4, type BoxRect } from './layout';

const PAGE_PX_PER_MM = 4;
const PEN = '#d7263d';
const FLAG = '#d99a1e';
const HAND_FONT = '"Caveat", "Segoe Print", cursive';

function canvas(width: number, height: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser');
  return [c, ctx];
}

async function pixelsOf(photo: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const [, ctx] = canvas(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Straightens the whole A4 sheet out of the photo (bilinear sampling through the homography). */
function straightenSheet(photo: ImageData, h: Homography): ImageData {
  const outW = A4.width * PAGE_PX_PER_MM;
  const outH = A4.height * PAGE_PX_PER_MM;
  const out = new ImageData(outW, outH);
  const { width: pw, height: ph, data: src } = photo;
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const p = applyHomography(h, { x: ox / PAGE_PX_PER_MM, y: oy / PAGE_PX_PER_MM });
      const o = (oy * outW + ox) * 4;
      if (p.x < 0 || p.y < 0 || p.x >= pw - 1 || p.y >= ph - 1) { out.data.fill(255, o, o + 4); continue; }
      const xi = Math.floor(p.x); const yi = Math.floor(p.y); const fx = p.x - xi; const fy = p.y - yi;
      for (let c = 0; c < 3; c++) {
        const i = (yi * pw + xi) * 4 + c;
        out.data[o + c] = (src[i] * (1 - fx) + src[i + 4] * fx) * (1 - fy) + (src[i + pw * 4] * (1 - fx) + src[i + pw * 4 + 4] * fx) * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function glyph(ctx: OffscreenCanvasRenderingContext2D, mark: Mark, x: number, y: number, size: number): void {
  const s = size / 56;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 6 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = mark.status === 'flagged' ? FLAG : PEN;
  const line = (pts: number[][]) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s))); ctx.stroke(); };
  if (mark.status === 'flagged') { ctx.font = `700 ${size}px ${HAND_FONT}`; ctx.fillStyle = FLAG; ctx.fillText('?', 14 * s, 48 * s); }
  else if (mark.awarded === mark.max) line([[6, 30], [20, 44], [50, 10]]);
  else if (mark.awarded > 0) { line([[6, 30], [20, 44], [50, 10]]); line([[30, 44], [44, 30]]); }
  else { line([[10, 10], [46, 46]]); line([[46, 10], [10, 46]]); }
  ctx.restore();
}

function totalBadge(ctx: OffscreenCanvasRenderingContext2D, total: number, max: number, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = PEN; ctx.fillStyle = PEN; ctx.lineWidth = r * 0.08;
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r, -0.12, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `700 ${r}px ${HAND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${total}/${max}`, cx, cy + r * 0.05);
  ctx.restore();
}

function footer(ctx: OffscreenCanvasRenderingContext2D, pupil: string, height: number, scale: number): void {
  ctx.save();
  ctx.fillStyle = '#5a6378';
  ctx.font = `${11 * scale}px "Inter Tight", Arial, sans-serif`;
  ctx.fillText(`${pupil} · marked by REDPEN · ${new Date().toLocaleDateString()}`, 16 * scale, height - 12 * scale);
  ctx.restore();
}

async function toPng(c: OffscreenCanvas): Promise<Blob> {
  await document.fonts.load(`700 40px ${HAND_FONT}`).catch(() => undefined);
  return c.convertToBlob({ type: 'image/png' });
}

/** Printed REDPEN sheet: draw each mark beside its own answer box on the straightened sheet. */
export async function markedSheetCopy(photo: Blob, sheetToPhoto: Homography, boxes: readonly BoxRect[], marks: Mark[], pupil: string): Promise<Blob> {
  const page = straightenSheet(await pixelsOf(photo), sheetToPhoto);
  const [c, ctx] = canvas(page.width, page.height);
  ctx.putImageData(page, 0, 0);
  await document.fonts.load(`700 40px ${HAND_FONT}`).catch(() => undefined);
  const mm = PAGE_PX_PER_MM;
  for (const box of boxes) {
    const mark = marks.find((m) => m.q === box.q);
    if (!mark) continue;
    const size = Math.min(14, box.h - 2) * mm;
    glyph(ctx, mark, (box.x + box.w - 30) * mm, (box.y + 1) * mm, size);
    ctx.font = `700 ${9 * mm}px ${HAND_FONT}`; ctx.fillStyle = mark.status === 'flagged' ? FLAG : PEN;
    ctx.fillText(`${mark.awarded}/${mark.max}`, (box.x + box.w - 14) * mm, (box.y + 10) * mm);
  }
  const total = marks.reduce((a, m) => a + m.awarded, 0);
  const max = marks.reduce((a, m) => a + m.max, 0);
  totalBadge(ctx, total, max, 172 * mm, 25 * mm, 9 * mm);
  footer(ctx, pupil, c.height, mm / 2.5);
  return toPng(c);
}

/** Exercise-book page: keep the photo, add a red marking panel listing every question and the total. */
export async function markedPageCopy(photo: Blob, marks: Mark[], pupil: string): Promise<Blob> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const pw = Math.round(bitmap.width * scale); const ph = Math.round(bitmap.height * scale);
  const panel = Math.round(pw * 0.32);
  const [c, ctx] = canvas(pw + panel, ph);
  ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0, pw, ph);
  bitmap.close();
  await document.fonts.load(`700 40px ${HAND_FONT}`).catch(() => undefined);
  const u = panel / 100;
  const total = marks.reduce((a, m) => a + m.awarded, 0);
  const max = marks.reduce((a, m) => a + m.max, 0);
  totalBadge(ctx, total, max, pw + panel / 2, 18 * u, 11 * u);
  const row = Math.min(14 * u, (ph - 46 * u) / Math.max(marks.length, 1));
  marks.forEach((m, i) => {
    const y = 40 * u + i * row;
    ctx.fillStyle = '#1f2a44'; ctx.font = `700 ${row * 0.55}px Georgia, serif`;
    ctx.fillText(`Q${m.q}`, pw + 8 * u, y + row * 0.62);
    glyph(ctx, m, pw + 34 * u, y + row * 0.1, row * 0.8);
    ctx.fillStyle = m.status === 'flagged' ? FLAG : PEN; ctx.font = `700 ${row * 0.7}px ${HAND_FONT}`;
    ctx.fillText(`${m.awarded}/${m.max}`, pw + 62 * u, y + row * 0.68);
  });
  footer(ctx, pupil, c.height, u / 3);
  return toPng(c);
}

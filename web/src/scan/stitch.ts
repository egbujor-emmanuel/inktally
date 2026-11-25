// A student's script often runs over several exercise-book pages, and an answer can continue onto the next page.
// Each page is turned upright if it was photographed sideways, then the pages are joined one above the other into one
// image, so the whole script is read, marked, saved, queued offline and cloud-checked exactly like a one-page script.
import { uprightPhoto } from './orient';

/** Widest joined image, in pixels: enough for handwriting, small enough to keep several pages in memory on a phone. */
export const STITCH_MAX_WIDTH = 1400;
/** Grey band between pages, in pixels, so the reader sees where each page ends. */
export const STITCH_GAP = 24;
/** Most pages joined into one script. */
export const MAX_SCRIPT_PAGES = 4;

export interface Rect { x: number; y: number; w: number; h: number }

/** Every page scaled to one shared width (the widest page, at most maxWidth) and stacked top to bottom in order. */
export function stitchLayout(sizes: ReadonlyArray<{ w: number; h: number }>, maxWidth = STITCH_MAX_WIDTH, gap = STITCH_GAP): { width: number; height: number; rects: Rect[] } {
  if (!sizes.length) throw new Error('No pages to join.');
  const width = Math.min(maxWidth, Math.max(...sizes.map((s) => s.w)));
  let y = 0;
  const rects = sizes.map((s, i) => {
    const h = Math.round((s.h * width) / s.w);
    const rect = { x: 0, y: y + (i ? gap : 0), w: width, h };
    y = rect.y + h;
    return rect;
  });
  return { width, height: y, rects };
}

/** Joins the photographed pages of one student's script into one JPEG, in the order chosen. */
export async function stitchPages(photos: readonly Blob[]): Promise<Blob> {
  if (photos.length > MAX_SCRIPT_PAGES) throw new Error(`Choose at most ${MAX_SCRIPT_PAGES} pages for one student.`);
  const upright = await Promise.all(photos.map(uprightPhoto));
  const bitmaps = await Promise.all(upright.map((p) => createImageBitmap(p, { imageOrientation: 'from-image' })));
  try {
    const { width, height, rects } = stitchLayout(bitmaps.map((b) => ({ w: b.width, h: b.height })));
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('This browser cannot join photos.');
    g.fillStyle = '#9aa0a6';
    g.fillRect(0, 0, width, height);
    bitmaps.forEach((b, i) => g.drawImage(b, rects[i].x, rects[i].y, rects[i].w, rects[i].h));
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  } finally {
    bitmaps.forEach((b) => b.close());
  }
}

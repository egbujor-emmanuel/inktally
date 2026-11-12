// Browser pipeline: photo -> corner markers -> perspective fix -> one PNG per answer box.
// Only these crops are ever sent to a model, so the pupil's name line never leaves the device.
import { findFiducials, type GrayImage } from './fiducials';
import { applyHomography, computeHomography, type Homography } from './homography';
import { FIDUCIAL_CENTRES, type BoxRect } from './layout';

const DETECT_MAX_SIDE = 1000;
const CROP_PX_PER_MM = 6;
const BOX_INNER_MARGIN_MM = 1.2; // skip the printed border line

export interface AnswerCrop { q: number; blob: Blob; dataUrl: string }

export type ScanResult =
  | { ok: true; crops: AnswerCrop[]; sheetToPhoto: Homography }
  | { ok: false; reason: string };

async function loadBitmap(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source, { imageOrientation: 'from-image' });
}

function toGray(ctx: CanvasRenderingContext2D, width: number, height: number): GrayImage {
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { width, height, data };
}

function canvas2d(width: number, height: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser');
  return [c, ctx];
}

/** Bilinear sample from the full-resolution photo for every pixel of the straightened box. */
function warpBox(photo: ImageData, h: Homography, box: BoxRect): ImageData {
  const x0 = box.x + BOX_INNER_MARGIN_MM;
  const y0 = box.y + BOX_INNER_MARGIN_MM;
  const wMm = box.w - 2 * BOX_INNER_MARGIN_MM;
  const hMm = box.h - 2 * BOX_INNER_MARGIN_MM;
  const outW = Math.round(wMm * CROP_PX_PER_MM);
  const outH = Math.round(hMm * CROP_PX_PER_MM);
  const out = new ImageData(outW, outH);
  const { width: pw, height: ph, data: src } = photo;
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const p = applyHomography(h, { x: x0 + ox / CROP_PX_PER_MM, y: y0 + oy / CROP_PX_PER_MM });
      const o = (oy * outW + ox) * 4;
      if (p.x < 0 || p.y < 0 || p.x >= pw - 1 || p.y >= ph - 1) { out.data.fill(255, o, o + 4); continue; }
      const xi = Math.floor(p.x); const yi = Math.floor(p.y);
      const fx = p.x - xi; const fy = p.y - yi;
      for (let c = 0; c < 3; c++) {
        const i00 = (yi * pw + xi) * 4 + c;
        const top = src[i00] * (1 - fx) + src[i00 + 4] * fx;
        const bottom = src[i00 + pw * 4] * (1 - fx) + src[i00 + pw * 4 + 4] * fx;
        out.data[o + c] = top * (1 - fy) + bottom * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

async function encode(image: ImageData): Promise<{ blob: Blob; dataUrl: string }> {
  const [c, ctx] = canvas2d(image.width, image.height);
  ctx.putImageData(image, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read crop'));
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

/** Finds the sheet in a photo and returns one straightened crop per answer box. */
export async function scanSheet(photo: Blob, boxes: readonly BoxRect[]): Promise<ScanResult> {
  const bitmap = await loadBitmap(photo);
  try {
    const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const dw = Math.round(bitmap.width * scale);
    const dh = Math.round(bitmap.height * scale);
    const [, small] = canvas2d(dw, dh);
    small.drawImage(bitmap, 0, 0, dw, dh);
    const found = findFiducials(toGray(small as unknown as CanvasRenderingContext2D, dw, dh));
    if (!found.ok) return found;

    const photoCorners = found.corners.map((p) => ({ x: p.x / scale, y: p.y / scale }));
    const sheetToPhoto = computeHomography(FIDUCIAL_CENTRES, photoCorners);
    const [, full] = canvas2d(bitmap.width, bitmap.height);
    full.drawImage(bitmap, 0, 0);
    const pixels = full.getImageData(0, 0, bitmap.width, bitmap.height);
    const crops: AnswerCrop[] = [];
    for (const box of boxes) {
      crops.push({ q: box.q, ...(await encode(warpBox(pixels, sheetToPhoto, box))) });
    }
    return { ok: true, crops, sheetToPhoto };
  } finally {
    bitmap.close();
  }
}

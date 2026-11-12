// Puts the institution letterhead above a marked copy and the teacher's comment below it, so the image
// can go straight to a parent or into a file as an official record.

export interface LetterheadInfo {
  institution: string;
  details: string;
  teacher: string;
  title: string;
  className: string;
  pupil: string;
  total: number;
  max: number;
  comment: string;
  date?: Date;
}

const INK = '#1f2a44';
const SOFT = '#5b6273';
const PEN = '#c8102e';

/** Splits text into lines that fit `maxWidth` according to `measure`. A single long word gets its own line. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export async function withLetterhead(copy: Blob, info: LetterheadInfo): Promise<Blob> {
  const image = await loadBitmap(copy);
  const width = image.width;
  const u = width / 100; // 1 unit = 1% of the page width, so the text scales with the photo.
  const pad = 4 * u;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  await document.fonts?.ready;

  const serif = (px: number) => `700 ${px}px Fraunces, Georgia, serif`;
  const sans = (px: number, weight = 400) => `${weight} ${px}px "Inter Tight", Arial, sans-serif`;
  const hand = (px: number) => `${px}px Caveat, "Comic Sans MS", cursive`;

  ctx.font = sans(2.6 * u);
  const detailLines = info.details ? wrapLines((s) => ctx.measureText(s).width, info.details, width - 2 * pad) : [];
  ctx.font = hand(4.2 * u);
  const commentLines = info.comment ? wrapLines((s) => ctx.measureText(s).width, info.comment, width - 2 * pad) : [];

  const headerH = Math.round(pad + (info.institution ? 5.2 * u : 0) + detailLines.length * 3.4 * u + 7 * u + pad / 2);
  const footerH = commentLines.length ? pad + 4 * u + commentLines.length * 5 * u + pad : pad / 2;
  canvas.width = width;
  canvas.height = Math.round(headerH + image.height + footerH);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  let y = pad;
  if (info.institution) {
    ctx.fillStyle = INK; ctx.font = serif(4.4 * u);
    ctx.fillText(info.institution, pad, y); y += 5.2 * u;
  }
  ctx.fillStyle = SOFT; ctx.font = sans(2.6 * u);
  for (const line of detailLines) { ctx.fillText(line, pad, y); y += 3.4 * u; }
  y += 1.2 * u;
  ctx.fillStyle = INK; ctx.font = sans(3 * u, 600);
  const date = (info.date ?? new Date()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.fillText(`${info.pupil} · ${info.title}${info.className ? ` · ${info.className}` : ''} · ${date}`, pad, y, width - 2 * pad - 14 * u);
  ctx.textAlign = 'right'; ctx.fillStyle = PEN; ctx.font = hand(6 * u);
  ctx.fillText(`${info.total}/${info.max}`, width - pad, y - 2 * u);
  ctx.textAlign = 'left';
  ctx.strokeStyle = PEN; ctx.lineWidth = Math.max(1, 0.3 * u);
  ctx.beginPath(); ctx.moveTo(pad, headerH - pad / 4); ctx.lineTo(width - pad, headerH - pad / 4); ctx.stroke();

  ctx.drawImage(image, 0, headerH);

  if (commentLines.length) {
    let fy = headerH + image.height + pad;
    ctx.fillStyle = SOFT; ctx.font = sans(2.6 * u, 600);
    ctx.fillText(info.teacher ? `COMMENT FROM ${info.teacher.toUpperCase()}` : 'TEACHER’S COMMENT', pad, fy); fy += 4 * u;
    ctx.fillStyle = PEN; ctx.font = hand(4.2 * u);
    for (const line of commentLines) { ctx.fillText(line, pad, fy); fy += 5 * u; }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not build the marked copy'))), 'image/png'));
}

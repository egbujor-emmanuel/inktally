// Public benchmark: real human handwriting from the MNIST test set (Y. LeCun, C. Cortes, C. Burges; 10,000 digits
// written by Census Bureau employees and high-school students), written into printed InkTally answer sheets and
// "photographed" (turned, scaled, sheared, blurred, shadowed, noisy, JPEG). InkTally's own modules do everything after
// that: the scanner finds the corner squares and cuts out each box, the cloud reads every box of a sheet in one request,
// and code marks each answer against the key. About 40% of the written answers are wrong on purpose, so the marks are
// tested, not just the reading. Seeded, so every run uses the same digits, numbers and distortions.
//
// Usage: npx vite --port 5179 (in web/), then
//   node bench/mnist-sheets.mjs <folder with t10k-images-idx3-ubyte.gz and t10k-labels-idx1-ubyte.gz> [out.json] [sheets]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [dir, outArg, sheetsArg] = process.argv.slice(2);
if (!dir) throw new Error('Pass the folder with the MNIST test files');
const OUT = resolve(outArg ?? '../bench/evidence/mnist-sheets/results.json');
const SHEETS = Number(sheetsArg ?? 30);
const PER_SHEET = 8;
const U = process.env.DEV_URL ?? 'http://localhost:5179';

const images = gunzipSync(readFileSync(join(dir, 't10k-images-idx3-ubyte.gz')));
const labels = gunzipSync(readFileSync(join(dir, 't10k-labels-idx1-ubyte.gz')));
const count = labels.readUInt32BE(4);
const byDigit = Array.from({ length: 10 }, () => []);
for (let i = 0; i < count; i++) byDigit[labels[8 + i]].push(i);
const digitPixels = (i) => Array.from(images.subarray(16 + i * 784, 16 + (i + 1) * 784));

// mulberry32: a small seeded generator, so the benchmark is the same every run.
let seed = 20261126;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (n) => Math.floor(rand() * n);
const used = new Set();
const handwritten = (digit) => { let i; do { i = byDigit[digit][pick(byDigit[digit].length)]; } while (used.has(i)); used.add(i); return { index: i, pixels: digitPixels(i) }; };

const sheets = Array.from({ length: SHEETS }, (_, s) => {
  const answers = Array.from({ length: PER_SHEET }, (_, k) => {
    const key = 1 + pick(999);
    let written = key;
    if (rand() < 0.4) do { written = 1 + pick(999); } while (written === key);
    return { q: k + 1, key, written, digits: String(written).split('').map((d) => handwritten(Number(d))) };
  });
  return {
    sheet: s + 1, answers,
    photo: { turn: (rand() - 0.5) * 16, scale: 0.6 + rand() * 0.2, shear: (rand() - 0.5) * 0.08, blur: rand() * 1.5, shadow: rand() * 0.45, noise: rand() * 18, jpeg: 0.6 + rand() * 0.3 },
  };
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${U}/llms.txt`, { timeout: 120_000 });
const results = [];
const markSheet = (sheet) => page.evaluate(async ({ answers, photo }) => {
    const { layoutSheet, A4, FIDUCIAL_CENTRES, FIDUCIAL_SIZE_MM } = await import('/src/scan/layout.ts');
    const { scanSheet } = await import('/src/scan/pipeline.ts');
    const { markAnswersBatch } = await import('/src/marking/markAnswer.ts');
    const questions = answers.map((a) => ({ q: a.q, type: 'numeric', prompt: `Question ${a.q}`, max: 1, accept: [a.key] }));
    const boxes = layoutSheet(questions)[0].boxes;
    // The printed sheet at 4 px per mm, with each written number in its box.
    const S = 4; const sheetCanvas = document.createElement('canvas'); sheetCanvas.width = A4.width * S; sheetCanvas.height = A4.height * S;
    const g = sheetCanvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height); g.fillStyle = '#000';
    for (const c of FIDUCIAL_CENTRES) g.fillRect((c.x - FIDUCIAL_SIZE_MM / 2) * S, (c.y - FIDUCIAL_SIZE_MM / 2) * S, FIDUCIAL_SIZE_MM * S, FIDUCIAL_SIZE_MM * S);
    g.strokeStyle = '#555'; g.lineWidth = 1.2;
    for (const b of boxes) {
      g.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
      const a = answers.find((x) => x.q === b.q);
      const size = Math.min(b.h * S * 0.7, 120);
      a.digits.forEach((d, i) => {
        const img = g.createImageData(28, 28);
        for (let p = 0; p < 784; p++) { const v = d.pixels[p]; img.data[p * 4] = 20; img.data[p * 4 + 1] = 30; img.data[p * 4 + 2] = 80; img.data[p * 4 + 3] = v; }
        const tile = document.createElement('canvas'); tile.width = 28; tile.height = 28; tile.getContext('2d').putImageData(img, 0, 0);
        g.drawImage(tile, b.x * S + 30 + i * size * 0.8, b.y * S + (b.h * S - size) / 2, size, size);
      });
    }
    // The "photo": on a desk, turned, scaled, sheared, blurred, with a shadow, noise and JPEG.
    const shot = document.createElement('canvas'); shot.width = 1500; shot.height = 2000;
    const p = shot.getContext('2d'); p.fillStyle = '#7d6b57'; p.fillRect(0, 0, shot.width, shot.height);
    p.filter = `blur(${photo.blur.toFixed(2)}px)`;
    p.translate(750, 1000); p.rotate((photo.turn * Math.PI) / 180); p.transform(1, photo.shear, photo.shear / 2, 1, 0, 0);
    const k = (photo.scale * 1500) / sheetCanvas.width; p.scale(k, k);
    p.drawImage(sheetCanvas, -sheetCanvas.width / 2, -sheetCanvas.height / 2);
    p.setTransform(1, 0, 0, 1, 0, 0); p.filter = 'none';
    const shade = p.createLinearGradient(0, 0, shot.width, shot.height); shade.addColorStop(0, `rgba(0,0,0,${photo.shadow})`); shade.addColorStop(0.6, 'rgba(0,0,0,0)');
    p.fillStyle = shade; p.fillRect(0, 0, shot.width, shot.height);
    const px = p.getImageData(0, 0, shot.width, shot.height);
    let s2 = 7; const r2 = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
    for (let i = 0; i < px.data.length; i += 4) { const n = (r2() - 0.5) * 2 * photo.noise; px.data[i] += n; px.data[i + 1] += n; px.data[i + 2] += n; }
    p.putImageData(px, 0, 0);
    const blob = await new Promise((done) => shot.toBlob(done, 'image/jpeg', photo.jpeg));
    const scan = await scanSheet(blob, boxes);
    if (!scan.ok) return { refused: scan.reason };
    const started = performance.now();
    const marks = await markAnswersBatch(questions, scan.crops.map((c) => ({ q: c.q, type: 'numeric', blob: c.blob })));
    return { ms: Math.round(performance.now() - started), marks: marks.map((m) => ({ q: m.q, read: m.read, awarded: m.awarded, status: m.status })) };
  }, { answers: sheet.answers, photo: sheet.photo }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 300) }));

// A dropped connection or an overloaded model is not the benchmark's result: wait and try the same sheet again.
const RETRYABLE = /Failed to fetch|network|timeout|timed out|overloaded|high demand|\b50\d\b/i;
for (const sheet of sheets) {
  let r = await markSheet(sheet);
  for (let attempt = 1; attempt <= 4 && r.error && RETRYABLE.test(r.error); attempt++) {
    console.log(`sheet ${sheet.sheet}: ${r.error.slice(0, 80)} — retrying in 30 s`);
    await new Promise((done) => setTimeout(done, 30_000));
    r = await markSheet(sheet);
  }
  results.push({
    sheet: sheet.sheet, photo: sheet.photo, ...r,
    answers: sheet.answers.map((a) => ({ q: a.q, key: a.key, written: a.written, mnist: a.digits.map((d) => d.index), ...(r.marks?.find((m) => m.q === a.q) ?? {}) })),
  });
  const ok = r.marks ? `${r.marks.length} marked in ${r.ms} ms` : r.refused ? `refused: ${r.refused}` : `error: ${r.error}`;
  console.log(`sheet ${sheet.sheet}/${SHEETS}: ${ok}`);
  if (r.error && /quota|429/i.test(r.error)) break;
  await new Promise((done) => setTimeout(done, 4_500));
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  dataset: 'MNIST test set (yann.lecun.com/exdb/mnist; files from storage.googleapis.com/cvdf-datasets/mnist, MD5 9fb629c4… images, ec29112d… labels)',
  method: `${SHEETS} printed InkTally sheets × ${PER_SHEET} numeric answers; numbers 1–999 written with MNIST test digits (each digit image used once); about 40% written wrong on purpose; seeded photo distortions; InkTally scanner + one cloud read per sheet + code marking.`,
  seed: 20261126, results,
}, null, 1));
await browser.close();

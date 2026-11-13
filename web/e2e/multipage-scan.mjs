// Multi-page answer sheets: a 12-question assignment spans 2 sheet pages. Render page 2, "photograph" it
// (rotated, scaled, on a desk background), and check the scanner finds the corners and crops exactly page 2's boxes.
// Uses the real app modules through the Vite dev server; no AI calls.
import { chromium } from '@playwright/test';
const U = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
await page.goto(U);
const result = await page.evaluate(async () => {
  const { layoutSheet, A4, FIDUCIAL_CENTRES, FIDUCIAL_SIZE_MM } = await import('/src/scan/layout.ts');
  const { scanSheet } = await import('/src/scan/pipeline.ts');
  const questions = Array.from({ length: 12 }, (_, i) => (i % 3 === 2
    ? { q: i + 1, type: 'points', prompt: `Theory ${i + 1}`, max: 3, points: ['a', 'b', 'c'] }
    : { q: i + 1, type: 'short', prompt: `Q${i + 1}`, max: 1, accept: ['x'] }));
  const pages = layoutSheet(questions);
  const target = pages[1];
  // Draw page 2 at 4 px/mm with each box's question number written inside it as fake handwriting.
  const S = 4; const sheet = document.createElement('canvas'); sheet.width = A4.width * S; sheet.height = A4.height * S;
  const g = sheet.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, sheet.width, sheet.height); g.fillStyle = '#000';
  for (const c of FIDUCIAL_CENTRES) g.fillRect((c.x - FIDUCIAL_SIZE_MM / 2) * S, (c.y - FIDUCIAL_SIZE_MM / 2) * S, FIDUCIAL_SIZE_MM * S, FIDUCIAL_SIZE_MM * S);
  g.strokeStyle = '#1f2a44'; g.lineWidth = 1.4; g.font = `${10 * S}px cursive`;
  for (const b of target.boxes) { g.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S); g.fillText(`ans ${b.q}`, (b.x + 4) * S, (b.y + 12) * S); }
  // "Photo": desk-coloured canvas, sheet rotated 7 degrees and scaled to 70%.
  const photo = document.createElement('canvas'); photo.width = 1500; photo.height = 2000;
  const p = photo.getContext('2d'); p.fillStyle = '#8a7a66'; p.fillRect(0, 0, photo.width, photo.height);
  p.translate(750, 1000); p.rotate((7 * Math.PI) / 180); p.scale(0.7 * 1500 / sheet.width, 0.7 * 1500 / sheet.width);
  p.drawImage(sheet, -sheet.width / 2, -sheet.height / 2);
  const blob = await new Promise((r) => photo.toBlob(r, 'image/jpeg', 0.9));
  const scan = await scanSheet(blob, target.boxes);
  if (!scan.ok) return { pages: pages.length, ok: false, reason: scan.reason };
  // Each crop should contain its own "ans N" ink: check the crop is not blank (dark pixels present).
  const inked = await Promise.all(scan.crops.map(async (c) => {
    const bmp = await createImageBitmap(c.blob); const cv = new OffscreenCanvas(bmp.width, bmp.height); const x = cv.getContext('2d'); x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data; let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
    return { q: c.q, darkPixels: dark };
  }));
  return { pages: pages.length, page2Questions: target.boxes.map((b) => b.q), ok: true, croppedQuestions: scan.crops.map((c) => c.q), inked };
});
console.log(JSON.stringify(result, null, 1));
const pass = result.ok && result.pages >= 2 && JSON.stringify(result.page2Questions) === JSON.stringify(result.croppedQuestions) && result.inked.every((c) => c.darkPixels > 50);
console.log(pass ? 'PASS multi-page: page 2 scanned and every page-2 box cropped with its own ink' : 'FAIL multi-page');
await browser.close();
process.exit(pass ? 0 : 1);

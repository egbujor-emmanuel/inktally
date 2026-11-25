// Real-photo check of the page-orientation step (src/scan/orient.ts), in Chrome through the Vite dev server; no AI calls.
// Every exercise-book photo is turned 0/90/180/270 degrees; InkTally must turn sideways ones back upright and leave
// upright ones alone. Upside-down pages are deliberately left alone (expected 180 -> no turn). A printed InkTally sheet
// may also be left sideways (sheet mode finds its corner squares), but no photo may ever be turned the wrong way.
// Usage: npx vite (in web/), then node e2e/orient-check.mjs [http://localhost:5173]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const U = process.argv[2] ?? 'http://localhost:5173';
const ROOT = resolve(import.meta.dirname, '../../samples');
// Script 3 was photographed sideways: turning it 90° clockwise makes it upright.
const PHOTOS = [['waec-handwritten/script-1.png', 0], ['waec-handwritten/script-2.png', 0], ['waec-handwritten/script-3.png', 90],
  ['waec-handwritten/script-4-page-1.png', 0], ['waec-handwritten/script-4-page-2.png', 0], ['maths.png', 0], ['bio-good.png', 0], ['english-sheet-photo.jpg', 0, 'printed']];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(U);
let pass = 0, all = 0, wrong = 0;
for (const [file, upright, printed] of PHOTOS) {
  const data = readFileSync(resolve(ROOT, file)).toString('base64');
  const turns = await page.evaluate(async ({ data, type }) => {
    const { photoTurn } = await import('/src/scan/orient.ts');
    const src = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob());
    const out = [];
    for (const deg of [0, 90, 180, 270]) {
      const swap = deg % 180 !== 0;
      const c = new OffscreenCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
      const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(src, -src.width / 2, -src.height / 2);
      out.push(photoTurn(await createImageBitmap(c)));
    }
    return out;
  }, { data, type: file.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
  [0, 90, 180, 270].forEach((deg, i) => {
    // The photo as given needs `upright` clockwise; after turning it `deg` more, it needs (upright - deg) mod 360.
    const need = (((upright - deg) % 360) + 360) % 360;
    const want = need === 180 ? 0 : need;
    const ok = turns[i] === want || (printed && turns[i] === 0);
    all++; if (ok) pass++; if (turns[i] !== want && turns[i] !== 0) wrong++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${file} turned ${deg}°: InkTally turns ${turns[i]}°, should turn ${want}°${printed && turns[i] === 0 && want ? ' (printed sheet left as is)' : ''}`);
  });
}
console.log(`
${pass}/${all} orientations right · ${wrong} turned the wrong way`);
await browser.close();
process.exit(pass === all && wrong === 0 ? 0 : 1);

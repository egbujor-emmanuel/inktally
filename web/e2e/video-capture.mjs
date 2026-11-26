// Demo-video footage: one continuous recording of the live site, every feature, real AI, real handwriting.
// A visible cursor and a click ripple are drawn into the page; typing is human-paced. Each scene's start and end,
// and every wait for the AI, are logged to ../video/footage/markers.json so the editor can cut and retime.
// Usage: REDPEN_CODE=... node e2e/video-capture.mjs [url]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ = process.argv[2] ?? 'https://inktally.web.app';
const ROOT = resolve(import.meta.dirname, '../..');
const S = (f) => resolve(ROOT, 'samples', f);
const OUT = resolve(ROOT, 'video/footage');
mkdirSync(OUT, { recursive: true });
const GUIDE = readFileSync(resolve(ROOT, 'docs/real-test/guide.txt'), 'utf8');

const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 22 + 'px', top: e.clientY - 22 + 'px', width: '44px', height: '44px', borderRadius: '50%',
        border: '3px solid #C81D35', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform 450ms ease-out, opacity 450ms ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } }, acceptDownloads: true });
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();
const t0 = Date.now();
const markers = [];
const mark = (name, kind = 'scene') => { markers.push({ name, kind, t: +((Date.now() - t0) / 1000).toFixed(2) }); if (kind !== 'click') console.log(`${markers.at(-1).t}s ${kind} ${name}`); };
const pause = (ms) => page.waitForTimeout(ms);
const save = () => writeFileSync(`${OUT}/markers.json`, JSON.stringify(markers, null, 1));

/** Move the visible cursor to an element, then click it. */
async function click(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 }); await pause(250); mark('click', 'click'); await page.mouse.down(); await page.mouse.up(); }
  else await locator.click();
  await pause(400);
}
async function type(locator, text) { await click(locator); markers.push({ name: 'typing', kind: 'typing', t: +((Date.now() - t0) / 1000).toFixed(2), chars: text.length }); await locator.pressSequentially(text, { delay: 45 }); await pause(300); }
async function point(locator) { const b = await locator.boundingBox(); if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 }); await pause(500); }
/** A wait for the AI: logged so the editor speeds it up. */
async function waitAI(name, locator, timeout = 300_000) { mark(name, 'wait-start'); await locator.waitFor({ timeout }); mark(name, 'wait-end'); await pause(900); }
async function scrollBy(px) { await page.mouse.wheel(0, px); await pause(700); }
async function upload(buttonText, files) {
  const btn = page.getByRole('button', { name: buttonText }).first();
  if (await btn.count()) await point(btn);
  await page.locator('input[aria-label^="Choose photo"]').first().setInputFiles(files);
}

try {
  await page.goto(URL_, { timeout: 120_000 });
  if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE ?? ''); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 120_000 });
  await pause(1500);

  mark('home');
  await point(page.getByRole('button', { name: 'Quick mark' }).or(page.getByRole('link', { name: 'Quick mark' })).first());
  await pause(1500);

  mark('school');
  await page.goto(`${URL_}/school`); await page.getByLabel('Institution name').waitFor();
  await type(page.getByLabel('Institution name'), 'Greenfield College');
  await type(page.getByLabel(/Details under the name/), 'Ikeja, Lagos · First Term');
  await type(page.getByLabel(/Teacher or examiner name/), 'Mrs A. Okafor');
  await click(page.getByRole('button', { name: 'Save details' }));
  await pause(1200);

  mark('quick-mark');
  await page.goto(`${URL_}/quick`); await pause(1200);
  await upload(/Photograph|Choose photo/, S('maths.png'));
  await waitAI('quick-key', page.getByText('Does this answer key look right?'), 180_000);
  await scrollBy(400); await scrollBy(400);
  await click(page.getByRole('button', { name: /Looks right/ }));
  await waitAI('quick-marked', page.getByText(/^Total:/), 180_000);
  await scrollBy(500); await scrollBy(500); await pause(1500);

  mark('waec-key');
  await page.goto(`${URL_}/new`); await page.getByRole('heading', { name: 'The question paper' }).waitFor();
  await type(page.getByLabel('Title'), 'SS2 Physics — WAEC practice');
  await type(page.getByLabel('Class / group'), 'SS 2');
  await type(page.getByLabel('Subject'), 'Physics');
  const guideBox = page.getByLabel('…or type / paste your marking scheme');
  await click(guideBox); await guideBox.fill(GUIDE); await pause(1500);
  await click(page.getByRole('button', { name: 'Use my marking scheme' }));
  await waitAI('waec-draft', page.getByRole('button', { name: 'Save and print answer sheets' }), 300_000);
  for (let i = 0; i < 6; i++) await scrollBy(450);
  await click(page.getByRole('button', { name: 'Save and print answer sheets' }));
  await page.waitForURL(/\/print$/, { timeout: 60_000 }); await pause(2500);
  const base = page.url().replace(/\/print$/, '');

  const markPage = async (name, files, onePupil = false) => {
    await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
    await click(page.getByRole('radio', { name: /Exercise book page/ }));
    await type(page.getByLabel('Student name or number'), name);
    if (onePupil) await click(page.getByRole('checkbox', { name: /pages of one student/i }));
    await upload(/Choose photos|Photograph the page/, files);
    await waitAI(`${name}-marked`, page.getByText(/^Total:/), 600_000);
    await pause(1200);
  };

  mark('script-2');
  await markPage('Script 2', S('waec-handwritten/script-2.png'));
  for (let i = 0; i < 9; i++) await scrollBy(380);
  await pause(1500);
  const comment = page.getByLabel('Teacher’s comment');
  if (await comment.count()) { await type(comment, 'Check your formulas: v = fλ multiplies.'); await click(page.getByRole('button', { name: 'Save comment' })); await pause(1500); }

  mark('script-3-sideways');
  await markPage('Script 3', S('waec-handwritten/script-3.png'));
  for (let i = 0; i < 4; i++) await scrollBy(450);

  mark('script-4-two-pages');
  await markPage('Script 4', [S('waec-handwritten/script-4-page-1.png'), S('waec-handwritten/script-4-page-2.png')], true);
  for (let i = 0; i < 4; i++) await scrollBy(450);

  mark('offline');
  await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
  await click(page.getByRole('radio', { name: /Exercise book page/ }));
  await ctx.setOffline(true); await pause(1500);
  await type(page.getByLabel('Student name or number'), 'Script 1');
  await upload(/Choose photos|Photograph the page/, S('waec-handwritten/script-1.png'));
  await page.getByText(/Saved for marking: Script 1/).waitFor({ timeout: 30_000 }); await pause(3000);
  await ctx.setOffline(false);
  await waitAI('offline-marked', page.getByText(/^Marked: Script 1/), 600_000);
  await pause(2000);

  mark('review');
  await page.goto(`${base}/review`); await pause(2500);
  for (let i = 0; i < 4; i++) await scrollBy(400);

  mark('register');
  await page.goto(`${base}/register`); await page.getByRole('button', { name: /Download Excel/ }).waitFor({ timeout: 60_000 }); await pause(1500);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }).catch(() => null), click(page.getByRole('button', { name: /Download Excel/ }))]);
  if (dl) await dl.saveAs(`${OUT}/register.xlsx`);
  await pause(1500);

  mark('key-edit');
  await page.goto(`${base}/key`); await page.getByRole('button', { name: 'Save answer key' }).waitFor({ timeout: 30_000 });
  await scrollBy(300);
  const letters = page.getByLabel('Correct letter(s)').nth(1);
  await click(letters); await letters.fill(''); await letters.pressSequentially('C, B', { delay: 80 });
  await click(page.getByRole('button', { name: 'Save answer key' }));
  await page.getByText(/^Answer key saved\./).waitFor({ timeout: 30_000 }); await pause(3000);

  mark('insights');
  await page.goto(`${base}/insights`); await page.getByText(/average/).first().waitFor({ timeout: 60_000 }); await pause(1500);
  const catchUp = page.getByRole('button', { name: 'Catch-up sheet' }).and(page.locator(':not([disabled])')).first();
  if (await catchUp.count()) { await click(catchUp); await waitAI('catch-up', page.getByText('Let’s fix this together'), 180_000); for (let i = 0; i < 3; i++) await scrollBy(400); }

  mark('printed-sheet');
  await page.goto(URL_); await page.getByText('Try it with a sample').waitFor();
  await click(page.locator('#samples button', { hasText: 'English' }));
  await page.waitForURL(/\/print$/, { timeout: 60_000 }); await pause(2500);
  await page.goto(page.url().replace(/\/print$/, '/mark')); await page.getByText('Photograph answer sheet').waitFor();
  await type(page.getByLabel('Student name or number'), 'Ada O.');
  await upload(/Photograph answer sheet|Choose photos/, S('english-sheet-photo.jpg'));
  await waitAI('sheet-marked', page.getByText(/^Total:/), 300_000);
  for (let i = 0; i < 6; i++) await scrollBy(420);

  mark('private-mode');
  await page.goto(`${URL_}/school`); await page.getByLabel('Institution name').waitFor();
  for (let i = 0; i < 3; i++) await scrollBy(400);
  await click(page.getByRole('checkbox', { name: /Private mode/ }));
  await pause(2500);
  await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
  await click(page.getByRole('radio', { name: /Exercise book page/ }));
  await type(page.getByLabel('Student name or number'), 'Private check');
  await upload(/Choose photos|Photograph the page/, S('waec-handwritten/script-2.png'));
  await page.getByText(/Private mode is on and Gemini Nano is not ready/).waitFor({ timeout: 30_000 }); await pause(4000);
  await page.goto(`${URL_}/school`); await page.getByRole('checkbox', { name: /Private mode/ }).uncheck();
  mark('end');
} catch (e) {
  mark(`ERROR ${String(e?.message ?? e).slice(0, 160)}`, 'error');
  await page.screenshot({ path: `${OUT}/capture-error.png` }).catch(() => {});
} finally {
  save();
  const video = page.video();
  await ctx.close(); await browser.close();
  if (video) { const p = await video.path(); renameSync(p, `${OUT}/web-full.webm`); console.log('video', `${OUT}/web-full.webm`); }
}

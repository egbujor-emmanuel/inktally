// Repeatability on the live site (reviewer A2): Quick mark on samples/maths.png N times, and saving an assignment
// from the teacher's own marking scheme (typed and photographed) — the path that used to crash.
// Usage: REDPEN_CODE=... node e2e/repeatability.mjs [url] [runs]   -> writes e2e/out/repeatability.json
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://inktally.web.app';
const RUNS = Number(process.argv[3] ?? 5);
// argv[4]: comma-separated own-scheme cases, e.g. typed,photo
const SAMPLES = resolve(import.meta.dirname, '../../samples');
const OUT = resolve(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
await page.goto(URL_);
if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE ?? ''); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });

const result = { at: new Date().toISOString(), site: URL_, quickMark: [], ownScheme: [] };

for (let i = 0; i < RUNS; i++) {
  const started = Date.now();
  try {
    await page.goto(`${URL_}/quick`);
    await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/maths.png`);
    await page.getByText('Does this answer key look right?').waitFor({ timeout: 120_000 });
    const keyQuestions = await page.getByLabel('Question').count().catch(() => null);
    await page.getByRole('button', { name: /Looks right/ }).click();
    await page.getByText(/^Total:/).waitFor({ timeout: 120_000 });
    const total = (await page.getByText(/^Total:/).innerText()).trim();
    const rows = await page.$$eval('ol > li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ').slice(0, 140)));
    result.quickMark.push({ run: i + 1, total, keyQuestions, seconds: Math.round((Date.now() - started) / 1000), rows });
    console.log(`quick mark ${i + 1}: ${total} (${Math.round((Date.now() - started) / 1000)} s)`);
  } catch (e) {
    result.quickMark.push({ run: i + 1, error: String(e.message).slice(0, 200) });
    console.log(`quick mark ${i + 1}: FAILED ${String(e.message).slice(0, 120)}`);
  }
}

async function ownScheme(kind) {
  await page.goto(`${URL_}/new`);
  await page.getByLabel('Title').fill(`Own scheme (${kind})`);
  if (kind === 'typed') {
    await page.getByLabel('…or type / paste your marking scheme').fill('1. B (1 mark)\n2. D (1 mark)\n3. A (1 mark)\n4. Abuja — accept FCT (1 mark)\n5. ran — do not accept runned (2 marks)');
  } else {
    await page.locator('input[type=file][accept*="image"]').last().setInputFiles(`${SAMPLES}/english-marking-scheme.jpg`);
  }
  await page.getByRole('button', { name: 'Use my marking scheme' }).click();
  await page.getByRole('button', { name: 'Save and print answer sheets' }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Save and print answer sheets' }).click();
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  return page.url();
}
for (const kind of (process.argv[4] ?? 'typed,typed,photo,photo').split(',')) {
  try {
    const url = await ownScheme(kind);
    result.ownScheme.push({ kind, saved: true, url });
    console.log(`own scheme (${kind}): saved`);
  } catch (e) {
    const alert = await page.locator('[role=alert]').allInnerTexts().catch(() => []);
    result.ownScheme.push({ kind, saved: false, error: String(e.message).slice(0, 160), alert });
    console.log(`own scheme (${kind}): FAILED ${alert.join(' / ') || String(e.message).slice(0, 120)}`);
  }
}

writeFileSync(`${OUT}/repeatability.json`, JSON.stringify(result, null, 2));
await browser.close();

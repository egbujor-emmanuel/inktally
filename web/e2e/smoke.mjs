// Live watch: marks the sample pages on the live site and fails loudly if InkTally does not give the true scores.
// Run by .github/workflows/live-watch.yml every 6 hours (GitHub emails the repo owner when it fails).
// Usage: [REDPEN_CODE=...] node e2e/smoke.mjs [url]
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://inktally.web.app';
const SAMPLES = resolve(import.meta.dirname, '../../samples');
const checks = [];
const check = async (name, fn) => {
  const started = Date.now();
  try { const detail = await fn(); checks.push({ name, ok: true, detail, s: Math.round((Date.now() - started) / 1000) }); }
  catch (e) { checks.push({ name, ok: false, detail: String(e.message).slice(0, 240), s: Math.round((Date.now() - started) / 1000) }); }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();

await check('site opens', async () => {
  const res = await page.goto(URL_, { waitUntil: 'load' });
  if (!res?.ok()) throw new Error(`HTTP ${res?.status()}`);
  if (await page.getByText('InkTally preview').count()) {
    if (!process.env.REDPEN_CODE) { console.log('NOTICE: preview gate is on and no REDPEN_CODE is set; skipping the marking checks.'); await browser.close(); process.exit(0); }
    await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]');
  }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  return 'home loaded';
});

await check('Quick mark gives the true score (maths.png → 4/6)', async () => {
  await page.goto(`${URL_}/quick`);
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByText('Does this answer key look right?').waitFor({ timeout: 180_000 });
  await page.getByRole('button', { name: /Looks right/ }).click();
  await page.getByText(/^Total:/).waitFor({ timeout: 180_000 });
  const total = await page.getByText(/^Total:/).innerText();
  if (!/4\s*\/\s*6/.test(total)) throw new Error(`got "${total}"`);
  return total;
});

await check('printed sheet gives the true score (english-sheet-photo.jpg → 3/5)', async () => {
  await page.goto(URL_); await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  await page.locator('#samples button', { hasText: 'English' }).click();
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  await page.goto(page.url().replace(/\/print$/, '/mark'));
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
  await page.getByLabel('Student name or number').fill('Live watch');
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText(/^Total:/).waitFor({ timeout: 180_000 });
  const total = await page.getByText(/^Total:/).innerText();
  if (!/3\s*\/\s*5/.test(total)) throw new Error(`got "${total}"`);
  return total;
});

await check('teacher guide PDF is served', async () => {
  const res = await page.request.get(`${URL_}/trial/teacher-guide.pdf`);
  if (res.status() !== 200) throw new Error(`HTTP ${res.status()}`);
  return 'HTTP 200';
});

await browser.close();
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name} (${c.s} s): ${c.detail}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);

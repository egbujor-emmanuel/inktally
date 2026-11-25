// Live check of Private mode on the deployed site, in headless Chrome (which has no Gemini Nano: the hardest case, where
// a hybrid SDK could fall back to the cloud). Turns Private mode on, then:
//   1. marks a printed sheet photo: it must be saved for on-device marking, not read in the cloud;
//   2. asks Quick mark to draft a key from a pupil's page: it must be refused with the Private mode message;
//   3. drafts a key from the teacher's own typed guide: that may reach the cloud (teacher material only).
// Every request to a Gemini endpoint is recorded; any one carrying pupil work (an image, or no teacher-material tag) fails.
// Usage: REDPEN_CODE=... node e2e/privacy-check.mjs [url]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ = process.argv[2] ?? 'https://redpen-hybrid.web.app';
const SAMPLES = resolve(import.meta.dirname, '../../samples');
const OUT = resolve(import.meta.dirname, 'out');
const TAG = 'Source: the teacher’s own question paper or marking guide. No pupil work is included.';
const AI = /(firebasevertexai|generativelanguage|aiplatform)\.googleapis\.com/;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const sent = [];
page.on('request', (r) => {
  if (!AI.test(r.url())) return;
  const body = r.postData() ?? '';
  sent.push({ url: r.url().replace(/\?.*/, ''), image: /inlineData/.test(body), teacherMaterial: body.includes(TAG) });
});
const steps = [];
const step = async (name, fn) => {
  try { steps.push({ name, ok: true, detail: await fn() }); } catch (e) { steps.push({ name, ok: false, detail: String(e?.message ?? e).slice(0, 300) }); }
  console.log(`${steps.at(-1).ok ? 'PASS' : 'FAIL'} ${name}: ${steps.at(-1).detail}`);
};

await page.goto(URL_, { timeout: 120_000 });
if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE ?? ''); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 120_000 });

await step('Private mode switched on in School details', async () => {
  await page.goto(`${URL_}/school`, { timeout: 120_000 });
  await page.getByRole('checkbox', { name: /Private mode/ }).check();
  await page.getByText('Private: pupils’ work stays here').first().waitFor({ timeout: 10_000 });
  return 'status bar shows "Private: pupils’ work stays here"';
});

await step('a printed sheet photo is saved for on-device marking, not read in the cloud', async () => {
  await page.goto(URL_, { timeout: 120_000 }); await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  await page.locator('#samples button', { hasText: 'English' }).click();
  await page.waitForURL(/\/print$/, { timeout: 60_000 });
  await page.goto(page.url().replace(/\/print$/, '/mark'));
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
  await page.getByLabel('Student name or number').fill('Private check');
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText(/Private mode is on and Gemini Nano is not ready/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(8_000); // give any stray request time to show up
  return 'shown: "Saved for marking … Nothing is sent to the cloud."';
});

await step('Quick mark refuses to send a pupil’s page to the cloud to draft a key', async () => {
  await page.goto(`${URL_}/quick`, { timeout: 120_000 });
  await page.locator('input[type=file]').first().setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByText(/Private mode is on/).first().waitFor({ timeout: 60_000 });
  return (await page.getByText(/Private mode is on/).first().innerText()).slice(0, 140);
});

await step('a key drafted from the teacher’s own typed guide may still use the cloud', async () => {
  await page.goto(`${URL_}/new`, { timeout: 120_000 });
  await page.getByLabel('Title').fill('Private mode: teacher guide');
  await page.getByLabel('…or type / paste your marking scheme').fill('1. B\n2. C\n3. Abuja');
  await page.getByRole('button', { name: 'Use my marking scheme' }).click();
  const ok = await page.getByRole('button', { name: 'Save and print answer sheets' }).waitFor({ timeout: 240_000 }).then(() => true, () => false);
  if (!ok) throw new Error(`no key: ${(await page.locator('[role=alert]').allInnerTexts()).join(' | ') || 'nothing shown'}`);
  return 'answer key drafted';
});

await step('no request carrying pupil work reached any Gemini endpoint', async () => {
  const pupil = sent.filter((r) => r.image || !r.teacherMaterial);
  if (pupil.length) throw new Error(`${pupil.length} pupil request(s) sent: ${JSON.stringify(pupil.slice(0, 3))}`);
  return `${sent.length} Gemini request(s), all teacher material, none with an image`;
});

// Leave the browser profile as it was.
await page.goto(`${URL_}/school`).then(() => page.getByRole('checkbox', { name: /Private mode/ }).uncheck()).catch(() => {});
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/privacy-check.json`, JSON.stringify({ at: new Date().toISOString(), site: URL_, steps, geminiRequests: sent }, null, 2));
const passed = steps.filter((s) => s.ok).length;
console.log(`\n${passed}/${steps.length} Private mode checks passed`);
await browser.close();
process.exit(passed === steps.length ? 0 : 1);

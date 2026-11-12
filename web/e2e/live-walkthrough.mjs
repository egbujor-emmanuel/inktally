// Full click-through of the LIVE site, the way a teacher uses it. Every step reports PASS/FAIL with the error.
// Usage: REDPEN_CODE=... node e2e/live-walkthrough.mjs [url] [--mobile]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://redpen-hybrid.web.app';
const MOBILE = process.argv.includes('--mobile');
const CODE = process.env.REDPEN_CODE ?? '';
const SAMPLES = resolve('../samples');
const OUT = resolve('e2e/out'); mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const failedRequests = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => failedRequests.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) failedRequests.push(`${r.status()} ${r.url().slice(0, 140)}`); });

async function step(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t, detail: detail ?? '' });
    console.log(`PASS ${name} (${Date.now() - t} ms) ${detail ?? ''}`);
  } catch (e) {
    const alerts = await page.locator('[role=alert]').allInnerTexts().catch(() => []);
    results.push({ name, ok: false, ms: Date.now() - t, detail: `${e.message.split('\n')[0]} | alerts: ${alerts.join(' / ')}` });
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]} | alerts: ${alerts.join(' / ')}`);
    await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
  }
}
const alertText = async () => (await page.locator('[role=alert]').allInnerTexts()).join(' / ');
const base = () => page.url().replace(/\/(print|mark|review|register|insights)$/, '');

await step('open site + passcode', async () => {
  await page.goto(URL_, { waitUntil: 'load' });
  if (await page.getByText('REDPEN preview').count()) { await page.fill('input', CODE); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  return await page.locator('[role=status]').first().innerText();
});

await step('new assignment: draft scheme from TYPED questions', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByText('Draft the marking scheme').waitFor();
  await page.getByLabel('Title').fill('Walkthrough typed');
  await page.getByLabel('Class', { exact: true }).fill('Grade 6');
  await page.getByLabel('Subject').fill('Science');
  await page.getByPlaceholder(/1\. 7 × 8/).fill('1. What is 7 x 8?\n2. State two functions of blood. (2 marks)\n3. The capital of Nigeria is ____\n4. Which is a mammal? (A) shark (B) whale (C) trout (D) eel');
  await page.getByRole('button', { name: 'Draft marking scheme' }).click();
  await page.locator('fieldset').first().waitFor({ timeout: 90_000 });
  const n = await page.locator('fieldset').count();
  const alerts = await alertText(); if (alerts) throw new Error(alerts);
  return `${n} questions drafted`;
});

await step('new assignment: save -> print sheet', async () => {
  await page.getByRole('button', { name: 'Save and print answer sheets' }).click();
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  await page.locator('svg.sheet-page').first().waitFor();
  return `${await page.locator('svg.sheet-page').count()} sheet page(s)`;
});

await step('new assignment: draft scheme from PHOTO of a page', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByText('Draft the marking scheme').waitFor();
  await page.locator('input[type=file]').setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByRole('button', { name: 'Draft marking scheme' }).click();
  await page.locator('fieldset').first().waitFor({ timeout: 90_000 });
  return `${await page.locator('fieldset').count()} questions from photo`;
});

await step('quick mark: photo -> key -> marked', async () => {
  await page.goto(`${URL_}/quick`);
  await page.locator('input[type=file]').setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByText('Does this answer key look right?').waitFor({ timeout: 90_000 });
  await page.getByRole('button', { name: /Looks right/ }).click();
  await page.getByText(/^Total:/).waitFor({ timeout: 90_000 });
  return await page.getByText(/^Total:/).innerText();
});

await step('sample English -> mark printed sheet photo', async () => {
  await page.goto(URL_); await page.getByText('Try it with a sample').waitFor();
  await page.locator('#samples button', { hasText: 'English' }).click();
  await page.waitForURL(/\/print$/);
  await page.goto(`${base()}/mark`);
  await page.getByText('Photograph answer sheet').waitFor();
  await page.getByLabel('Pupil name or number').fill('Walkthrough Pupil');
  await page.locator('input[type=file]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText(/^Total:/).waitFor({ timeout: 120_000 });
  const total = await page.getByText(/^Total:/).innerText();
  await page.getByText('Marked copy for').waitFor({ timeout: 30_000 });
  return `${total} + marked copy`;
});

await step('exercise-book mode on the same assignment', async () => {
  await page.getByRole('radio', { name: /Exercise book page/ }).click();
  await page.locator('input[type=file]').setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByText(/^Total:/).waitFor({ timeout: 120_000 });
  return await page.getByText(/^Total:/).innerText();
});

await step('review tab', async () => {
  await page.goto(`${base()}/review`);
  await page.getByText(/to check|All marks are verified/).first().waitFor({ timeout: 30_000 });
  return (await page.locator('main').innerText()).split('\n').find((l) => /to check|verified/.test(l));
});

await step('mark register + Excel download', async () => {
  await page.goto(`${base()}/register`);
  await page.getByRole('button', { name: /Export to Excel/ }).waitFor({ timeout: 30_000 });
  const rows = await page.locator('tbody tr').count();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: /Export to Excel/ }).click()]);
  return `${rows} rows, downloaded ${download.suggestedFilename()}`;
});

await step('insights + catch-up sheet', async () => {
  await page.goto(`${base()}/insights`);
  await page.getByText(/average/).first().waitFor({ timeout: 30_000 });
  const btn = page.getByRole('button', { name: 'Catch-up sheet' }).and(page.locator(':not([disabled])')).first();
  await btn.click();
  await page.getByText('Let’s fix this together').waitFor({ timeout: 90_000 });
  return 'catch-up generated';
});

await step('finish + reopen', async () => {
  await page.goto(`${base()}/mark`);
  await page.getByRole('button', { name: 'Mark as finished' }).click();
  await page.getByRole('button', { name: 'Reopen' }).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Reopen' }).click();
  await page.getByRole('button', { name: 'Mark as finished' }).waitFor({ timeout: 10_000 });
});

await step('delete assignment', async () => {
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20_000 });
});

await browser.close();
console.log('\n==== SUMMARY', MOBILE ? '(mobile)' : '(desktop)');
console.log(`${results.filter((r) => r.ok).length}/${results.length} steps passed`);
results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL ${r.name}: ${r.detail}`));
console.log('console errors:', [...new Set(consoleErrors)].slice(0, 12));
console.log('failed requests:', [...new Set(failedRequests)].slice(0, 12));

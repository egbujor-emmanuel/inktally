// Full click-through of the LIVE site, the way a teacher uses it. Every step reports PASS/FAIL with the error.
// Usage: REDPEN_CODE=... node e2e/live-walkthrough.mjs [url] [--mobile]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';

const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://inktally.web.app';
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
const base = () => page.url().replace(/\/(print|key|mark|review|register|insights)$/, '');
/** Polls a predicate with page.evaluate (the site's CSP blocks Playwright's in-page waitForFunction polling). */
async function waitUntil(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(250); }
  throw new Error('condition not met in time');
}

await step('open site + passcode', async () => {
  await page.goto(URL_, { waitUntil: 'load' });
  if (await page.getByText('InkTally preview').count()) { await page.fill('input', CODE); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  return await page.locator('[role=status]').first().innerText();
});

const SCHOOL = 'Walkthrough Academy';
await step('school details: save institution profile', async () => {
  await page.goto(`${URL_}/school`);
  await page.getByLabel('Institution name').fill(SCHOOL);
  await page.getByLabel(/Details under the name/).fill('12 Test Road, Lagos · First Term');
  await page.getByLabel(/Teacher or examiner name/).fill('Mrs Tester');
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText(/^Saved/).waitFor({ timeout: 10_000 });
  await page.reload(); await page.getByLabel('Institution name').waitFor();
  await waitUntil((v) => document.querySelector('input')?.value === v, SCHOOL);
  return 'saved + survived reload';
});

await step('new assignment: draft scheme from TYPED questions', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByRole('heading', { name: 'The question paper' }).waitFor();
  await page.getByLabel('Title').fill('Walkthrough typed');
  await page.getByLabel('Class / group').fill('Grade 6');
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
  const header = await page.locator('svg.sheet-page').first().textContent();
  if (!header.includes(SCHOOL.toUpperCase())) throw new Error('institution name missing from the printed sheet');
  return `${await page.locator('svg.sheet-page').count()} sheet page(s) with institution header`;
});

await step('new assignment: draft scheme from PHOTO of a page', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByRole('heading', { name: 'The question paper' }).waitFor();
  await page.locator('input[aria-label="Question paper: photos"]').setInputFiles(`${SAMPLES}/maths.png`);
  await page.getByRole('button', { name: 'Draft marking scheme' }).click();
  await page.locator('fieldset').first().waitFor({ timeout: 90_000 });
  return `${await page.locator('fieldset').count()} questions from photo`;
});

await step('new assignment: COPY teacher marking scheme from a PHOTO', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByRole('heading', { name: 'The question paper' }).waitFor();
  await page.locator('input[aria-label="Marking scheme: photos"]').setInputFiles(`${SAMPLES}/english-marking-scheme.jpg`);
  await page.getByRole('button', { name: 'Use my marking scheme' }).click();
  await page.locator('fieldset').first().waitFor({ timeout: 90_000 });
  const values = await page.locator('fieldset input, fieldset textarea').evaluateAll((els) => els.map((e) => e.value).join(' | '));
  for (const want of [/F\.?C\.?T/i, /runned/i]) if (!want.test(values)) throw new Error(`scheme copy missing ${want}: ${values.slice(0, 300)}`);
  const marks = await page.locator('fieldset input[type=number]').evaluateAll((els) => els.map((e) => e.value));
  if (marks[4] !== '2') throw new Error(`Q5 should keep the teacher's 2 marks, got ${marks.join(',')}`);
  return `${marks.length} questions copied; F.C.T. accepted, "runned" rejected, Q5 = 2 marks`;
});

await step('new assignment: COPY teacher marking scheme TYPED (no question paper)', async () => {
  await page.goto(`${URL_}/new`);
  await page.getByRole('heading', { name: 'The question paper' }).waitFor();
  await page.getByPlaceholder(/1\. 56 \(1 mark\)/).fill('1. 56 (1 mark)\n2. Abuja — accept FCT or Federal Capital Territory (1 mark)\n3. went — do not accept goed (2 marks)');
  await page.getByRole('button', { name: 'Use my marking scheme' }).click();
  await page.locator('fieldset').first().waitFor({ timeout: 90_000 });
  const values = await page.locator('fieldset input, fieldset textarea').evaluateAll((els) => els.map((e) => e.value).join(' | '));
  for (const want of [/Federal Capital Territory/i, /goed/i, /went/i]) if (!want.test(values)) throw new Error(`typed scheme missing ${want}: ${values.slice(0, 300)}`);
  return `${await page.locator('fieldset').count()} questions copied exactly`;
});

await step('quick mark: photo -> key -> marked', async () => {
  await page.goto(`${URL_}/quick`);
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/maths.png`);
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
  await page.getByLabel('Student name or number').fill('Walkthrough Pupil');
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText(/^Total:/).waitFor({ timeout: 120_000 });
  const total = await page.getByText(/^Total:/).innerText();
  await page.getByText('Marked copy for').waitFor({ timeout: 30_000 });
  return `${total} + marked copy`;
});

await step('comment after marking -> on the marked copy', async () => {
  const box = page.getByLabel('Teacher’s comment');
  await box.fill('Good work. Revise past tenses before Friday.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByText(/^Saved\. It is on the marked copy/).waitFor({ timeout: 10_000 });
  // The letterhead copy is taller than the bare copy (header + comment footer).
  await waitUntil(() => { const i = document.querySelector('img[alt^="Marked copy"]'); return Boolean(i && i.naturalHeight > i.naturalWidth * 1.45); }, null);
  return 'comment saved, copy re-rendered with letterhead + comment';
});

await step('exercise-book mode on the same assignment', async () => {
  // Whole-page reading (no corner squares used) of the same student's page must give the same true score.
  await page.getByRole('radio', { name: /Exercise book page/ }).click();
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText(/^Total:/).waitFor({ timeout: 120_000 });
  const total = await page.getByText(/^Total:/).innerText();
  if (!/3\s*\/\s*5/.test(total)) throw new Error(`expected the true score 3/5, got "${total}"`);
  return total;
});

await step('answer key: edit after marking -> everyone re-marked from stored readings', async () => {
  // Q3's key is A; both students so far wrote B. Accepting B as well must raise both, with no new photos.
  await page.goto(`${base()}/key`);
  await page.getByRole('button', { name: 'Save answer key' }).waitFor({ timeout: 30_000 });
  await page.getByLabel('Correct letter(s)').nth(2).fill('A, B');
  await page.getByRole('button', { name: 'Save answer key' }).click();
  const notice = page.getByText(/^Answer key saved\./);
  await notice.waitFor({ timeout: 20_000 });
  const text = await notice.innerText();
  if (!/Re-marked 2 students: 2 answers went up/.test(text)) throw new Error(`unexpected re-mark result: "${text}"`);
  return text;
});

await step('OFFLINE without on-device AI: queued, then marked automatically back online', async () => {
  await page.goto(`${base()}/mark`);
  await page.getByText('Photograph answer sheet').waitFor();
  await ctx.setOffline(true);
  await page.getByLabel('Student name or number').fill('Offline Student');
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(`${SAMPLES}/english-sheet-photo.jpg`);
  await page.getByText('Saved for marking: Offline Student').waitFor({ timeout: 20_000 });
  await page.getByText(/1 waiting to be marked/).waitFor({ timeout: 20_000 });
  await ctx.setOffline(false);
  // Locator polling (no string eval, so it works under the site's Content-Security-Policy).
  await page.getByText(/waiting to be marked/).first().waitFor({ state: 'detached', timeout: 180_000 });
  await page.goto(`${base()}/register`);
  await page.getByRole('button', { name: /Download Excel/ }).waitFor({ timeout: 30_000 });
  // Names sit in editable inputs, so read input values as well as cell text.
  const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) =>
    [...tr.querySelectorAll('input,textarea')].map((i) => i.value).join(' ') + ' ' + tr.innerText));
  const row = rows.find((t) => t.includes('Offline Student')) ?? '';
  // The answer-key step above now also accepts B for Q3, so this student's true score is 4/5.
  if (!/\b4\b/.test(row)) throw new Error(`queued student should total 4/5 once marked, row: ${row.replace(/\s+/g, ' ')}`);
  return 'saved offline, marked automatically on reconnect: 4/5 (under the edited key)';
});

await step('review tab', async () => {
  await page.goto(`${base()}/review`);
  await page.getByText(/to check|Nothing to check/).first().waitFor({ timeout: 30_000 });
  return (await page.locator('main').innerText()).split('\n').find((l) => /to check|verified/.test(l));
});

await step('mark register + Excel download', async () => {
  await page.goto(`${base()}/register`);
  await page.getByRole('button', { name: /Download Excel/ }).waitFor({ timeout: 30_000 });
  const rows = await page.locator('tbody tr').count();
  await page.getByLabel(/^Student name for Walkthrough Pupil/).first().click();
  await page.getByRole('dialog').getByLabel('Name or number').fill('Ada Renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByLabel(/^Student name for Ada Renamed/).waitFor({ timeout: 10_000 });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: /Download Excel/ }).click()]);
  const file = `${OUT}/${download.suggestedFilename()}`; await download.saveAs(file);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(readFileSync(file));
  const text = []; wb.worksheets[0].eachRow((r) => text.push(r.values.filter(Boolean).join(' | ')));
  const all = text.join(String.fromCharCode(10));
  for (const want of [SCHOOL, 'Mrs Tester', 'Ada Renamed', 'Revise past tenses']) if (!all.includes(want)) throw new Error(`xlsx missing "${want}"`);
  return `${rows} rows; ${download.suggestedFilename()} has letterhead, renamed student, comment`;
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
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20_000 });
});

await browser.close();
console.log('\n==== SUMMARY', MOBILE ? '(mobile)' : '(desktop)');
console.log(`${results.filter((r) => r.ok).length}/${results.length} steps passed`);
results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL ${r.name}: ${r.detail}`));
console.log('console errors:', [...new Set(consoleErrors)].slice(0, 12));
console.log('failed requests:', [...new Set(failedRequests)].slice(0, 12));

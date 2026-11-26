// Cold offline start of the LIVE site: visit once online, close the tab, then open InkTally again with NO connection.
// Proves the service worker serves the whole app offline, Firestore's cache shows the teacher's work, a stack of
// photos can be added offline, and the queue marks them automatically when the connection returns.
// Usage: REDPEN_CODE=... node e2e/offline-coldstart.mjs [url]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://inktally.web.app';
const CODE = process.env.REDPEN_CODE ?? '';
const SAMPLES = resolve('../samples');
const OUT = resolve('e2e/out/offline'); mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
let page = await ctx.newPage();

async function step(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t, detail: detail ?? '' });
    console.log(`PASS ${name} (${Date.now() - t} ms) ${detail ?? ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, detail: e.message.split('\n')[0] });
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
  }
}

let assignmentUrl = '';
await step('first visit online: app installs its offline copy', async () => {
  await page.goto(URL_, { waitUntil: 'load' });
  if (await page.getByText('InkTally preview').count()) { await page.fill('input', CODE); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  const controlled = await page.evaluate(async () => { await navigator.serviceWorker.ready; return true; });
  // Visit every screen once so route chunks are in the browser too (they are precached anyway).
  await page.locator('#samples button', { hasText: 'English' }).click();
  await page.waitForURL(/\/a\/[^/]+\/print$/, { timeout: 60_000 });
  assignmentUrl = page.url().replace(/\/print$/, '/mark');
  await page.goto(assignmentUrl);
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
  return `service worker ready: ${controlled}; sample assignment ${assignmentUrl.split('/a/')[1]}`;
});

await step('close the tab, go offline, open InkTally again (cold start)', async () => {
  await page.close();
  await ctx.setOffline(true);
  page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'load', timeout: 30_000 });
  await page.getByText('Try it with a sample').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/01-cold-start-offline.png` });
  const status = await page.locator('[role=status]').first().innerText();
  if (!/offline/i.test(status)) throw new Error(`status strip should say offline, got: ${status}`);
  return `home loaded with no connection; status: ${status.replace(/\s+/g, ' ')}`;
});

await step('offline: open the assignment from the cache', async () => {
  await page.goto(assignmentUrl, { waitUntil: 'load' });
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 30_000 });
  return 'assignment and Mark tab shown offline';
});

await step('offline: add a stack of 3 scripts at once', async () => {
  const photo = `${SAMPLES}/english-sheet-photo.jpg`;
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles([photo, photo, photo]);
  await page.getByText('3 scripts added').waitFor({ timeout: 30_000 });
  await page.getByText(/3 waiting to be marked/).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/02-stack-queued-offline.png`, fullPage: true });
  return 'saved on this device as Student 1-3, waiting for a connection';
});

await step('back online: the queue marks the whole stack automatically', async () => {
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText(/waiting to be marked/).first().waitFor({ state: 'detached', timeout: 300_000 });
  await page.goto(assignmentUrl.replace(/\/mark$/, '/register'));
  await page.getByRole('button', { name: /Download Excel/ }).waitFor({ timeout: 30_000 });
  const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) =>
    [...tr.querySelectorAll('input,textarea')].map((i) => i.value).join(' ') + ' ' + tr.innerText));
  const stack = rows.filter((t) => /Student [123]\b/.test(t));
  if (stack.length !== 3) throw new Error(`expected 3 stack rows, got ${stack.length}: ${rows.join(' | ')}`);
  if (!stack.every((t) => /\b3\b/.test(t))) throw new Error(`each script should total 3/5: ${stack.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/03-stack-marked.png`, fullPage: true });
  return '3/3 scripts marked 3/5 after reconnect';
});

await step('clean up: delete the test assignment', async () => {
  await page.goto(assignmentUrl);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/a/'), { timeout: 30_000 });
  return 'deleted';
});

await browser.close();
writeFileSync(`${OUT}/result.json`, JSON.stringify({ url: URL_, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

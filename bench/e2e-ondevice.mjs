// End-to-end hybrid test of the LIVE InkTally site in real Chrome with Gemini Nano:
// enable on-device AI -> go offline -> mark a printed sheet on-device -> back online -> automatic cloud check.
// Usage (in the Codespace, under run.sh for screen recording): REDPEN_CODE=... node e2e-ondevice.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = process.env.REDPEN_URL || 'https://inktally.web.app';
const CODE = process.env.REDPEN_CODE;
const PHOTO = process.env.REDPEN_PHOTO || 'samples/english-sheet-photo.jpg';
const PROFILE = process.env.CHROME_PROFILE || '/tmp/chrome-profile';
const OUT = 'out';
if (!CODE) throw new Error('Set REDPEN_CODE');
mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });
const localState = join(PROFILE, 'Local State');
const state = existsSync(localState) ? JSON.parse(readFileSync(localState, 'utf8')) : {};
writeFileSync(localState, JSON.stringify({ ...state, internal_only_uis_enabled: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const chrome = spawn('google-chrome', [
  `--user-data-dir=${PROFILE}`, '--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check',
  '--window-size=1280,800', '--window-position=0,0',
  '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput',
  ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), 'about:blank',
], { stdio: 'ignore' });

let browser;
for (let i = 0; i < 30 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch { await sleep(1000); } }
if (!browser) throw new Error('Chrome did not start');
const context = browser.contexts()[0];
const page = context.pages()[0];
const cdp = await context.newCDPSession(page);
const shot = (name) => page.screenshot({ path: `${OUT}/e2e-${name}.png`, fullPage: true });
const setOffline = (offline) => cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const rows = () => page.$$eval('ol > li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ').slice(0, 160)));

try {
  // Always test the build that is live now: drop any cached app from an earlier run (Gemini Nano itself is kept).
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(SITE).origin, storageTypes: 'service_workers,cache_storage' });
  await page.goto(SITE, { waitUntil: 'load' });
  if (await page.locator('text=InkTally preview').count()) {
    await page.fill('input', CODE);
    await page.click('button[type=submit]');
  }
  await page.waitForSelector('text=Try it with a sample', { timeout: 60_000 });
  log('home loaded:', await page.locator('[role=status]').innerText());

  // Wait until Chrome has answered whether Gemini Nano can run here (the chip starts as "Checking…").
  await page.getByText(/Gemini Nano ready|Gemini Nano not downloaded|Downloading Gemini Nano|Cloud AI \(no on-device model\)/).first().waitFor({ timeout: 120_000 });
  log('Nano status resolved:', await page.locator('[role=status]').first().innerText());
  if (await page.getByText('Cloud AI (no on-device model)').count()) throw new Error('Chrome reports Gemini Nano unavailable on this machine');
  const enable = page.locator('button:has-text("Download on-device AI")');
  if (await enable.count()) {
    log('enabling on-device AI (model download)…');
    await enable.click();
    await page.waitForSelector('text=Gemini Nano ready', { timeout: 15 * 60_000 });
  }
  log('device status:', await page.locator('[role=status]').innerText());
  await shot('1-home');

  await page.click('#samples button:has-text("English")');
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  const base = page.url().replace(/\/print$/, '');
  // In-app navigation only (no reload): proves the download is picked up in the same session.
  await page.getByRole('link', { name: 'Mark', exact: true }).click();
  await page.waitForSelector('text=Photograph answer sheet', { timeout: 60_000 });

  log('GOING OFFLINE');
  await setOffline(true);
  await sleep(1500);
  await page.fill('input[placeholder^="e.g."]', 'Chidi Okafor');
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(PHOTO);
  // Marked on-device -> "Total:". Queued for later instead -> the on-device path did not engage: fail at once.
  await page.getByText(/^Total:|Saved for marking/).first().waitFor({ timeout: 10 * 60_000 });
  if (await page.getByText('Saved for marking').count()) throw new Error('photo was queued: on-device marking did not engage after the download');
  const offlineRows = await rows();
  log('OFFLINE MARKS:\n' + offlineRows.join('\n'));
  log('status:', await page.locator('[role=status]').innerText());
  await shot('2-offline-marked');

  log('BACK ONLINE');
  await setOffline(false);
  // The cloud check starts by itself on reconnect, on the Mark tab, with no visit to Review needed.
  await page.getByText(/^Cloud check: \d+ on-device mark/).waitFor({ timeout: 5 * 60_000 });
  log('AUTOMATIC CLOUD CHECK:', await page.getByText(/^Cloud check:/).innerText());
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await sleep(1500);
  const reviewText = await page.locator('main').innerText();
  const learned = await page.getByText('What InkTally learned').count()
    ? await page.locator('section', { hasText: 'What InkTally learned' }).innerText().catch(() => 'card shown') : 'no correction to learn from';
  log('DEVICE LEARNED:', learned);
  log('REVIEW AFTER CLOUD CHECK:\n' + reviewText.slice(0, 1500));
  await shot('3-review-after-online');

  // Learning check: mark the same sheet again offline; readings that match a misread the cloud found are held for the teacher.
  let secondRows = [];
  if (!/no correction to learn from/.test(learned)) {
    await page.getByRole('link', { name: 'Mark', exact: true }).click();
    await page.waitForSelector('text=Photograph answer sheet', { timeout: 60_000 });
    log('GOING OFFLINE AGAIN (known misreads are held)');
    await setOffline(true);
    await sleep(1500);
    await page.fill('input[placeholder^="e.g."]', 'Chidi Okafor (second marking)');
    await page.locator('input[aria-label^="Choose photo"]').setInputFiles(PHOTO);
    await page.getByText(/^Total:|Saved for marking/).first().waitFor({ timeout: 10 * 60_000 });
    secondRows = await rows();
    log('SECOND OFFLINE MARKING (held readings say "Held for checking"):' + String.fromCharCode(10) + secondRows.join(String.fromCharCode(10)));
    await shot('3b-offline-with-hints');
    await setOffline(false);
    await sleep(4000);
  }
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await sleep(2500);
  await shot('4-insights');
  writeFileSync(`${OUT}/e2e-result.json`, JSON.stringify({ at: new Date().toISOString(), site: SITE, offlineRows, reviewText, learned, secondRows }, null, 2));
  log('E2E DONE');
} catch (err) {
  log('E2E FAILED:', err.message);
  await shot('fail').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  chrome.kill('SIGTERM');
}

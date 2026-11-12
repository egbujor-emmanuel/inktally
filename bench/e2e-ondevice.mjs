// End-to-end hybrid test of the LIVE REDPEN site in real Chrome with Gemini Nano:
// enable on-device AI -> go offline -> mark a printed sheet on-device -> back online -> automatic cloud check.
// Usage (in the Codespace, under run.sh for screen recording): REDPEN_CODE=... node e2e-ondevice.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = process.env.REDPEN_URL || 'https://redpen-hybrid.web.app';
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
  await page.goto(SITE, { waitUntil: 'load' });
  if (await page.locator('text=REDPEN preview').count()) {
    await page.fill('input', CODE);
    await page.click('button[type=submit]');
  }
  await page.waitForSelector('text=Try it with a sample', { timeout: 60_000 });
  log('home loaded:', await page.locator('[role=status]').innerText());

  const enable = page.locator('button:has-text("Enable on-device AI")');
  if (await enable.count()) {
    log('enabling on-device AI (model download)…');
    await enable.click();
    await page.waitForSelector('text=On-device AI ready', { timeout: 15 * 60_000 });
  }
  log('device status:', await page.locator('[role=status]').innerText());
  await shot('1-home');

  await page.click('#samples button:has-text("English")');
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  const base = page.url().replace(/\/print$/, '');
  await page.goto(`${base}/mark`, { waitUntil: 'load' });
  await page.waitForSelector('text=Photograph answer sheet', { timeout: 60_000 });

  log('GOING OFFLINE');
  await setOffline(true);
  await sleep(1500);
  await page.fill('input[placeholder^="e.g."]', 'Chidi Okafor');
  await page.setInputFiles('input[type=file]', PHOTO);
  await page.waitForSelector('text=Total:', { timeout: 10 * 60_000 });
  const offlineRows = await rows();
  log('OFFLINE MARKS:\n' + offlineRows.join('\n'));
  log('status:', await page.locator('[role=status]').innerText());
  await shot('2-offline-marked');

  log('BACK ONLINE');
  await setOffline(false);
  await sleep(2000);
  await page.goto(`${base}/review`, { waitUntil: 'load' });
  // Wait until the automatic cloud check has started AND finished (no "Checking n/m" button, no provisional marks).
  await page.waitForFunction(() => /Checking \d+\/\d+/.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => {});
  await page.waitForFunction(() => !/Checking \d+\/\d+/.test(document.body.innerText)
    && !document.body.innerText.includes('awaiting the cloud check'), null, { timeout: 5 * 60_000, polling: 1000 });
  await sleep(1500);
  const reviewText = await page.locator('main').innerText();
  log('REVIEW AFTER CLOUD CHECK:\n' + reviewText.slice(0, 1500));
  await shot('3-review-after-online');

  await page.goto(`${base}/insights`, { waitUntil: 'load' });
  await sleep(2500);
  await shot('4-insights');
  writeFileSync(`${OUT}/e2e-result.json`, JSON.stringify({ offlineRows, reviewText }, null, 2));
  log('E2E DONE');
} catch (err) {
  log('E2E FAILED:', err.message);
  await shot('fail').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  chrome.kill('SIGTERM');
}

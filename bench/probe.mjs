// Drives real Google Chrome over CDP to test whether Gemini Nano (Prompt API)
// downloads and runs on a CPU-only GitHub Actions runner (4 vCPU / 16 GB RAM).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'out';
const PROFILE = process.env.CHROME_PROFILE || '/mnt/chrome-profile';
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const POLL_MS = 15_000;
mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

// Unlock chrome://on-device-internals (an "internal debugging page") before launch,
// so the probe can record why the model is or isn't available.
const localStatePath = join(PROFILE, 'Local State');
const localState = existsSync(localStatePath) ? JSON.parse(readFileSync(localStatePath, 'utf8')) : {};
writeFileSync(localStatePath, JSON.stringify({ ...localState, internal_only_uis_enabled: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = readFileSync('index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(8080, '127.0.0.1', r));

const chrome = spawn('google-chrome', [
  `--user-data-dir=${PROFILE}`,
  '--remote-debugging-port=9222',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,800',
  '--window-position=0,0',
  '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput',
  // Containers (Codespaces) cannot create Chrome's namespace sandbox.
  ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (d) => process.stderr.write(`[chrome] ${d}`));

let browser;
for (let i = 0; i < 30 && !browser; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch { await sleep(1000); }
}
if (!browser) throw new Error('Could not connect to Chrome over CDP');
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.newPage();
console.log('Chrome version:', browser.version());

async function snapInternals(name) {
  try {
    await page.goto('chrome://on-device-internals', { waitUntil: 'load' });
    await sleep(3000);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    writeFileSync(`${OUT}/${name}.txt`, await page.evaluate(() => document.body.innerText));
  } catch (e) { console.log('internals snapshot failed:', e.message); }
}

await snapInternals('internals-before');
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.click('#go'); // real CDP input event = user activation

const started = Date.now();
let state;
while (Date.now() - started < DOWNLOAD_TIMEOUT_MS) {
  state = await page.evaluate(() => window.__state);
  console.log(`[${Math.round((Date.now() - started) / 1000)}s] phase=${state.phase} progress=${(state.progress * 100).toFixed(1)}%`);
  if (['done', 'error', 'unavailable'].includes(state.phase)) break;
  await sleep(POLL_MS);
}
await page.screenshot({ path: `${OUT}/probe-page.png`, fullPage: true });
writeFileSync(`${OUT}/result.json`, JSON.stringify(state, null, 2));
console.log('RESULT', JSON.stringify(state.results), 'error=', state.error);

const pageForInternals = await context.newPage();
try {
  await pageForInternals.goto('chrome://on-device-internals', { waitUntil: 'load' });
  await sleep(3000);
  await pageForInternals.screenshot({ path: `${OUT}/internals-after.png`, fullPage: true });
  writeFileSync(`${OUT}/internals-after.txt`, await pageForInternals.evaluate(() => document.body.innerText));
} catch (e) { console.log('internals-after failed:', e.message); }

await browser.close().catch(() => {});
chrome.kill('SIGTERM');
server.close();
process.exit(state?.phase === 'done' ? 0 : 1);

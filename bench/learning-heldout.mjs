// Held-out evaluation of the learning loop on the LIVE site with real Gemini Nano (answers reviewer B2 / F5).
// Hints are learned from a TRAINING sheet only, then five DIFFERENT students' sheets are read on-device offline.
// Three conditions, each in a fresh copy of the English sample assignment:
//   A  control      — no hints
//   B  guard rail   — hints from one training sheet (production rule: a one-letter mix-up waits for a 2nd sighting)
//   C  no guard     — the same training sheet marked twice, so the one-letter mix-up IS used (shows the bias risk)
// Negative controls: held-out students who really wrote "A" (Q1/Q2/Q3) — a learned "A"->"D" hint must not turn them into "D".
// All sheets are synthetic (samples/make_sheet_photo.py, Caveat font), so "handwriting" here means one rendered hand.
// Usage (Codespace, under run.sh): REDPEN_CODE=... node learning-heldout.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = process.env.REDPEN_URL || 'https://inktally.web.app';
const CODE = process.env.REDPEN_CODE;
const DIR = process.env.SHEETS || 'heldout';
const PROFILE = process.env.CHROME_PROFILE || '/tmp/chrome-profile';
const OUT = 'out';
/** Which conditions to run, e.g. CONDITIONS=B (default: all three). */
const ONLY = (process.env.CONDITIONS || 'A,B,C').split(',');
if (!CODE) throw new Error('Set REDPEN_CODE');
mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });
const localState = join(PROFILE, 'Local State');
const state = existsSync(localState) ? JSON.parse(readFileSync(localState, 'utf8')) : {};
writeFileSync(localState, JSON.stringify({ ...state, internal_only_uis_enabled: true }));

/** What each student really wrote (the scheme: Q1 B, Q2 D, Q3 A, Q4 Abuja/FCT, Q5 ran — "runned" not accepted). */
const TRAIN = { file: 'english-sheet-photo.jpg', name: 'Chidi Okafor (training)', truth: ['B', 'D', 'B', 'Abuja', 'runned'] };
const HELD_OUT = [
  { file: 's2.jpg', name: 'Amaka Eze', truth: ['D', 'D', 'A', 'Abuja', 'ran'] },
  { file: 's3.jpg', name: 'Tunde Bello', truth: ['A', 'D', 'A', 'FCT', 'runned'] },
  { file: 's4.jpg', name: 'Ngozi Obi', truth: ['B', 'A', 'A', 'Abuja', 'runned'] },
  { file: 's5.jpg', name: 'Musa Danjuma', truth: ['C', 'D', 'B', 'Abuja', 'ran'] },
  { file: 's6.jpg', name: 'Femi Adeyemi', truth: ['D', 'D', 'D', 'Lagos', 'runned'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const NL = String.fromCharCode(10);

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
const setOffline = (offline) => cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const tab = (name) => page.getByRole('link', { name, exact: true }).click();

/** The device's reading of each answer, from the marked rows ("AI read: “X”"), plus the row text. */
const readRows = () => page.$$eval('ol > li', (lis) => lis.map((li) => {
  const text = li.innerText.replace(/\s+/g, ' ');
  const m = text.match(/AI read: “([^”]*)”/);
  return { read: m ? (m[1] === '—' ? '' : m[1]) : null, text: text.slice(0, 200) };
}));

async function newAssignment(label) {
  await page.goto(SITE, { waitUntil: 'load' });
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  await page.getByText('Gemini Nano ready').first().waitFor({ timeout: 120_000 });
  await page.click('#samples button:has-text("English")');
  await page.waitForURL(/\/print$/, { timeout: 30_000 });
  log(`[${label}] new assignment`, page.url());
}

/** Marks one sheet offline on-device and returns the device readings. The page must already be offline. */
async function markOne(sheet) {
  await tab('Review');
  await sleep(500);
  await tab('Mark');
  await page.waitForSelector('text=Photograph answer sheet', { timeout: 60_000 });
  await page.fill('input[placeholder^="e.g."]', sheet.name);
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(join(DIR, sheet.file));
  await page.getByText(/^Total:|Saved for marking/).first().waitFor({ timeout: 10 * 60_000 });
  if (await page.getByText('Saved for marking').count()) throw new Error(`${sheet.name}: queued — on-device marking did not engage`);
  const rows = await readRows();
  const total = await page.getByText(/^Total:/).first().innerText();
  log(`  ${sheet.name}: ${total} | device read ${rows.map((r) => JSON.stringify(r.read)).join(' ')}`);
  const held = rows.map((r) => /Held for checking/.test(r.text));
  return { name: sheet.name, truth: sheet.truth, device: rows.map((r) => r.read), held, total, rows: rows.map((r) => r.text) };
}

async function markOffline(sheets) {
  await setOffline(true);
  await sleep(1500);
  const out = [];
  for (const s of sheets) out.push(await markOne(s));
  return out;
}

/** Back online: wait for the automatic cloud check, then read what the device learned. */
async function onlineCheck(label) {
  await setOffline(false);
  await page.getByText(/^Cloud check: \d+ on-device mark/).waitFor({ timeout: 6 * 60_000 });
  const summary = await page.getByText(/^Cloud check:/).innerText();
  await tab('Review');
  await sleep(2000);
  const card = page.locator('section', { hasText: 'What InkTally learned' });
  const learned = (await card.count()) ? (await card.innerText()).replace(/\s+/g, ' ') : 'none';
  log(`[${label}] ${summary}`);
  log(`[${label}] learned: ${learned.slice(0, 400)}`);
  await page.screenshot({ path: `${OUT}/heldout-${label}-review.png`, fullPage: true });
  return { summary, learned };
}

const result = { at: new Date().toISOString(), site: SITE, conditions: {} };
try {
  // Always test the build that is live now: drop any service worker / cached app from an earlier run (Nano itself is kept).
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(SITE).origin, storageTypes: 'service_workers,cache_storage' });
  await page.goto(SITE, { waitUntil: 'load' });
  if (await page.locator('text=InkTally preview').count()) { await page.fill('input', CODE); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });
  await page.getByText(/Gemini Nano ready|Gemini Nano not downloaded|Downloading Gemini Nano|Cloud AI \(no on-device model\)/).first().waitFor({ timeout: 120_000 });
  if (await page.getByText('Cloud AI (no on-device model)').count()) throw new Error('Gemini Nano unavailable on this machine');
  const enable = page.locator('button:has-text("Download on-device AI")');
  if (await enable.count()) { log('downloading Gemini Nano…'); await enable.click(); }
  await page.getByText('Gemini Nano ready').first().waitFor({ timeout: 20 * 60_000 });
  log('Gemini Nano ready');

  if (ONLY.includes('A')) {
  await newAssignment('A-control');
  const aRead = await markOffline(HELD_OUT);
  const aCheck = await onlineCheck('A-control');
  result.conditions.A = { training: [], learned: 'none (no training sheet)', heldOut: aRead, afterCheck: aCheck.summary };
  }

  if (ONLY.includes('B')) {
  await newAssignment('B-guard');
  const bTrain = await markOffline([TRAIN]);
  const bLearn = await onlineCheck('B-guard-training');
  const bRead = await markOffline(HELD_OUT);
  const bCheck = await onlineCheck('B-guard');
  result.conditions.B = { training: bTrain, learned: bLearn.learned, trainingCheck: bLearn.summary, heldOut: bRead, afterCheck: bCheck.summary };
  }

  if (ONLY.includes('C')) {
  await newAssignment('C-noguard');
  const cTrain = await markOffline([TRAIN, { ...TRAIN, name: 'Chidi Okafor (training, 2nd copy)' }]);
  const cLearn = await onlineCheck('C-noguard-training');
  const cRead = await markOffline(HELD_OUT);
  const cCheck = await onlineCheck('C-noguard');
  result.conditions.C = { training: cTrain, learned: cLearn.learned, trainingCheck: cLearn.summary, heldOut: cRead, afterCheck: cCheck.summary };
  }

  // Scoring: exact device reads vs what was written; "pushed to the key" = a correct letter read as another letter.
  const norm = (s) => (s ?? '').trim().toLowerCase();
  for (const [k, c] of Object.entries(result.conditions)) {
    let exact = 0, total = 0, heldCount = 0, misreadsHeld = 0;
    const misreads = [];
    for (const s of c.heldOut) s.truth.forEach((t, i) => {
      total += 1;
      const ok = norm(s.device[i]) === norm(t);
      if (s.held?.[i]) heldCount += 1;
      if (ok) exact += 1; else { misreads.push(`${s.name} Q${i + 1}: wrote "${t}", device read "${s.device[i]}"${s.held?.[i] ? ' — HELD' : ''}`); if (s.held?.[i]) misreadsHeld += 1; }
    });
    c.score = { exact, total, misreads, held: heldCount, misreadsHeld };
    log(`${k}: held-out device reads exactly right ${exact}/${total}; held for checking ${heldCount} (misreads held ${misreadsHeld}/${misreads.length})` + NL + misreads.map((m) => '   ' + m).join(NL));
  }
  log('HELDOUT DONE');
} catch (err) {
  log('HELDOUT FAILED:', err.message);
  result.error = err.message;
  await page.screenshot({ path: `${OUT}/heldout-fail.png`, fullPage: true }).catch(() => {});
} finally {
  writeFileSync(`${OUT}/learning-heldout.json`, JSON.stringify(result, null, 2));
  await setOffline(false).catch(() => {});
  await browser.close().catch(() => {});
  chrome.kill('SIGTERM');
}

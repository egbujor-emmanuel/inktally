// Runs bench.html in real Google Chrome (Gemini Nano on-device) and scores the
// output against the human answer key in cases.json.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const OUT = 'out';
const PROFILE = process.env.CHROME_PROFILE || '/tmp/chrome-profile';
const TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 10_000;
const MIME = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const localStatePath = join(PROFILE, 'Local State');
const localState = existsSync(localStatePath) ? JSON.parse(readFileSync(localStatePath, 'utf8')) : {};
writeFileSync(localStatePath, JSON.stringify({ ...localState, internal_only_uis_enabled: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'bench.html';
  if (path.includes('..') || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(8080, '127.0.0.1', r));

const chrome = spawn('google-chrome', [
  `--user-data-dir=${PROFILE}`, '--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check',
  '--window-size=1280,800', '--window-position=0,0',
  '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput',
  ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
  'about:blank',
], { stdio: 'ignore' });

let browser;
for (let i = 0; i < 30 && !browser; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); } catch { await sleep(1000); }
}
if (!browser) throw new Error('Could not connect to Chrome over CDP');
const page = browser.contexts()[0].pages()[0];
console.log('Chrome', browser.version());
const PAGE = process.env.PAGE || 'bench.html';
await page.goto(`http://127.0.0.1:8080/${PAGE}`, { waitUntil: 'load' });
await page.click('#go');

const t0 = Date.now();
let bench;
while (Date.now() - t0 < TIMEOUT_MS) {
  bench = await page.evaluate(() => window.__bench);
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] results=${bench.results.length} done=${bench.done}`);
  if (bench.done) break;
  await sleep(POLL_MS);
}
await page.screenshot({ path: `${OUT}/${PAGE.replace('.html', '')}-page.png` });
if (PAGE !== 'bench.html') {
  writeFileSync(`${OUT}/${PAGE.replace('.html', '')}.json`, JSON.stringify(bench, null, 2));
  console.log(bench.log.join('\n'));
  await browser.close().catch(() => {});
  chrome.kill('SIGTERM');
  server.close();
  process.exit(0);
}

// ---- scoring against the human answer key ----
const cases = JSON.parse(readFileSync('cases.json', 'utf8'));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const truthOf = (id) => (byId[id].sameAs ? byId[byId[id].sameAs] : byId[id]);

function scoreMarks(marks, truth) {
  if (!Array.isArray(marks)) return { valid: false };
  const perQ = Object.entries(truth.truthMarks).map(([q, expected]) => {
    const m = marks.find((x) => String(x.q) === q);
    const got = m ? Number(m.awarded) : null;
    return { q: Number(q), expected, got, exact: got === expected };
  });
  const exact = perQ.filter((p) => p.exact).length;
  const total = (arr) => arr.reduce((a, p) => a + (p ?? 0), 0);
  return {
    valid: true, exactQuestions: `${exact}/${perQ.length}`,
    totalExpected: total(perQ.map((p) => p.expected)), totalGot: total(perQ.map((p) => p.got)), perQ,
  };
}

const report = (bench?.results ?? []).map((r) => {
  const truth = truthOf(r.id);
  return {
    id: r.id,
    readMs: r.read?.ms, markMs: r.mark?.ms, twoStepMs: r.twoStep?.ms,
    read: r.read?.answers ?? r.read, truthText: truth.truthText,
    markDirect: scoreMarks(r.mark?.marks, truth),
    readThenMark: scoreMarks(r.twoStep?.marks, truth),
  };
});
writeFileSync(`${OUT}/bench.json`, JSON.stringify({ raw: bench, report }, null, 2));
for (const r of report) {
  console.log(`\n=== ${r.id}  (read ${r.readMs} ms, mark ${r.markMs} ms, read→mark ${r.twoStepMs} ms)`);
  console.log('READ :', JSON.stringify(r.read));
  console.log('TRUTH:', JSON.stringify(r.truthText));
  console.log('MARK direct    :', JSON.stringify(r.markDirect));
  console.log('MARK read→mark :', JSON.stringify(r.readThenMark));
}
console.log('error=', bench?.error);

await browser.close().catch(() => {});
chrome.kill('SIGTERM');
server.close();
process.exit(0);

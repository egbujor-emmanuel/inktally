// Runs cloud.html in local Chrome (headless) and serves the Firebase config from ../secrets
// (never committed). Usage: node cloud.mjs [model]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, normalize } from 'node:path';

const MODEL = process.argv[2] || 'gemini-3.8-flash';
const SECRETS = process.env.SECRETS || '../../secrets';
const MIME = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript' };
const config = {
  firebaseConfig: JSON.parse(readFileSync(`${SECRETS}/firebase-web-config.json`, 'utf8')),
  debugToken: readFileSync(`${SECRETS}/appcheck-debug-token.txt`, 'utf8').trim(),
  model: MODEL,
  thinking: process.env.THINKING || '',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'cloud.html';
  if (path === 'config.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(config)); return; }
  // Sample photos live in the repo's top-level samples/ folder.
  const file = path.split('\\').join('/').startsWith('samples/') ? `../${path}` : path;
  if (path.includes('..') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8090, '127.0.0.1', r));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const ONLY = process.argv[3] ? `?only=${process.argv[3]}` : '';
await page.goto(`http://127.0.0.1:8090/cloud.html${ONLY}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bench !== undefined, null, { timeout: 30000 });
await page.click('#go');
await page.waitForFunction(() => window.__bench.done, null, { timeout: 10 * 60 * 1000, polling: 2000 });
const bench = await page.evaluate(() => window.__bench);
mkdirSync('out-cloud', { recursive: true });
writeFileSync(`out-cloud/cloud-${MODEL}${process.env.THINKING ? '-' + process.env.THINKING : ''}.json`, JSON.stringify(bench, null, 2));
console.log(bench.log.join('\n'));
await browser.close();
server.close();

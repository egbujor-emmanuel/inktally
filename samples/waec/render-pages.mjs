// Renders docs/real-test/scripts.json as "handwritten" exercise-book pages (Caveat font) for a dry run.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright');
const [, , scriptsJson, out] = process.argv;
mkdirSync(out, { recursive: true });
const scripts = JSON.parse(readFileSync(scriptsJson, 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1000, height: 1500 } });
for (const [name, answers] of Object.entries(scripts)) {
  const rows = answers.map(([l, a]) => `<div class="r"><span class="n">${esc(l)}</span> ${esc(a)}</div>`).join('');
  await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet"><style>
    body{margin:0;background:#f6f4ec;font-family:Caveat,cursive;font-size:29px;color:#1c2a6b}
    .page{width:1000px;min-height:1500px;padding:50px 46px 0 104px;box-sizing:border-box;background-image:repeating-linear-gradient(transparent 0 43px,#9cb4d6 43px 44px);position:relative}
    .page:before{content:'';position:absolute;left:86px;top:0;bottom:0;width:2px;background:#e08a8a}
    .r{line-height:44px} .n{display:inline-block;min-width:92px}</style></head>
    <body><div class="page"><div class="r">${esc(name)}</div>${rows}</div></body></html>`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${out}/script-${name.match(/\d+/)[0]}.png`, fullPage: true });
}
await b.close(); console.log('rendered');

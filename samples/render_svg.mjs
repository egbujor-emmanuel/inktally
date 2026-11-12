// Renders a saved sheet SVG at exact A4 proportions (1240x1754 px ≈ 150 dpi).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
let svg = readFileSync(process.argv[2], 'utf8').trim();
if (svg.startsWith('"')) svg = JSON.parse(svg);
svg = svg.replace(/width="210mm"/, 'width="1240"').replace(/height="297mm"/, 'height="1754"').replace(/style="[^"]*"/, '');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter+Tight:wght@400&display=swap" rel="stylesheet"><style>html,body{margin:0;background:#fff}</style></head><body>${svg}</body></html>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: process.argv[3], clip: { x: 0, y: 0, width: 1240, height: 1754 } });
await browser.close();

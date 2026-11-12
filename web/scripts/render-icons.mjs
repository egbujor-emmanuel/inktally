// Renders the vector logo into PNG app icons using the locally installed Chrome.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pub = resolve(process.argv[2] ?? 'public');
const out = process.argv[3] ?? pub;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
async function render(svgFile, size, file, bg = 'transparent', w = size, h = size) {
  const svg = readFileSync(`${pub}/${svgFile}`, 'utf8');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter+Tight:wght@400&display=swap" rel="stylesheet"><style>html,body{margin:0;background:${bg}}svg{width:${w}px;height:${h}px;display:block}</style></head><body>${svg}</body></html>`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/${file}`, omitBackground: bg === 'transparent' });
}
await render('logo-mark.svg', 512, 'icon-512.png');
await render('logo-mark.svg', 192, 'icon-192.png');
await render('logo-mark.svg', 180, 'apple-touch-icon.png');
await render('logo-lockup.svg', 0, 'logo-lockup.png', '#fbf8f1', 1200, 360);
await browser.close();
console.log('icons rendered');

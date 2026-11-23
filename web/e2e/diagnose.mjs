import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext()).newPage();
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
page.on('response', async (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().slice(0, 110)} :: ${(await r.text().catch(() => '')).slice(0, 300)}`); });
await page.goto('https://redpen-hybrid.web.app');
if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
// 1) AI drafting
await page.goto('https://redpen-hybrid.web.app/new');
await page.getByPlaceholder(/1\. 7 × 8/).fill('1. What is 7 x 8?\n2. The capital of Nigeria is ____');
await page.getByRole('button', { name: 'Draft marking scheme' }).click();
await page.waitForTimeout(45000);
log.push('ALERTS after draft: ' + (await page.locator('[role=alert]').allInnerTexts()).join(' / '));
// 2) sample + mark
await page.goto('https://redpen-hybrid.web.app/'); await page.getByText('Try it with a sample').waitFor();
await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
await page.goto(page.url().replace(/\/print$/, '/mark')); await page.getByText('Photograph answer sheet').waitFor();
await page.locator('input[type=file]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.waitForTimeout(40000);
log.push('ALERTS after mark: ' + (await page.locator('[role=alert]').allInnerTexts()).join(' / '));
console.log([...new Set(log)].join('\n'));
await browser.close();

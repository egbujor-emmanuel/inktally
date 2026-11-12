import { chromium } from '@playwright/test';
const U = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(U); if (await page.getByText('REDPEN preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
const base = page.url().replace(/\/print$/, '');
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
console.log('inputs:', await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') + '|' + e.getAttribute('capture'))));
await page.locator('input[aria-label="Choose photo from gallery"]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.waitForTimeout(25000);
console.log('MAIN:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600));
await page.screenshot({ path: 'e2e/out/parity/dbg.png', fullPage: true });
page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Delete' }).click(); await page.getByText('Delete for good').click().catch(() => {});
await browser.close();

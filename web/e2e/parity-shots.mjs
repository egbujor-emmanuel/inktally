// Screenshots of every web screen at the Android emulator's size (Pixel 6, 412 x 915 dp) for side-by-side parity checks.
import { chromium } from '@playwright/test';
const U = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'e2e/out/parity';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
await page.goto(U); if (await page.getByText('REDPEN preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 }); await page.waitForTimeout(1200);
await shot('01-home');
await page.goto(`${U}/quick`); await page.getByText('Photograph the page').waitFor(); await shot('02-quick');
await page.goto(`${U}/new`); await page.getByRole('heading', { name: 'The question paper' }).waitFor(); await shot('03-new');
await page.mouse.wheel(0, 900); await page.waitForTimeout(400); await shot('04-new-scroll');
await page.goto(`${U}/school`); await page.getByText('Save details').waitFor(); await shot('05-school');
await page.goto(U); await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/); await page.waitForTimeout(800);
await shot('06-print');
const base = page.url().replace(/\/print$/, '');
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor(); await shot('07-mark');
await page.locator('input[aria-label="Choose photo from gallery"]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.getByText(/^Total:/).waitFor({ timeout: 120000 }); await page.waitForTimeout(1500); await shot('08-marked');
await page.getByText('Marked copy for').scrollIntoViewIfNeeded(); await shot('09-marked-copy');
await page.goto(`${base}/review`); await page.waitForTimeout(1500); await shot('10-review');
await page.goto(`${base}/register`); await page.getByText('Download Excel (.xlsx)').waitFor(); await shot('11-register');
await page.goto(`${base}/insights`); await page.waitForTimeout(1200); await shot('12-insights');
await page.goto(`${base}/mark`); await page.getByRole('button', { name: 'Delete' }).click(); await page.getByText('Delete for good').click();
await page.waitForURL((u) => new URL(u).pathname === '/');
await browser.close(); console.log('parity shots done');

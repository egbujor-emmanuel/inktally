// Register with several students and a long comment must not widen the phone page.
import { chromium } from '@playwright/test';
const U = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await page.goto(U); if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
const base = page.url().replace(/\/print$/, '');
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
await page.getByLabel('Student name or number').fill('Walkthrough Pupil');
await page.locator('input[aria-label^="Choose photo"]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.getByText(/^Total:/).waitFor({ timeout: 180000 });
await page.getByText('Marked copy for').waitFor({ timeout: 30000 }); await page.getByLabel('Teacher’s comment').fill('A long comment that keeps going to test wrapping inside the register table on a small phone screen.');
console.log('after fill:', await page.getByLabel('Teacher’s comment').evaluateAll((els) => els.map((e) => e.tagName + ':' + e.value.slice(0, 20))), await page.getByRole('button', { name: 'Save comment' }).evaluateAll((b) => b.map((x) => x.disabled))); await page.screenshot({ path: 'e2e/out/parity/dbg-comment.png', fullPage: true }); await page.getByRole('button', { name: 'Save comment' }).click({ timeout: 5000 }); await page.waitForTimeout(800);
await page.goto(`${base}/register`); await page.getByText('Download Excel (.xlsx)').waitFor(); await page.waitForTimeout(800);
console.log('register width:', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
console.log('scroll widths:', await page.evaluate(() => { const out = []; let e = document.querySelector('table'); while (e) { out.push(`${e.tagName}.${String(e.className).slice(0,40)} sw=${e.scrollWidth} cw=${e.clientWidth} ov=${getComputedStyle(e).overflowX}`); e = e.parentElement; } return out; }));
  console.log('wide elements:', await page.evaluate(() => [...document.querySelectorAll('body *')]
  .filter((e) => e.getBoundingClientRect().right > 392)
  .filter((e) => !e.closest('table') && !e.closest('nav'))
  .slice(0, 12).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} pos=${getComputedStyle(e).position} right=${Math.round(e.getBoundingClientRect().right)} parent=${e.parentElement?.tagName}.${String(e.parentElement?.className).slice(0,30)}`)));
await page.getByLabel(/^Student name for Walkthrough Pupil/).click();
await page.getByRole('dialog').getByLabel('Name or number').fill('Ada Renamed');
await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
await page.getByLabel(/^Student name for Ada Renamed/).waitFor({ timeout: 10000 });
console.log('rename via dialog OK');
await page.goto(`${base}/mark`); await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete for good' }).click();
await browser.close();

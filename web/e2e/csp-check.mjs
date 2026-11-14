// Live site under the Content-Security-Policy: App Check, Firestore, fonts, Excel (exceljs) and PDF (jsPDF) must work
// with zero CSP violations. No AI calls.
import { chromium } from '@playwright/test';
const U = process.argv[2] ?? 'https://redpen-hybrid.web.app';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
const page = await ctx.newPage();
const violations = [];
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 220)); });
const resp = await page.goto(U);
console.log('CSP header present:', Boolean((await resp.allHeaders())['content-security-policy']));
if (await page.getByText('REDPEN preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px Fraunces'); });
await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
const base = page.url().replace(/\/print$/, '');
const pdf = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.getByRole('button', { name: 'Share PDF' }).click()]).then(([d]) => d).catch(async () => {
  console.log('PDF FAILED. alerts:', await page.locator('[role=alert]').allInnerTexts(), 'violations so far:', violations); return { suggestedFilename: () => 'NONE' };
});
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
await ctx.setOffline(true);
await page.getByLabel('Student name or number').fill('CSP Student');
await page.locator('input[aria-label^="Choose photo"]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.getByText('Saved for marking: CSP Student').waitFor({ timeout: 20000 });
await ctx.setOffline(false); await page.waitForTimeout(3000);
await page.goto(`${base}/register`); await page.getByText('Download Excel (.xlsx)').waitFor();
const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Download Excel/ }).click()]);
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete for good' }).click();
await page.waitForURL((u) => new URL(u).pathname === '/');
await browser.close();
console.log('fonts loaded:', fontsOk, '| PDF:', pdf.suggestedFilename(), '| XLSX:', xlsx.suggestedFilename());
console.log(violations.length ? `CSP VIOLATIONS: ${JSON.stringify([...new Set(violations)], null, 1)}` : 'PASS no CSP violations');

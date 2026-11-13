// Every Firestore write path that needs no AI, against the live rules: profile, assignment create, status update,
// queued student (offline), rename + comment (dialogs), delete. Fails on any "permission" / "could not save" banner.
import { chromium } from '@playwright/test';
const U = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (/permission|insufficient/i.test(m.text())) problems.push(m.text().slice(0, 200)); });
const banner = async (step) => { const t = await page.locator('[role=alert]').allInnerTexts(); if (t.some((x) => /could not save|permission/i.test(x))) problems.push(`${step}: ${t.join(' / ')}`); };
await page.goto(U); if (await page.getByText('REDPEN preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
await page.goto(`${U}/school`); await page.getByLabel('Institution name').fill('Rules Check College'); await page.getByRole('button', { name: 'Save details' }).click(); await page.waitForTimeout(2500); await banner('profile');
await page.goto(U); await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/); await page.waitForTimeout(2500); await banner('assignment create');
const base = page.url().replace(/\/print$/, '');
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
await page.getByRole('button', { name: 'Mark as finished' }).click(); await page.getByRole('button', { name: 'Reopen' }).click(); await page.waitForTimeout(2000); await banner('status update');
await ctx.setOffline(true);
await page.getByLabel('Student name or number').fill('Rules Student');
await page.locator('input[aria-label="Choose photo from gallery"]').setInputFiles('../samples/english-sheet-photo.jpg');
await page.getByText('Saved for marking: Rules Student').waitFor({ timeout: 20000 });
await ctx.setOffline(false); await page.waitForTimeout(6000); await banner('queued student create');
await page.goto(`${base}/register`); await page.getByText('Download Excel (.xlsx)').waitFor();
await page.getByLabel(/^Student name for Rules Student/).click();
await page.getByRole('dialog').getByLabel('Name or number').fill('Rules Renamed'); await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
await page.getByLabel(/^Comment for Rules Renamed/).click({ timeout: 15000 });
await page.getByRole('dialog').getByLabel('Teacher’s comment').fill('Rules check comment'); await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(3000); await banner('rename + comment');
const ok = (await page.getByText('Rules check comment').count()) > 0;
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor();
await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete for good' }).click();
await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20000 }); await banner('delete');
await browser.close();
console.log(problems.length || !ok ? `FAIL ${JSON.stringify(problems)} commentShown=${ok}` : 'PASS all write paths allowed by the tightened rules');

import { chromium } from '@playwright/test';
const U = 'http://localhost:5173'; const OUT = 'e2e/out';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const mobile of [false, true]) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage(); const tag = mobile ? 'm' : 'd';
  await page.goto(U); if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
  await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
  await page.goto(`${U}/school`); await page.getByLabel('Institution name').fill('Greenfield College');
  await page.getByLabel(/Details under/).fill('12 Bode Thomas St, Surulere, Lagos · First Term 2026/27'); await page.getByLabel(/Teacher or examiner/).fill('Mrs A. Okafor');
  await page.getByRole('button', { name: 'Save details' }).click(); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/shot-school-${tag}.png`, fullPage: true });
  await page.goto(U); await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
  await page.locator('svg.sheet-page').first().waitFor(); await page.waitForTimeout(500);
  await page.locator('svg.sheet-page').first().screenshot({ path: `${OUT}/shot-sheet-${tag}.png` });
  await page.goto(page.url().replace(/print$/, 'mark')); await page.getByLabel('Student name or number').fill('Ada Obi');
  await page.locator('input[type=file]').setInputFiles('../samples/english-sheet-photo.jpg');
  await page.getByText('Marked copy for').waitFor({ timeout: 150000 });
  await page.getByLabel(/^Comment for/).fill('Well done on objectives. Revise irregular past tenses (ran, went) before Friday.');
  await page.getByRole('button', { name: 'Save comment' }).click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/shot-marked-${tag}.png`, fullPage: true });
  if (!mobile) { const src = await page.locator('img[alt^="Marked copy"]').getAttribute('src'); const b64 = await page.evaluate(async (s) => { const r = await fetch(s); const buf = new Uint8Array(await r.arrayBuffer()); let x = ''; for (const c of buf) x += String.fromCharCode(c); return btoa(x); }, src); (await import('node:fs')).writeFileSync(`${OUT}/shot-copy.png`, Buffer.from(b64, 'base64')); }
  await page.goto(page.url().replace(/mark$/, 'register')); await page.getByRole('button', { name: /Download Excel/ }).waitFor();
  await page.screenshot({ path: `${OUT}/shot-register-${tag}.png`, fullPage: true });
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Delete' }).click(); await page.waitForURL((u) => new URL(u).pathname === '/');
  await ctx.close();
}
await browser.close(); console.log('shots done');

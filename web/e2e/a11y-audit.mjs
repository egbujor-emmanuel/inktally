// Accessibility audit (axe-core, WCAG 2.2 AA rules) of every main screen at phone size. No AI calls.
// Usage: REDPEN_CODE=... node e2e/a11y-audit.mjs [url]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const U = process.argv[2] ?? 'https://inktally.web.app';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(U); if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
const screens = [['home', U], ['quick', `${U}/quick`], ['new', `${U}/new`], ['school', `${U}/school`]];
await page.locator('#samples button', { hasText: 'English' }).click(); await page.waitForURL(/\/print$/);
const base = page.url().replace(/\/print$/, '');
for (const t of ['print', 'mark', 'review', 'register', 'insights']) screens.push([t, `${base}/${t}`]);
const summary = [];
for (const [name, url] of screens) {
  await page.goto(url); await page.waitForTimeout(1500);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  summary.push({ name, violations: r.violations.length });
  for (const v of r.violations) console.log(`[${name}] ${v.impact} ${v.id}: ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
}
console.log('SUMMARY', JSON.stringify(summary));
await page.goto(`${base}/mark`); await page.getByText('Photograph answer sheet').waitFor({ timeout: 30000 }).catch(async (e) => { console.log('MAIN AT FAILURE:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500)); await page.screenshot({ path: 'e2e/out/a11y-fail.png' }); throw e; }); await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete for good' }).click();
await browser.close();

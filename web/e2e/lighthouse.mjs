// Lighthouse (mobile) on the live app, after passing the preview passcode in the same Chrome profile.
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
const U = process.argv[2] ?? 'https://redpen-hybrid.web.app';
const PORT = 9333;
const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: [`--remote-debugging-port=${PORT}`] });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(U); if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60000 });
const scores = {};
for (const path of ['/', '/quick', '/new']) {
  const r = await lighthouse(`${U}${path}`, { port: PORT, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'], formFactor: 'mobile' });
  const c = r.lhr.categories;
  scores[path] = { performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), bestPractices: Math.round(c['best-practices'].score * 100),
    LCP: r.lhr.audits['largest-contentful-paint'].displayValue, CLS: r.lhr.audits['cumulative-layout-shift'].displayValue, TBT: r.lhr.audits['total-blocking-time'].displayValue };
  const failing = Object.values(r.lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && ['accessibility', 'best-practices'].some((k) => r.lhr.categories[k].auditRefs.some((ref) => ref.id === a.id)));
  if (failing.length) console.log(path, 'needs work:', failing.map((a) => a.id).join(', '));
}
console.log(JSON.stringify(scores, null, 1));
await ctx.close();

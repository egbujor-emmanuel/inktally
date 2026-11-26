// Runs the InkTally handwriting test pack (docs/real-test/) on the live site and compares every mark with the truth.
// 1) creates the assignment from the typed marking guide, 2) marks each script photo as an exercise-book page,
// 3) prints a per-question comparison and writes e2e/out/handwriting-test.json.
// Usage: REDPEN_CODE=... [TRUTH=path/to/truth.json] node e2e/handwriting-test.mjs <folder with script-1..N images> [url]
// A truth file with "pages" maps each script to its photo(s); a script on several pages is marked as one student.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = process.argv[2];
const URL_ = process.argv[3]?.startsWith('http') ? process.argv[3] : 'https://inktally.web.app';
if (!DIR) throw new Error('Pass the folder with script photos');
const OUT = resolve(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });
const TRUTH = resolve(process.env.TRUTH ?? resolve(import.meta.dirname, '../../docs/real-test/truth.json'));
const truth = JSON.parse(readFileSync(TRUTH, 'utf8'));

const GUIDE = readFileSync(resolve(import.meta.dirname, '../../docs/real-test/guide.txt'), 'utf8');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL_, { timeout: 120_000 });
if (await page.getByText('InkTally preview').count()) { await page.fill('input', process.env.REDPEN_CODE ?? ''); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });

// 1) The assignment, from the teacher's own marking guide.
await page.goto(`${URL_}/new`);
await page.getByLabel('Title').fill(`Handwriting test — ${truth.paper}`.slice(0, 120));
await page.getByLabel('…or type / paste your marking scheme').fill(GUIDE);
await page.getByRole('button', { name: 'Use my marking scheme' }).click();
const draftStarted = Date.now();
await page.getByRole('button', { name: 'Save and print answer sheets' }).waitFor({ timeout: 300_000 }).catch(async (e) => {
  console.log('DRAFT FAILED. On screen:', (await page.locator('[role=alert]').allInnerTexts()).join(' | ') || '(no error shown)');
  throw e;
});
console.log(`answer key drafted in ${Math.round((Date.now() - draftStarted) / 1000)} s`);
const alerts = await page.locator('[role=alert]').allInnerTexts();
if (alerts.length) console.log('notice:', alerts.join(' | '));
const key = await page.locator('fieldset').evaluateAll((fs) => fs.map((f) => f.innerText.replace(/\s+/g, ' ').slice(0, 220)));
console.log(`answer key: ${key.length} questions`);
key.forEach((k) => console.log('  ' + k));
await page.getByRole('button', { name: 'Save and print answer sheets' }).click();
await page.waitForURL(/\/print$/, { timeout: 30_000 });
const base = page.url().replace(/\/print$/, '');

// 2) Each script, as an exercise-book page.
const ONLY = process.env.ONLY?.split(',');
const scripts = truth.pages
  ? Object.entries(truth.pages).map(([name, files]) => ({ name, files }))
  : readdirSync(DIR).filter((f) => /^script-\d+\.(png|jpe?g)$/i.test(f)).sort().map((f) => ({ name: `Script ${f.match(/\d+/)[0]}`, files: [f] }));
const results = [];
for (const { name, files } of scripts.filter((s) => !ONLY || ONLY.includes(s.name.match(/\d+/)[0]))) {
  const n = name.match(/\d+/)[0];
  const started = Date.now();
  await page.goto(`${base}/mark`);
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
  await page.getByRole('radio', { name: /Exercise book page/ }).click();
  await page.getByLabel('Student name or number').fill(name);
  if (files.length > 1) await page.getByRole('checkbox', { name: /pages of one student/i }).check();
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(files.map((f) => join(DIR, f)));
  const done = await page.getByText(/^Total:/).waitFor({ timeout: Number(process.env.MARK_TIMEOUT_MS ?? 300_000) }).then(() => true, () => false);
  if (!done) {
    await page.screenshot({ path: `${OUT}/stuck-${n}.png`, fullPage: true });
    console.log(`
${name}: NO RESULT after ${Math.round(Number(process.env.MARK_TIMEOUT_MS ?? 300_000) / 1000)} s. On screen: ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600)}`);
    results.push({ name, stuck: true, marks: [], diffs: [] });
    continue;
  }
  const total = (await page.getByText(/^Total:/).innerText()).trim();
  const rows = await page.$$eval('ol > li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ')));
  // Rows read "Q6(b)(i) 2/2 AI read: ...": match each mark to the truth by its label (spaces and case aside).
  const norm = (l) => String(l).toLowerCase().replace(/\s+/g, '');
  const labels = truth.labels.map(norm);
  const marks = rows.map((r) => { const m = r.match(/^Q(\S+?)\s+(\d+)\s*\/\s*(\d+)/); return m ? { label: m[1], got: +m[2], max: +m[3], row: r.slice(0, 220) } : null; }).filter(Boolean);
  const want = truth.scripts[name]?.marks ?? [];
  for (const m of marks) m.index = labels.indexOf(norm(m.label));
  const unmatched = marks.filter((m) => m.index < 0);
  const diffs = marks.filter((m) => m.index >= 0 && want[m.index] !== m.got).map((m) => ({ ...m, want: want[m.index] }));
  if (unmatched.length) console.log(`  labels InkTally used that the truth does not have: ${unmatched.map((m) => m.label).join(', ')}`);
  results.push({ name, total, seconds: Math.round((Date.now() - started) / 1000), truthTotal: truth.scripts[name]?.total, marks, diffs });
  console.log(`\n${name}: InkTally ${total} · truth ${truth.scripts[name]?.total}/${truth.total} · ${Math.round((Date.now() - started) / 1000)} s · ${diffs.length} question(s) differ`);
  diffs.forEach((d) => console.log(`  Q${d.label}: InkTally ${d.got}/${d.max}, truth ${d.want} — ${d.row}`));
}
const agree = results.reduce((n, r) => n + r.marks.filter((m) => m.index >= 0).length - r.diffs.length, 0);
const all = results.filter((r) => !r.stuck).length * truth.labels.length;
console.log(`\nquestions where InkTally = truth: ${agree}/${all}`);
writeFileSync(process.env.OUT_JSON ?? `${OUT}/handwriting-test.json`, JSON.stringify({ at: new Date().toISOString(), site: URL_, truth: TRUTH.replace(/^.*?docs/, 'docs').replaceAll('\\', '/'), key, results, agree, all }, null, 2));
await browser.close();

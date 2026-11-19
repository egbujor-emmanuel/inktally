// Runs the REDPEN handwriting test pack (docs/real-test/) on the live site and compares every mark with the truth.
// 1) creates the assignment from the typed marking guide, 2) marks each script photo as an exercise-book page,
// 3) prints a per-question comparison and writes e2e/out/handwriting-test.json.
// Usage: REDPEN_CODE=... node e2e/handwriting-test.mjs <folder with script-1..N images> [url]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = process.argv[2];
const URL_ = process.argv[3]?.startsWith('http') ? process.argv[3] : 'https://redpen-hybrid.web.app';
if (!DIR) throw new Error('Pass the folder with script photos');
const OUT = resolve(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });
const truth = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../docs/real-test/truth.json'), 'utf8'));

const GUIDE = `JSS 3 Basic Science and Mathematics — Mixed Test. Marking guide, 23 marks.
The correct final answer earns full marks, even without working. If the final answer is wrong, the method mark is given only when the working shown matches it.
1. B (liver). 1 mark.
2. C (newton). 1 mark.
3. C (rusting of iron). 1 mark.
4. Photosynthesis. Accept small spelling errors (e.g. fotosynthesis). Do not accept: respiration. 1 mark.
5. Na. Do not accept: So, S, N. 1 mark.
6. Average speed of a car that travels 150 km in 3 hours. Answer 50 km/h (accept 50 with or without the unit). 2 marks: method (1 mark) uses speed = distance ÷ time (150 ÷ 3); answer (1 mark).
7. Density of a stone, mass 240 g, volume 30 cm³. Answer 8 g/cm³ (accept 8). 2 marks: method (1 mark) uses density = mass ÷ volume (240 ÷ 30); answer (1 mark).
8. Solve 4x − 7 = 2x + 9. Answer x = 8. 2 marks: method (1 mark) collects like terms correctly to get 2x = 16; answer (1 mark).
9. Percentage profit, bought for ₦45,000, sold for ₦54,000. Answer 20%. 2 marks: method (1 mark) finds the profit, ₦9,000 (54,000 − 45,000); answer (1 mark).
10. Simplify 2¾ + 1⅝. Answer 4⅜ (accept 35/8 or 4.375). 2 marks: method (1 mark) changes to improper fractions or a common denominator (22/8 + 13/8); answer (1 mark).
11. State three functions of the blood. 3 marks, any three, 1 mark each: transports oxygen; transports digested food / nutrients; removes waste / carbon dioxide; fights infection, germs or disease; helps blood to clot; distributes heat / regulates body temperature; transports hormones.
12. Give two differences between a plant cell and an animal cell. 2 marks, any two, 1 mark each: plant cells have a cell wall (animal cells do not); plant cells have chloroplasts; plant cells have a large central vacuole; plant cells have a regular / fixed shape. Do not accept: size (e.g. "plant cells are bigger").
13. State three ways of preventing malaria. 3 marks, any three, 1 mark each: sleep under insecticide-treated mosquito nets; remove or drain stagnant water / clear gutters; spray insecticide or kill mosquitoes; use insect repellent; clear bushes around the house; take antimalarial drugs as advised; screen windows and doors. Do not accept: drinking clean water, praying.`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL_);
if (await page.getByText('REDPEN preview').count()) { await page.fill('input', process.env.REDPEN_CODE ?? ''); await page.click('button[type=submit]'); }
await page.getByText('Try it with a sample').waitFor({ timeout: 60_000 });

// 1) The assignment, from the teacher's own marking guide.
await page.goto(`${URL_}/new`);
await page.getByLabel('Title').fill('Handwriting test — JSS 3 Mixed');
await page.getByLabel('…or type / paste your marking scheme').fill(GUIDE);
await page.getByRole('button', { name: 'Use my marking scheme' }).click();
await page.getByRole('button', { name: 'Save and print answer sheets' }).waitFor({ timeout: 180_000 });
const key = await page.locator('fieldset').evaluateAll((fs) => fs.map((f) => f.innerText.replace(/\s+/g, ' ').slice(0, 220)));
console.log(`answer key: ${key.length} questions`);
key.forEach((k) => console.log('  ' + k));
await page.getByRole('button', { name: 'Save and print answer sheets' }).click();
await page.waitForURL(/\/print$/, { timeout: 30_000 });
const base = page.url().replace(/\/print$/, '');

// 2) Each script, as an exercise-book page.
const photos = readdirSync(DIR).filter((f) => /^script-\d+\.(png|jpe?g)$/i.test(f)).sort();
const results = [];
for (const f of photos) {
  const n = f.match(/\d+/)[0];
  const name = `Script ${n}`;
  const started = Date.now();
  await page.goto(`${base}/mark`);
  await page.getByText('Photograph answer sheet').waitFor({ timeout: 60_000 });
  await page.getByRole('radio', { name: /Exercise book page/ }).click();
  await page.getByLabel('Student name or number').fill(name);
  await page.locator('input[aria-label^="Choose photo"]').setInputFiles(join(DIR, f));
  await page.getByText(/^Total:/).waitFor({ timeout: 300_000 });
  const total = (await page.getByText(/^Total:/).innerText()).trim();
  const rows = await page.$$eval('ol > li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ')));
  const marks = rows.map((r) => { const m = r.match(/^Q(\d+)\s+(\d+)\s*\/\s*(\d+)/); return m ? { q: +m[1], got: +m[2], max: +m[3], row: r.slice(0, 200) } : null; }).filter(Boolean);
  const want = truth.scripts[name]?.marks ?? [];
  const diffs = marks.filter((m) => want[m.q - 1] !== undefined && want[m.q - 1] !== m.got).map((m) => ({ ...m, want: want[m.q - 1] }));
  results.push({ name, total, seconds: Math.round((Date.now() - started) / 1000), truthTotal: truth.scripts[name]?.total, marks, diffs });
  console.log(`\n${name}: REDPEN ${total} · truth ${truth.scripts[name]?.total}/23 · ${Math.round((Date.now() - started) / 1000)} s · ${diffs.length} question(s) differ`);
  diffs.forEach((d) => console.log(`  Q${d.q}: REDPEN ${d.got}/${d.max}, truth ${d.want} — ${d.row}`));
}
const agree = results.reduce((n, r) => n + r.marks.length - r.diffs.length, 0);
const all = results.reduce((n, r) => n + r.marks.length, 0);
console.log(`\nquestions where REDPEN = truth: ${agree}/${all}`);
writeFileSync(`${OUT}/handwriting-test.json`, JSON.stringify({ at: new Date().toISOString(), site: URL_, key, results, agree, all }, null, 2));
await browser.close();

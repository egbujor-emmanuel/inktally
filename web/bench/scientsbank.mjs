// Public benchmark: SciEntsBank (SemEval-2013 Task 7), test set "unseen answers" (540 answers to 135 science questions,
// each labelled by trained human annotators). InkTally marks every answer exactly as the app marks a 1-mark theory
// question: the reference answer is the marking point, the cloud point check (prompt_points_batch from Remote Config)
// says whether the answer states it, and code (markPoints) gives the mark. Runs the app's own modules in Chrome through
// the Vite dev server. Resumable: answers already in the results file are skipped, so the run can span quota resets.
//
// Usage: npx vite --port 5179 (in web/), then
//   node bench/scientsbank.mjs (in web/) <test_ua.json from huggingface.co/datasets/nkazi/SciEntsBank> [out.json] [limit]
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [dataPath, outArg, limitArg] = process.argv.slice(2);
if (!dataPath) throw new Error('Pass the SciEntsBank test_ua.json');
const OUT = resolve(outArg ?? '../bench/evidence/scientsbank-test-ua/results.json');
const U = process.env.DEV_URL ?? 'http://localhost:5179';
const SPACING_MS = 4_200; // the free tier allows 15 requests a minute
// Label order of the 5-way dataset (huggingface.co/datasets/nkazi/SciEntsBank): only "correct" earns the mark.
const LABELS = ['correct', 'contradictory', 'partially_correct_incomplete', 'irrelevant', 'non_domain'];

const items = JSON.parse(readFileSync(dataPath, 'utf8'));
// PROMPT_FILE: a candidate point-check prompt, compared on a training-set sample before it ships (never tuned on test).
const TEMPLATE = process.env.PROMPT_FILE ? readFileSync(process.env.PROMPT_FILE, 'utf8') : null;
const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { results: [] };
const done = new Map(prior.results.map((r) => [r.id, r]));
const todo = items.filter((it) => !done.has(it.id) || done.get(it.id).error).slice(0, Number(limitArg ?? Infinity));
console.log(`${items.length} answers, ${done.size} already marked, marking ${todo.length} now`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${U}/llms.txt`, { timeout: 120_000 }); // a static page: the app's Firebase setup runs once, below
await page.evaluate(async (template) => {
  const [{ checkPointsBatch }, { markPoints }] = await Promise.all([import('/src/ai/batch.ts'), import('/src/marking/engine.ts')]);
  globalThis.markOne = async (it) => {
    const question = { q: 1, type: 'points', prompt: it.question, max: 1, points: [it.reference_answer] };
    const started = performance.now();
    const { found, rejected } = await checkPointsBatch(it.student_answer, question.points, [], ...(template ? [template, it.question] : []));
    const mark = markPoints(question, it.student_answer, 'in_cloud', found, rejected);
    return { awarded: mark.awarded, status: mark.status, ms: Math.round(performance.now() - started) };
  };
}, TEMPLATE);

mkdirSync(dirname(OUT), { recursive: true });
const save = () => {
  const results = items.map((it) => done.get(it.id)).filter(Boolean);
  writeFileSync(OUT, JSON.stringify({
    dataset: 'SciEntsBank (SemEval-2013 Task 7), test split "unseen answers" (huggingface.co/datasets/nkazi/SciEntsBank, split test_ua)',
    method: 'Each answer marked as a 1-mark theory question: marking point = reference answer; InkTally cloud point check (Remote Config prompt_points_batch) + code markPoints. Gold 2-way: label "correct" = 1, every other label = 0.',
    labels: LABELS, total: items.length, results,
  }, null, 1));
};

let n = 0;
for (const it of todo) {
  const t = Date.now();
  let row;
  try {
    const r = await page.evaluate((x) => globalThis.markOne(x), it);
    row = { id: it.id, gold: it.label, gold2: it.label === 0 ? 1 : 0, awarded: r.awarded, status: r.status, ms: r.ms };
  } catch (e) {
    row = { id: it.id, gold: it.label, gold2: it.label === 0 ? 1 : 0, error: String(e?.message ?? e).slice(0, 200) };
    if (/quota|RESOURCE_EXHAUSTED|429/i.test(row.error)) { console.log('quota used up; run again after the reset to continue'); done.set(it.id, row); save(); break; }
  }
  done.set(it.id, row);
  if (++n % 20 === 0) { save(); console.log(`${n}/${todo.length}`); }
  await new Promise((r) => setTimeout(r, Math.max(0, SPACING_MS - (Date.now() - t))));
}
save();
const ok = [...done.values()].filter((r) => !r.error);
console.log(`marked ${ok.length}/${items.length}; agree with the human label on ${ok.filter((r) => (r.awarded >= 1 ? 1 : 0) === r.gold2).length}`);
await browser.close();

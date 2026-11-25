// Checks every public claim in ../evidence/claims.json:
//   1. each source file exists and, when pinned, still has the same SHA-256 (evidence was not edited after the run);
//   2. the number is recomputed from the source by the check named in the claim;
//   3. the README (and any other listed document) states exactly that number in the claimed sentence.
// Usage: npm run evidence:verify   (exit code 1 on any mismatch)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mnistStats, sciEntsBankStats } from '../bench/stats.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const sha256 = (p) => createHash('sha256').update(readFileSync(resolve(ROOT, p))).digest('hex');
const norm = (s) => String(s).trim().toLowerCase();

/** Each check returns the value as the documents state it. */
const CHECKS = {
  webUnitTests: ([report]) => {
    const r = json(report);
    if (r.numFailedTests !== 0) throw new Error(`${r.numFailedTests} unit tests failing`);
    return String(r.numPassedTests);
  },
  walkthroughSteps: (logs) => {
    const counts = logs.map((p) => read(p).match(/(\d+)\/(\d+) steps passed/)).map((m) => (m && m[1] === m[2] ? m[0].replace(' steps passed', '') : 'FAILED'));
    if (new Set(counts).size !== 1) throw new Error(`desktop and mobile differ: ${counts.join(', ')}`);
    return counts[0];
  },
  offlineColdStart: ([p]) => { const r = json(p).results; return `${r.filter((x) => x.ok).length}/${r.length}`; },
  quickMarkRepeat: ([p]) => {
    const runs = json(p).quickMark;
    const totals = new Set(runs.map((r) => r.total.replace('Total: ', '')));
    if (totals.size !== 1) throw new Error(`totals differ: ${[...totals].join(', ')}`);
    return `${runs.length} runs, ${[...totals][0]}`;
  },
  ownSchemeSaved: ([p, kind]) => {
    const runs = (json(p).ownScheme ?? []).filter((x) => x.kind === kind);
    return `${runs.filter((x) => x.saved).length}/${runs.length}`;
  },
  cloudWholePage: (files) => {
    const vals = new Set(files.map((p) => json(p).summary.wholePageMarksExact));
    if (vals.size !== 1) throw new Error(`runs differ: ${[...vals].join(', ')}`);
    return [...vals][0];
  },
  onDeviceLoop: ([p]) => {
    const r = json(p);
    const onDevice = r.offlineRows.filter((row) => /On-device/.test(row)).length;
    const confirmed = r.reviewText.match(/Cloud check: (\d+) on-device marks confirmed/)?.[1] ?? '0';
    return `${onDevice}/${r.offlineRows.length} on-device, ${confirmed} confirmed`;
  },
  heldOutMisreadsShown: ([p]) => {
    let misreads = 0, shown = 0;
    for (const s of json(p).conditions.B.heldOut) {
      s.truth.forEach((t, i) => {
        if (norm(t) === norm(s.device[i])) return;
        misreads += 1;
        if (/Check this/.test(s.rows[i])) shown += 1;
      });
    }
    return `${shown}/${misreads}`;
  },
  handwritingDryRun: ([p]) => { const r = json(p); return `${r.agree}/${r.all}`; },
  // Public benchmarks: every answer must be marked (no errors left), then agreement is recomputed from the rows.
  sciEntsBank: ([p]) => {
    const r = json(p);
    if (r.results.length !== r.total || r.results.some((x) => x.error)) throw new Error('benchmark incomplete');
    const st = sciEntsBankStats(r.results);
    return `${st.agree}/${st.n}`;
  },
  privacyLive: ([p]) => {
    const r = json(p);
    const pupil = r.geminiRequests.filter((x) => x.image || !x.teacherMaterial).length;
    return `${r.steps.filter((x) => x.ok).length}/${r.steps.length} checks, ${pupil} pupil requests sent`;
  },
  mnistSheets: ([p]) => { const st = mnistStats(json(p).results); return `${st.exact}/${st.answers} read exactly, ${st.unflaggedWrong} wrong without a flag`; },
};

const { claims } = json('evidence/claims.json');
let failed = 0;
for (const c of claims) {
  const problems = [];
  for (const s of c.sources) {
    if (!existsSync(resolve(ROOT, s.path))) { problems.push(`missing ${s.path}`); continue; }
    if (s.sha256 && sha256(s.path) !== s.sha256) problems.push(`${s.path} changed since the claim was recorded`);
  }
  let value = '';
  if (!problems.length) {
    try { value = CHECKS[c.check]([...c.sources.map((s) => s.path), ...(c.args ?? [])]); } catch (e) { problems.push(e.message); }
    if (value && value !== c.value) problems.push(`evidence says "${value}", claim says "${c.value}"`);
  }
  for (const doc of c.statedIn) {
    const text = read(doc);
    if (!text.includes(c.text)) problems.push(`${doc} does not contain: ${c.text}`);
  }
  for (const token of c.shows) if (!c.text.includes(token)) problems.push(`the stated text does not show "${token}"`);
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${c.id.padEnd(24)} ${c.value}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`);
  failed += problems.length ? 1 : 0;
}
console.log(`\n${claims.length - failed}/${claims.length} claims verified against their evidence`);
process.exit(failed ? 1 : 0);

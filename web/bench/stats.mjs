// Statistics for the public benchmarks, shared by the benchmark reports and scripts/verify-evidence.mjs.

/** SciEntsBank: InkTally's mark (1 = awarded) against the human 2-way label (1 = "correct"). */
export function sciEntsBankStats(results) {
  const rows = results.filter((r) => !r.error);
  const n = rows.length;
  const pred = rows.map((r) => (r.awarded >= 1 ? 1 : 0));
  const gold = rows.map((r) => r.gold2);
  const agree = pred.filter((p, i) => p === gold[i]).length;
  const tp = pred.filter((p, i) => p === 1 && gold[i] === 1).length;
  const fp = pred.filter((p, i) => p === 1 && gold[i] === 0).length;
  const fn = pred.filter((p, i) => p === 0 && gold[i] === 1).length;
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  // Cohen's kappa: agreement beyond what the two label rates alone would give.
  const p1 = pred.filter((p) => p === 1).length / n, g1 = gold.filter((g) => g === 1).length / n;
  const expected = p1 * g1 + (1 - p1) * (1 - g1);
  const kappa = (agree / n - expected) / (1 - expected);
  // Majority-class baseline (always "not correct") and an exact McNemar test of InkTally against it.
  const majority = gold.filter((g) => g === 0).length;
  const b = rows.filter((_, i) => pred[i] === gold[i] && gold[i] !== 0).length; // InkTally right, baseline wrong
  const c = rows.filter((_, i) => pred[i] !== gold[i] && gold[i] === 0).length; // baseline right, InkTally wrong
  return { n, agree, accuracy: agree / n, precision, recall, f1, kappa, majority, majorityAccuracy: majority / n, mcnemar: { b, c, p: exactMcNemar(b, c) } };
}

/** Two-sided exact McNemar p-value (binomial test on the discordant pairs). */
export function exactMcNemar(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let tail = 0;
  let term = 0.5 ** n; // C(n, 0) / 2^n
  for (let i = 0; i <= k; i++) { tail += term; term = (term * (n - i)) / (i + 1); }
  return Math.min(1, 2 * tail);
}

/** MNIST sheets: how many numbers were read exactly, marked right, flagged, or marked wrong with no flag. */
export function mnistStats(results) {
  const answers = results.filter((s) => s.marks).flatMap((s) => s.answers);
  const digits = (t) => String(t ?? '').replace(/[\s,]/g, '');
  const exact = answers.filter((a) => digits(a.read) === String(a.written)).length;
  const truth = (a) => (a.written === a.key ? 1 : 0);
  const right = answers.filter((a) => a.awarded === truth(a)).length;
  const flagged = answers.filter((a) => a.status === 'flagged').length;
  const unflaggedWrong = answers.filter((a) => a.awarded !== truth(a) && a.status !== 'flagged').length;
  const refused = results.filter((s) => s.refused).length;
  return { sheets: results.length, refused, answers: answers.length, exact, right, flagged, unflaggedWrong };
}

# Dry run of the handwriting test pack (2026-11-19)

The 4 scripts in [`docs/real-test/`](../../../docs/real-test/), rendered in a handwriting font (`scripts/`), marked on the live site as exercise-book pages against the typed marking guide, by [`web/e2e/handwriting-test.mjs`](../../../web/e2e/handwriting-test.mjs). The truth is in [`docs/real-test/truth.json`](../../../docs/real-test/truth.json).

| Run | REDPEN = truth (per question) | Time per page |
|---|---|---|
| First run | 44 / 52 | 31–208 s |
| After the fixes below | **52 / 52** (totals 22, 10, 12, 20 = truth) | 16–43 s |

The first run's 8 disagreements, and the fixes:
- "4³/₈" and "80 g/cm^3" (how the model wrote them) weren't read → the number reader now handles superscript fractions and caret units.
- The copied guide's "answer (1 mark)" became a method mark, so wrong working earned a mark → the final answer is never a method mark.
- "Use a mosquito net" wasn't credited for "sleep under treated nets", nor "animal cells have no chloroplast" for "plant cells have chloroplasts" → point checks accept the same idea in other words.
- Point checks ran one request per point → batched per question for cloud reads.

These are computer-rendered pages; real handwriting from four people is the next step.

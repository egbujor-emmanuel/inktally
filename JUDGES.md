# Judges: start here (5 minutes)

No account, no install, any browser. You start as a private guest. Everything below runs on the live app at **https://inktally.web.app** with files from this repo.

| Time | What to do | What you should see | Criterion |
|---|---|---|---|
| **0:00–0:30** | Read the problem | A teacher with 60–100 students per class marks handwritten work by hand, on patchy mobile data. InkTally marks it on the teacher's own phone or laptop, even offline: **Gemini Nano reads, code marks, the cloud checks.** | Impact |
| **0:30–1:30** | **Quick mark a page.** Home → *Quick mark a page* → upload [`samples/maths.png`](samples/maths.png) (real handwriting, two answers deliberately wrong) → check the drafted key → *Looks right — mark it* | **4/6.** "15 + 9 = 23" and "25% of 80 = 25" are caught. The key was drafted from the questions only, never from the answers on the page. | Tech, Design |
| **1:30–3:00** | **A real exam format (WAEC physics).** Home → *New assignment* → paste [`samples/waec/marking-guide.txt`](samples/waec/marking-guide.txt) into *…or type / paste your marking scheme* → *Use my marking scheme* → *Save* → *Mark* → *Exercise book page* → upload [`samples/waec/script-2.png`](samples/waec/script-2.png) (answers rendered in a handwriting font) | The key has **14 questions with the paper's own labels** (1–5, 6(a), 6(b)(i), 6(b)(ii), 7(a)…10), method marks and theory points. Script 2 should come out at **6/22**. Look at **Q8(b)**: the student wrote "v = f/λ = 50/0.4 = 125". InkTally gives **no method mark** and flags it, because correct arithmetic that misses the answer means the wrong formula. Truth for all four scripts: 21, 6, 17, 22 out of 22 ([`docs/real-test/truth.json`](docs/real-test/truth.json)). | Tech, Idea |
| **3:00–4:00** | **Offline.** Home → *English — Grammar Check* sample → turn your connection **off** → reload (InkTally still opens) → *Mark* → *Choose photos* → pick [`samples/english-sheet-photo.jpg`](samples/english-sheet-photo.jpg) twice → turn the connection **on** | "2 scripts added" while offline, then each is marked **3/5** by itself when you reconnect. With desktop Chrome built-in AI, the same sheet is read **on the device** and labelled *On-device · Provisional* until the cloud check confirms it. No Nano hardware? Watch the recorded run: [`bench/evidence/ondevice-current-2026-11-15/`](bench/evidence/ondevice-current-2026-11-15/). | Tech |
| **4:00–4:30** | **Teacher tools.** In the same assignment: *Answer key* → change an answer → students are re-marked from what InkTally already read. *Mark register* → *Excel*. *Review* → flagged answers beside the handwriting. | No second round of marking by hand. | Design, Impact |
| **4:30–5:00** | **Verify it yourself.** `cd web && npm ci && npm run ci:clean` | Lint, 128 unit tests, build with a secret scan, and **every public number re-checked against its evidence file** ([`evidence/claims.json`](evidence/claims.json)). | Tech |

## Where the hybrid inference lives in the code

| Firebase AI Logic mode | Used for | Code |
|---|---|---|
| `PREFER_ON_DEVICE` | Gemini Nano reads one cut-out answer box; offline | [`web/src/ai/read.ts`](web/src/ai/read.ts), [`Ai.kt`](android/app/src/main/java/app/redpen/teacher/ai/Ai.kt) |
| `ONLY_IN_CLOUD` | The cloud check of every on-device mark; "Verified" needs both readings to agree | [`web/src/marking/markAnswer.ts`](web/src/marking/markAnswer.ts) (`reconcile`) |
| `ONLY_IN_CLOUD` | Answer keys and catch-up sheets, structured output, one time budget across models | [`web/src/ai/scheme.ts`](web/src/ai/scheme.ts), [`web/src/ai/models.ts`](web/src/ai/models.ts) |
| `PREFER_IN_CLOUD` | Reads on devices without Gemini Nano | [`web/src/ai/models.ts`](web/src/ai/models.ts) |
| `inferenceSource` | The label on every mark: On-device · Cloud read · Verified · Check this | [`web/src/domain/types.ts`](web/src/domain/types.ts) |

The safety rules and the test that proves each one: [`THREAT_MODEL.md`](THREAT_MODEL.md). Rebuild from a clean clone: [`REPRODUCE.md`](REPRODUCE.md).

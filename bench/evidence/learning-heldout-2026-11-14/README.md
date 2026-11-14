# Held-out test of the learning loop on real Gemini Nano (2026-11-14)

Run on the live site in Chrome with Gemini Nano (Codespace, virtual display), script [`bench/learning-heldout.mjs`](../../learning-heldout.mjs).
Answers reviewer B2 (F5): the earlier "3/5 → 5/5" result re-read the same sheet the corrections came from.

**Setup.** Misreads are learned from ONE training sheet (`samples/english-sheet-photo.jpg`), then five *different*
students' sheets (`sheets/s2.jpg` … `s6.jpg`) are read on-device, offline. All sheets are synthetic — answers rendered in
the Caveat font by `samples/make_sheet_photo.py` — so "handwriting" here is one rendered hand. Two students really wrote
"A" on questions where the device tends to read "D" as "A" (the negative control).

| Condition | What the device knew | Held-out reads exactly right |
|---|---|---|
| A — control | nothing | 19/25 |
| B — hints from the training sheet, in the read prompt (earlier design) | "A" was "D" (1 sighting, held back by the old guard rail), "raned" was "runned" | 19/25 |
| C — training sheet marked twice | Nano read the training "D" correctly both times, so only "raned"/"rannd" → "runned" | 20/25 |

**Finding 1 — prompt hints did not help.** 19, 19 and 20 of 25 are within Nano's run-to-run variation (the same sheet
was read differently in different runs). The prompt-hint design was removed.

**Finding 2 — the cloud's corrections do say where the device is wrong.** The device's misreads on unseen students
were the same two confusions the training sheet's cloud check found: "D" read as "A", "runned" read as "raned".
Holding every offline reading that matches a known misread (the shipped design) would, on condition B's reads, have
held all 6 misreads and 5 correct reads — and changed none. That replay is a unit test on web
([`hybrid.test.ts`](../../../web/src/marking/hybrid.test.ts)) and Android ([`HybridTest.kt`](../../../android/app/src/test/java/app/redpen/teacher/HybridTest.kt)).

**Why not hints with a guard rail?** The negative control shows the risk: in the control run 5 answers really were "A",
and an "A"→"D" hint could have turned them into "D". A systematic misread is seen twice almost at once, so "wait for a
second sighting" does not remove that risk. Holding does.

Files: `learning-heldout.json` (every reading), `learning-heldout.log`, `learning-heldout.mp4` (screen recording),
`heldout-*-review.png` (Review tab after each condition's cloud check), `sheets/`.

## Live check of the shipped design (`live-held-run/`)

The same condition B, run again on the live site after the holding design was deployed (service-worker cache cleared
first so the new build is used). The training sheet's cloud check found 2 misreads ("A" for "D", "raned" for "runned").
Then the five unseen students were read on-device, offline:

| | Count |
|---|---|
| Device readings exactly right | 18/25 |
| Device misreads | 7 |
| Misreads shown as **Check this** before reconnecting | **7/7** — 4 held by the learned misread, 3 already flagged by the engine ("raned" is close to "ran") |
| Correct readings also held for a look | 5 |
| Readings changed by REDPEN | 0 |

One held misread would otherwise have been false credit: Femi wrote "D" on Q3, Nano read "A", and "A" is the correct
answer. Since this run, engine-flagged readings also get the learned reason ("Gemini Nano has read “runned” as “raned”
before"), so the teacher knows what was probably written.

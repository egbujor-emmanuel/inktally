# REDPEN: Reviewer A3 scorecard (#BuildHybridAI 2026)

**How I tested.** I used the live app at https://redpen-hybrid.web.app with access code `redpen-3015d8`. I drove real Chrome through the node `playwright` package (`channel: 'chrome'`, headless) at **412x915** (mobile emulation, DPR 2.625) and **1280x800**. Every upload used the real files in `samples/`. I emulated offline with CDP `Network.emulateNetworkConditions {offline:true}` plus `context.setOffline(true)`. Test window: **2026-11-15, 04:47–06:15 UTC**. My scripts, logs (`run.log`) and screenshots (`shots/`) are in the session scratchpad under `reviewA3/`.

Things that affect how to read the results:
- **The live site was redeployed at 05:25:30 UTC** (`Last-Modified`), in the middle of my window. The commits behind it were `8f9d41f` "answer-key edits keep the hybrid safety net…", `ff84c3c` (new current-build Nano evidence) and `c5fcaf8` (trial files). One home load right after the deploy timed out at 60 s. Every later load worked. I re-ran Quick mark (desktop) and the answer-key up/down test (desktop) on the new deploy, and both behaved the same as before it.
- **Service-worker caveat.** In Playwright *persistent* profiles on this machine, `navigator.serviceWorker.register('/sw.js')` resolves, but no registration is ever stored. This is a harness artefact: in fresh contexts the SW registers and controls the page. All offline cold-start results below come from a fresh context.
- **No Gemini Nano** in this Chrome ("Cloud AI (no on-device model)"). I judged the on-device path from the UI and the recorded evidence.
- I modified no project files except this report.

---

## Scores

| # | Criterion | Score | One-line justification |
|---|---|---|---|
| 1 | Technological Implementation | **4** | A principled hybrid design: Nano only reads a cut-out box, code marks, and the cloud audits. The learning loop now holds matching reads instead of hinting the prompt, which is a measured design choice, and the held-out evidence matches the README to the digit. Offline cold start, deep links offline, queue and auto-marking on reconnect, Excel offline, and 96/96 unit tests all work. Held back by one unexplained, persisted mark corruption after answer-key edits (P1 #1), cloud reads that are still wrong but get a green tick, and a 128 s theory page. |
| 2 | Design | **4** | A complete, coherent product: print → mark → marked copy → register/Excel/CSV → review → insights/catch-up → editable answer key. axe (WCAG 2.2 AA tags) found **0 violations on 10/10 pages** at 412 px, with 0 px overflow at both sizes. Disabled states now explain themselves, the stale banner is gone, and the desktop is now a 1024 px layout with horizontal tabs. Held back by: still one column on desktop; the assignment tab bar is cut off at 412 px ("Ma…") with no scroll cue; orphan "· Maths" headers when the level is empty. |
| 3 | Potential Impact | **4** | A specific audience (big classes, weak data) and a workflow built for it. Stacks of photos queue offline and mark themselves on reconnect, the register and Excel work offline, and the new answer-key editing removes the "remark 80 scripts by hand" fear. It is still not shown with real teachers or real classes, and batch rows are "Student N" with no thumbnail or number read. |
| 4 | Quality of the Idea | **5** | Non-obvious and grounded in measurements. The device never sees the question (Nano auto-corrected 23→24 when it did). Code decides every mark. The cloud acts as an independent auditor, and its disagreements become a per-assignment list of shaky readings that is *held*, never used to rewrite what the device read. The README backs this with a negative control showing that prompt hints could turn a true "A" into "D". |
| | **Average** | **4.25** | Tie-break order: Tech 4 → Design 4 → Impact 4 → Idea 5 |

**Verdict: PASS.** Every criterion is ≥ 4, and I found **no P0**. I ignored the three submission-day items: the gate, the private repo, and the APK release.

---

## Flows tested, with what I observed

| # | Flow | Viewport | Observed result |
|---|---|---|---|
| 1 | Gate → home | 412 | Code accepted; home ready in **9.2 s** (4.2 s on a later visit). Chips "Online", "Cloud AI (no on-device model)". 0 px overflow. The only console message is Chrome's "model was available but there was not an execution config" warning. |
| 2 | **Quick mark `maths.png`, run 1** | 412 | Key drafted in **8.0 s** with 1 mark each: 56 / 24 / 12 / 1 / 20 / 27000. Marked in **8.3 s** → **Total 4/6**. Q2 "23; expected 24" ✗, Q5 "25; expected 20" ✗. All chips read "Cloud · Marked by code · Cloud read". |
| 3 | Quick mark, run 2 | 412 | Key in 5.8 s, marked in 6.5 s → **4/6**, same key. |
| 4 | Quick mark, run 3 | 412 | Key in 6.3 s, marked in 5.5 s → **4/6**. Q4 was read as **"3 ¼ + 1 ¼ = 1"** (a misread) and still got a green tick. |
| 5 | Quick mark, run 4 | 1280 | Key in 12.1 s, marked in 6.9 s → **4/6**. |
| 6 | Quick mark, run 5 (after the 05:25 redeploy) | 1280 | Key in 13.0 s, marked in 7.6 s → **4/6**. Q4 was read as **"3 ¼ + ¼ = 1"**, ticked. **5/5 runs = 4/6**, matching the README. |
| 7 | Quick mark offline | 412 | "Quick mark needs internet (the cloud writes the answer key)." |
| 8 | English sample → Print sheets | 1280 | One sheet page: corner squares, Name/No., 5 boxes ("Write ONE letter · 1 mark" / "Answer · 1 mark"). Print, Share PDF, and a "No printer?" hint. |
| 9 | Mark `english-sheet-photo.jpg` (printed-sheet mode) | 1280 | **3/5 in 4.9 s** (true score). B ✓, D ✓, B ✗ "correct is A", Abuja ✓, "runned" ✗ "listed as not acceptable". The marked copy (red ticks, circled 3/5) shows a comment box and Share/Print. |
| 10 | Batch: 3 photos at once | 1280 / 412 | "3 scripts added…". Queue pills are in photo order (**Student 2, 3, 4** on desktop; **Student 1, 2, 3** on mobile). All marked 3/5 in **13.7 s** (desktop), **11.2 s** and **30.2 s** (mobile and desktop re-runs). |
| 11 | **Answer key tab: edit after marking (in-app tab navigation)** | 412 | 3 students at 3/5. Q3 A→"A, B": "Re-marked 3 students: 3 answers went up, 0 went down." → all **4/5**. Q3 back to A: "0 up, 3 went down" → all **3/5**. Q4 accept → "Lagos": "3 went down" → all **2/5**. Q4 → "Abuja / F.C.T.": "3 went up" → all **3/5**. Saved, then reloaded immediately: persisted (4/5, key shows "A, B"). |
| 12 | Answer key, same test on the new deploy | 1280 | Identical results: up 3 → 4/5, down 3 → 3/5, down 3 → 2/5, up 3 → 3/5, and it survived an immediate reload. |
| 13 | Answer key: change marks and short answers, full-page navigation between edits | 1280 | 4 students. Q1 B→C: 4 down ✓. Q5 accept "runned" and clear "Do not accept": notice "4 went up", but the register showed only Ada going up. Q2 marks 1→2: header "Q2 /2, Total /6", all Q2 = 2 ✓. **In this first run, 6 of the per-student re-marks the notice reported were missing from the register, and one row stays corrupted** (see P1 #1). |
| 14 | Answer key: more stress trials | 1280 | 4 save → immediate full reload trials, 6 save → close tab → reopen trials, and 3 trials after a fresh batch: **0 losses in 13 trials**. |
| 15 | Answer key: empty answer | 1280 | "Every question needs at least one answer." The alert is shown in view (y = 660 px). |
| 16 | Answer key → Review → "accept for everyone" | 412 | Q4 key set to "Abuja city" → "3 went down, 3 to check". Review lists 3× "'Abuja' is close to 'Abuja city' — accept it? Re-marked after the answer key was edited.", with 0/1 and 1/1 buttons. One click on "Accept 'Abuja' for everyone" → "**Accepted 'Abuja'. 2 other students' marks went up too.**" Review now says "Nothing to check: every mark was read by the cloud or set by you. ✓" |
| 17 | **Own marking scheme, typed** ("1. 56 (1 mark) / 2. Abuja (1 mark) / 3. went — do not accept goed (2 marks)"), subject and class empty | 412 | Copied in **2.6 s** exactly (Q3 = 2 marks, "goed" rejected; Q2's "Do not accept" is empty). **Saved in 1.8 s** → /print. Subject filled in as "General". |
| 18 | **Own marking scheme, photo** (`english-marking-scheme.jpg`), subject empty | 412 | Copied in **4.1 s**: B / D / A / "Abuja, F.C.T." (empty Do-not-accept) / "ran", reject "runned", marks 1,1,1,1,**2**. **Saved in 1.6 s.** Subject read from the paper as "English Grammar Check". Class/level left empty. Then marked the sheet photo: reads B / D / B / Abuja / runned, all correct verdicts. |
| 19 | Question paper photo (`maths.png`) → draft, subject empty | 412 | Drafted in 6.0 s; subject read as **"Maths"**; saved in 1.8 s. The header reads " · Maths" (orphan separator, because the level is empty). |
| 20 | Register + rename + comment + Excel + CSV | 412 | Renamed Student 1 → "Amaka Obi" and added the comment "Revise irregular past tenses." `English-Grammar-Check-marks.xlsx` (read with exceljs) has a title row, "Exported 11/15/2026 · Marked with REDPEN", headers with /max, per-question marks, Total, Percent 0.8, Status "Final", the comment, and a Class average row. CSV matches (80%, "final"). |
| 21 | Insights + catch-up | 412 | Per-question cards with averages. Disabled buttons now say "Nobody lost marks on this question, so there is nothing to catch up on." Q5 "Answers that lost marks: 'runned' ×3". The catch-up sheet arrived in **2.9 s**: a correct irregular-verb explanation, 4 practice items with "Show answer", and Share/Print. |
| 22 | Exercise-book mode, `english-sheet-photo.jpg` | 1280 | **3/5 in 4.5 s.** |
| 23 | Exercise-book mode, real handwriting `bio-dim.png` (Basic Science sample, theory point checks) | 412 | **5/7 in 128 s.** Q1 2/2 ("Blood camies oxygen nund the body and it figt germs"). Q2 2/3 "1 more point(s) needed". Q3 1/1. Q4 0/1 "not accepted: fights disease (that is the white blood cell)". An earlier attempt during the redeploy got no result within 180 s. |
| 24 | Wrong paper in printed-sheet mode | 1280 | "Found 0 of 4 corner squares. Fit the whole sheet in the photo, in good light." |
| 25 | **Offline cold start** (fresh context: visit online, SW active and controlling, close tab, offline, new tab) | 412 | Home in **4.8–6.1 s**, chip "Offline — marked when back online". **Deep link `/a/<id>/mark` opens offline** (1.1–3.3 s). |
| 26 | Offline queue | 412 | One photo → "Saved for marking: Offline Pupil — You're offline and this device can't read handwriting without a connection…". Then a 2-photo batch → "2 scripts added", "3 waiting to be marked · They will be marked automatically when you're back online." Pills: Offline Pupil, Student 2, Student 3. |
| 27 | Other tabs while offline | 412 | Review: "Runs when online". Register: **Excel downloads offline**. New assignment: "Drafting needs internet". Answer key editable. |
| 28 | Reconnect | 412 | Queue drained **15.6 s** after reconnect. All three marked 3/5 in the register. |
| 29 | Stale banner check | 412 | Offline, single photo "Banner Pupil", stayed on Mark, reconnected → the banner was replaced by "**Marked: Banner Pupil · 3/5**" after 6.4 s. |
| 30 | Accessibility + overflow | 412 | axe tags wcag2a/2aa/21aa/22aa on home, quick, new, school, print, key, mark, review, register, insights: **clean on all 10**. 0 px horizontal overflow on all 10. (It needed `bypassCSP` to inject axe: the CSP blocks inline scripts, which is good.) |
| 31 | Desktop layout | 1280 | Content is 1024 px wide (up from ~736), with horizontal header buttons and tabs, and a full-width register table. Overflow 0 on 10/10 pages. Still a single column. |
| 32 | Status chips at 412 | 412 | They now wrap onto a second line ("0 on-device · 2 cloud" fully visible). |
| 33 | Review "What REDPEN learned…" card | — | **Not reachable without Nano**: it renders only when `assignment.readingHints` exist, and those come only from on-device reads. I checked it in the evidence screenshots and logs instead (below). |
| 34 | Unit tests (`npx vitest run`) | — | **96/96 pass** across 10 files in 5.8 s. The README says 91. |
| 35 | CI (`gh run list`) | — | Latest `android` push runs: success. `android-e2e`: one failure at 05:13, then success at 05:13:53. |

### Evidence folders vs the README

| Folder | README claim | Files say | Match? |
|---|---|---|---|
| `learning-heldout-2026-11-14/` (three conditions) | Exact reads 19/25 without hints, 19/25 and 20/25 with | Log: "A: 19/25", "B: 19/25", "C: 20/25", with the misread lists. | **Yes** |
| same, "holding would have held all 6 misreads + 5 correct reads" in condition B | — | I recomputed from the B reads. Misreads: Amaka Q2, Tunde Q2, Tunde Q5, Femi Q2, Femi Q3, Femi Q5 = 6. Correct "A" reads on objective questions: 5. | **Yes** |
| `learning-heldout-2026-11-14/live-held-run/` | 18/25 exact; 7 misreads; **7/7 shown as Check this** (4 held by the learned misread, 3 engine-flagged); 5 correct reads held; 0 readings changed; Femi Q3 would have been false credit | I parsed the JSON myself: right 18, misreads 7, misreads showing "Check this" 7, held-flag true on 4 misreads + 5 correct = 9 (log: "held for checking 9 (misreads held 4/7)"). Femi Q3 row: "1/1 … Check this … Held for checking". | **Yes**, with one wording problem: the held Femi Q3 mark still counts in "Total: 1/5" (P2 #2) |
| `ondevice-current-2026-11-15/` (now the README's headline hybrid run) | 5/5 on-device offline, all correct, 3/5, "Cloud check: 5 on-device marks confirmed" 2 s after reconnect | Log: offline 05:10:56 → marks at 05:13:50; back online 05:13:50 → "5 on-device marks confirmed" at 05:13:52; "no correction to learn from". | **Yes**. Note the on-device read took **174 s for 5 boxes** in this run (39 s in the 11-14 run). The README no longer quotes a time. |
| `ondevice-learning-2026-11-14/` + new `NOTE.md` | Now labelled "earlier build" | It shows the old prompt-hint card ("Gemini Nano gets these hints…"). `NOTE.md` says so honestly. | **Yes** (correctly relabelled) |
| `repeatability-2026-11-14/` | Quick mark 5× 4/6; typed scheme 3/3 saved, photo 2/2 saved | JSON: 5× "Total: 4/6". The first file has 2 typed attempts failing on a test-script locator (a `g-recaptcha` textarea), not on the app; the second file has typed 3/3 saved. My own runs agree (5/5 = 4/6, typed and photo both saved). | **Yes** |
| `walkthrough-2026-11-14/` | 18/18 desktop and mobile, incl. the answer-key edit | Logs: 18/18; "Re-marked 2 students: 2 answers went up". It only tests **up**. I tested down myself (flows 11–13). | **Yes** |
| `web-offline-coldstart-2026-11-14/` | 6/6; 3 scripts marked 3/5 | `result.json`: 6/6, "3/3 scripts marked 3/5 after reconnect". My run agrees (flows 25–28). | **Yes** |
| README "91 unit tests" | — | 96 pass. | Stale (understated) |

**The learning loop as the README describes it:** "every misread the cloud check finds … is saved; an offline reading that matches one is held as **Check this** instead of counting; REDPEN never changes what the device read." The code (`marking/learning.ts`: `learnFromCheck`, `mergeHints`, `holdIfKnownMisread`) does exactly that, apart from "instead of counting". A held mark becomes `status: 'flagged'` but **keeps its `awarded` value**, so it still counts in the total shown on the Mark tab until the teacher or the cloud check resolves it.

---

## Bugs and confusions

### P0
None found.

### P1

1. **Answer-key edit: some per-student re-marks were not persisted, and one row is left permanently inconsistent (intermittent).**
   - **Steps (first run, 1280):** English sample → mark 1 photo + batch 3 → Answer key. Then a series of edits, each followed by a full page load of `/register` ~1.5 s after the success notice: Q3 "A, B"; Q1 "C"; Q5 accept "runned" + clear reject; Q4 "Lagos"; Q2 marks +1; Q3 "A"; then restore everything.
   - **Result:**
     - After the first edit the notice said "Re-marked 4 students: 4 answers went up", but only Ada and Student 2 changed. Students 3 and 4 kept Q3 = 0, and the next edit computed from that state.
     - The Q5 edit reported "4 went up", but only Ada's mark persisted.
     - The final restore did not reach Student 4. That row **still reads `0 2 0 1 0 3` under the "Q1 /1, Q2 /1" headers**: 2 marks on a 1-mark question, and Q1 = 0 although the key is B and the read was B. It survives reloads and later edits, because `remarkOne` only re-scores questions that changed (assignment `5MYaPzibsbTmwQ0A7feV`).
   - **Not reproduced** in 13 later trials: immediate reload, tab close right after saving, edits right after a fresh batch, or in-app tab navigation.
   - **Likely contributors:** `KeyTab.handleSave` shows the success notice after `saveScheme` and `saveMarks`, which only *queue* writes (`queueWrite`, fire-and-forget). Nothing reconciles stored marks against the current key when the page loads.
   - **Fix:**
     - Write the scheme and all students' marks in one `writeBatch`, and await it or its local commit.
     - On load, re-mark any student whose `max` or verdict disagrees with the current key, using the stored readings.
     - Show "Saved on this device, syncing…" until the server acknowledges.

### P2

2. **"Held … instead of counting" is not what the totals do.** In the live held-out run, Femi's Q3 is "1/1 … Check this … Held for checking" and still counts in "Total: 1/5". The Review card and the README both say "held as 'Check this' instead of counting". Either leave held marks out of the provisional total (and show "+1 pending"), or change the wording to "flagged for checking".
3. **Cloud misreads still get a green tick in Quick mark.** In 2 of 5 runs Q4 was read as "3 ¼ + 1 ¼ = 1" or "3 ¼ + ¼ = 1", and it was ticked 1/1 "Cloud read" because only the number after "=" is marked. The mark is right, but the displayed read is wrong. Flag a read whose left-hand side doesn't match the question.
4. **Theory (point-check) pages are slow.** `bio-dim.png` took **128 s** in exercise-book mode, and one attempt during the redeploy got nothing within 180 s. A2 measured 34.6 s. There is no progress beyond "Reading the page…".
5. **The level is never read from the paper, and headers show an orphan separator.** The subject is now read ("Maths", "English Grammar Check"; the typed scheme gets "General"), but class/level stays empty. The header and home list then read " · Maths" / " · General" with a leading "·". The photo scheme's "subject" is really its title.
6. **The assignment tab bar is cut off at 412 px.** Six tabs: "Mark register" and "Insights" are off-screen, and "Ma" is truncated at the edge, with no scroll cue or overflow menu.
7. **Key tab wording while students are only queued.** Offline, with 3 photos waiting and none marked, the Answer key tab says "Students have been marked, so the questions stay as printed." It should say "Students are waiting to be marked…".
8. **The register calls single cloud reads "Final".** Register Status "Final", CSV "final", and the engine still stores single cloud reads as `status: 'verified'` (`engine.ts:22`). The chips correctly say "Cloud read". The register and Excel can't tell "read twice and agreed" from "read once in the cloud" from "held".
9. **Batch rows are still anonymous.** Order is now stable, but rows are "Student N" with no thumbnail in the register or queue, and the "No." box is not read. For 80 scripts, renaming is still guesswork, though "Marked copy" per row helps.
10. **Docs drift.**
    - README says 91 unit tests, but there are 96.
    - Hybrid-path step 5 quotes "4 on-device marks confirmed, 1 needs you", while the current-build run shows "5 confirmed". That is fine as an example, but worth saying "e.g.".
11. **The live site changed mid-review** (05:25:30 UTC deploy), and one home load timed out right after. If the site tracks main, pushes during judging change what judges see.

---

## Previous review (reviewer-A2.md): status of each finding

| # | A2 finding | Status now |
|---|---|---|
| P0 #1 | Saving an own-marking-scheme assignment crashes (`undefined` field), error off-screen | **Fixed.** Typed scheme (Q2 with an empty Do-not-accept) saved in 1.8 s. Photo scheme (Q4 with an empty Do-not-accept) saved in 1.6 s. A validation error I triggered on the Key tab is shown in view. |
| P1 #2 | Repo private, no release | **Still present.** Submission-day item, not penalised. |
| P1 #3 | README "Quick mark → 4/6" doesn't reproduce (5/7, 3/6) | **Fixed.** 5/5 runs gave 4/6 with 1 mark per question; "₦27,000" parsed. The underlying Q4 misread shown as ✓ is **still present** (P2 #3). |
| P1 #4 | Batch rows shuffled, can't be matched to papers | **Partly fixed.** Order is now stable (photo order). Rows are still anonymous "Student N" (P2 #9). |
| P2 #5 | Stale offline banner after reconnect | **Fixed** ("Marked: Banner Pupil · 3/5" replaced it in 6.4 s). |
| P2 #6 | Review says "verified or reviewed" for single cloud reads; register "Final" | **Review wording fixed** ("every mark was read by the cloud or set by you"). **Register/CSV "Final"** and the stored `'verified'` status are **still present** (P2 #8). |
| P2 #7 | Catch-up disabled with no reason | **Fixed** ("Nobody lost marks on this question, so there is nothing to catch up on."). |
| P2 #8 | Subject/class silently default to Mathematics / Grade 6 | **Fixed for subject** (empty by default, read from the paper). **Level is not read**, which leaves an orphan "·" (P2 #5). |
| P2 #9 | Desktop is a ~736 px phone column | **Mostly fixed.** 1024 px content, horizontal header and tabs, wide register. Still a single column. |
| P2 #10 | Status chips clipped at 412 | **Fixed** (they wrap). A new similar issue is the tab bar at 412 (P2 #6). |
| P2 #11 | Saved schemes can't be edited | **Fixed.** New Answer key tab; re-marking verified both up and down. **New intermittent persistence issue** (P1 #1). |
| P2 #12 | Gate gives no hint | Submission-day item, not penalised. |
| P2 #13 | Docs drift; site redeployed and CI failed during the window | **Still present.** README says 91 tests, but there are 96. The site redeployed again during my window. Android CI is green now. |
| — | Evidence: old on-device run showed a superseded design | **Fixed.** New `ondevice-current-2026-11-15/` run on the current build, and the old folder carries `NOTE.md` "Earlier build". |

**No regressions** of A2's fixed items. The one new problem is P1 #1, in a new feature.

---

## What would raise each score by a full point

**Technological Implementation 4 → 5**
- Make answer-key re-marking atomic and self-healing (P1 #1): one `writeBatch`; a load-time reconcile of stored marks against the key; a sync state in the notice. Add a walkthrough step that edits **down** as well as up and checks the register after a full reload.
- Leave held marks out of the provisional total, or reword (P2 #2).
- Flag cloud reads whose left-hand side contradicts the question (P2 #3).
- Store single cloud reads under their own status.
- Bring theory-page latency back to roughly 30 s, or show progress per point check.

**Design 4 → 5**
- Use the desktop width: capture on the left with the live marked copy on the right, and Review as a two-pane list.
- Fix the 412 px tab overflow: scroll affordance, or a "More" menu.
- Read or ask for the level, and drop the orphan "·".
- Make the queue and register visual, with a thumbnail per script.

**Potential Impact 4 → 5**
- Show it working with real teachers. The `/trial/` kit exists, so report a real class: scripts per hour, agreement with a human marker, minutes saved.
- Make 80-script batches matchable: read the "No." box on the device, or offer rename-as-you-flip with thumbnails.

**Quality of the Idea:** already 5. Lead the demo with "the device reads, code marks, the cloud audits and the device's misreads get held", using the held-out negative control.

---

## Final verdict

**PASS.** Scores are 4 / 4 / 4 / 5 (average **4.25**), with no P0.

The headline paths a judge will try all worked:
- Quick mark gave the README's 4/6 five times out of five.
- The printed sheet gave 3/5.
- An own scheme, typed or photographed, copies exactly and now saves.
- Editing the answer key re-marks students up and down.
- Offline cold start, deep links, and queue → auto-marking on reconnect all work.
- Excel works offline.
- axe found nothing on 10 pages.

The held-out learning evidence matches the README exactly.

The one finding to fix before judging is P1 #1. In a single run, re-marks after answer-key edits were partly lost and left a student row that is impossible on its face (2 marks on a 1-mark question). I could not reproduce it in 13 later trials, but nothing in the app would repair it if it happened to a teacher.

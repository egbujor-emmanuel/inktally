# REDPEN: Reviewer A2 scorecard (#BuildHybridAI 2026)

**How I tested.** I used the live app at https://redpen-hybrid.web.app with access code `redpen-3015d8`. I drove real Chrome through the node `playwright` package, using persistent profiles at **412x915** (mobile emulation, DPR 2.625) and **1280x800**. Every upload used the real files in `samples/`. I emulated offline with CDP `Network.emulateNetworkConditions {offline:true}` plus `context.setOffline(true)`. Test window: **2026-11-14, 18:27–18:59 UTC**.

Two things changed during the window:
- The live site was redeployed at **18:55:28 UTC** (`Last-Modified` header), after commit `1ac2bf6` "reviewer B2 findings". I re-ran the P0 reproduction against the new deploy, and it still fails.
- The latest `android` CI run (18:49 UTC) **failed**. A fix run was in progress.

This Chrome has **no Gemini Nano**, so I judged the on-device path from the app's UI and the recorded evidence. I modified no project files except this report. My scripts and screenshots are in the session scratchpad (`reviewA2/`).

---

## Scores

| # | Criterion | Score | One-line justification |
|---|---|---|---|
| 1 | Technological Implementation | **4** | Hybrid design that genuinely makes sense: Nano reads only one answer box, code marks, and a later cloud pass checks the device's reads. It uses `PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` / `ONLY_IN_CLOUD`, `inferenceSource` telemetry, Remote Config, App Check, offline Firestore and a service worker. The offline queue and cold start work exactly as claimed, and 72/72 unit tests pass. Held back by a reproducible save crash (`undefined` sent to `setDoc`) on the "use my own marking scheme" path, and by Quick mark results that vary from run to run. |
| 2 | Design | **4** | A complete, branded product: print, mark, marked copy with letterhead, register, Excel, review, insights, catch-up, finish/reopen, delete with confirm. axe (WCAG 2.2 AA tags) found **0 violations on all 9 pages** at 412px, with 0 px horizontal overflow. Held back by a raw FirebaseError rendered off-screen, a stale offline banner, a desktop layout that is still a single ~736px column, and buttons disabled with no reason given. |
| 3 | Potential Impact | **4** | A specific audience (60–100-student classes on weak data) and a workflow that matches it: batch photos, offline queue, register, Excel, catch-up sheet. Every one of those worked for me. Held back because no real teacher usage is shown yet, and a batch produces "Student N" rows in shuffled display order, which is painful at 80 scripts. |
| 4 | Quality of the Idea | **5** | Not obvious, and grounded in a measured failure: Nano "auto-corrected" 23→24 when it saw the question, so it never sees the question. Code decides every mark. The cloud audits the device and teaches it per class, and it never sees those hints, so it stays an independent checker. Privacy comes from cropping out the answer boxes. It shows real understanding of teachers' trust problem. |
| | **Average** | **4.25** | Tie-break order: Tech 4 → Design 4 → Impact 4 → Idea 5 |

**Verdict: FAIL** under the stated rule (every criterion ≥ 4 **and no P0**). The scores clear the bar. The P0 below is what fails it.

---

## Flows tested, with what I observed

| # | Flow | Viewport | Observed result |
|---|---|---|---|
| 1 | Access gate | both | "REDPEN preview / Access code / Enter". The code was accepted. Home was ready in 14.9 s on the first visit. There is no hint about where the code comes from. |
| 2 | Home | 412 | Chips: "Online", "Cloud AI (no on-device model)". Headline "A stack of classwork, marked in minutes. Even offline." 3-step strip, Active/Finished tabs, 3 samples. 0 px overflow. Console shows only the Chrome warning "model was available but there was not an execution config". |
| 3 | Quick mark, `maths.png` (run 1) | 412 | Key drafted in **10.6 s**: 56 / 24 / 12 / 1 / 20 / 27000. **Q6 was given 2 marks.** Marked in **7.6 s**: **Total 5/7**. Q2 "23; expected 24" and Q5 "25; expected 20" were caught. Q4 was read as "3 ¼ + ¼ = 1" (a misread) but marked correct. Chips: "Cloud · Marked by code · Cloud read". Counter "0 on-device · 2 cloud". |
| 4 | Quick mark, `maths.png` (run 2) | 1280 | Key drafted in **11.2 s**, this time with Q6 = 1 mark. Marked in **8.9 s**: **Total 3/6**. Q6 was read as "6 crates x 4,500= #27,000" (₦ read as #) and came back as "Check this: Could not read a number in the answer box". Q4 was read as "314 + 114 = 1" and marked correct. **The README promises 4/6. Neither run gave 4/6.** |
| 5 | Quick mark while offline | 412 | The photo input is replaced by "Quick mark needs internet (the cloud writes the answer key)." The failure is handled cleanly. |
| 6 | English sample → Print sheets | 1280 | The sheet has 4 corner squares, Name/No. fields and 5 boxes ("Write ONE letter · 1 mark" / "Answer · 1 mark"). Buttons: Print, Share PDF, and a "No printer?" hint. |
| 7 | Mark printed sheet, `english-sheet-photo.jpg` | 1280 | **Total 3/5 in 9.3 s** (true score). Q1 B ✓, Q2 D ✓, Q3 B ✗ ("correct is A"), Q4 Abuja ✓, Q5 "runned" ✗ ("listed as not acceptable"). The marked copy (red ticks and crosses, circled 3/5) renders with Share/Print. Per-question crops are shown. |
| 8 | Comment → register → marked copy | 1280 | The register modal saved the comment, and it appears in the register row and the Excel. "Marked copy" in the register opens the record with the comment (50/1000). |
| 9 | School details → letterhead | 1280 | Saved "Judge Hill Secondary School / 5 Review Road, Ibadan · Second Term / Mr Judge". The register header shows "JUDGE HILL SECONDARY SCHOOL … Teacher: Mr Judge", and so do printed sheets. |
| 10 | Batch: 3 photos at once | 1280 | "3 scripts added. REDPEN is marking them one by one…", "Marking Student 2 now…". The queue list order was **Student 3, Student 2, Student 4**. All 3 marked 3/5. Timed precisely on later runs: **3 scripts in 9.2 s and 11.8 s** (desktop), **27.3 s** (mobile). |
| 11 | Register + Excel + CSV | 1280 | "4 students · class average 3.0/5". The .xlsx opened with exceljs: letterhead rows 1–4 (institution, details, title, "Teacher: Mr Judge · Exported 11/14/2026"), per-question marks, Total, Percent 0.6, Status "Final", comment, and a Class average row. The CSV matches (60%, "final"). The rename "Student 2 → Amaka Obi" carried into the Excel. |
| 12 | Review (cloud-only marks) | 1280 | "0 answers to check · Check with the cloud · All marks are verified or reviewed. ✓" |
| 13 | Review → accept for everyone | 1280 | I copied the scheme from the photo, then set Q4's accepted answer to "Abuja city". Marking 4 sheets gave **4 flags**: "'Abuja' is close to 'Abuja city' — accept it?", with the crop image, 0/1 and 1/1 buttons, and "Accept 'Abuja' for everyone". One click produced "**Accepted 'Abuja'. 3 other students' marks went up too.**" and the register showed all 4 at 3/6. Works as claimed, with no new AI call. |
| 14 | Insights + catch-up | 1280 | Per-question cards: Q3 "Answers that lost marks: 'B' ×4 · 0%", Q5 "'runned' ×4 · 0%". The Q5 catch-up sheet arrived in **2.5 s**: a correct irregular-verb explanation, 4 practice items with "Show answer", and Share/Print. On questions with no wrong answers the button is disabled with no explanation. |
| 15 | Own marking scheme from photo (`english-marking-scheme.jpg`) | both | Copied in **3.6 s**, exactly: Q1 B, Q2 D, Q3 A, Q4 "Abuja / F.C.T.", Q5 accept "ran", do-not-accept "runned", **2 marks**. |
| 16 | **Save** own scheme (photo) | both | **Failed 3 of 4 attempts** with `FirebaseError Function setDoc() called with invalid data. Unsupported field value: undefined (found in document assignments/…)`. The alert renders at **top = -1364 px** (mobile) / -672 px (desktop), so nothing visible happens on tap. Workaround: type anything into Q4's empty "Do not accept" field, after which it saves. |
| 17 | **Save** own scheme (typed: "1. 56 (1 mark) / 2. Abuja (1 mark) / 3. went — do not accept goed (2 marks)") | both | **Failed 3 of 3**, including on the 18:55 redeploy, with the same FirebaseError off-screen. |
| 18 | Typed questions → drafted scheme → save | both | Saved 4 of 4 (14–17 s including drafting). Print sheet shows the letterhead. |
| 19 | Own scheme → mark sheet | 412 | Total **3/6 in 9.6 s** (Q5 counted as 2 marks: "0/2 'runned' is listed as not acceptable"). |
| 20 | Exercise-book mode, `maths.png` | 412 | **5/7 in 13.3 s**. Same reads as Quick mark. |
| 21 | Wrong paper in printed-sheet mode | 412 | "Found 0 of 4 corner squares. Fit the whole sheet in the photo, in good light." A clear, honest error. |
| 22 | Biology sample, `bio-dim.png` (theory point checks) | 412 | **5/7 in 34.6 s**. Q1 2/2 (despite "camies… figt gems"), Q2 2/3 ("1 more point needed"), Q3 1/1, Q4 0/1 "not accepted: fights disease (that is the white blood cell)". |
| 23 | Offline → reload → open sample → add 3 photos | 412 | Home loaded offline in 5.1 s with chip "Offline — marked when back online". The assignment opened from cache. "3 scripts added… They will be marked automatically when you're back online." After reconnect, all 3 marked 3/5. |
| 24 | **Cold start offline** (fresh browser launch, offline before the first request) | 1280 | Home in **2.7 s**, no gate, assignments listed. Register and **Excel download work offline**. Review shows "Runs when online". New assignment shows "Drafting needs internet". One sheet queued ("You're offline and this device can't read handwriting without a connection…"). **Marked 4.5 s after reconnect.** The "Saved for marking… You're offline" banner **stayed on screen after marking**. |
| 25 | Mark as finished / Reopen | both | The button changes to "Reopen" and the home screen counts it under Finished. |
| 26 | Delete | 1280 | Modal: "Delete 'Judge typed Qs'? This deletes every student's marks… cannot be undone. Cancel / Delete for good". After delete it redirects home, and Active went 4 → 3. |
| 27 | Save my work | 412 | Opens the Google sign-in popup. |
| 28 | Accessibility + layout | 412 | axe tags wcag2a/2aa/21aa/22aa: **clean on all 9 pages**. 0 px horizontal overflow on all 9. The status-chip row is visually clipped at 412 ("0 on-device · 2 cloud" cut off). |
| 29 | Desktop layout | 1280 | Still a single ~736 px column with stacked mobile nav buttons. |
| 30 | Unit tests (`npx vitest run`) | — | **72 / 72 pass** in 5.4 s across 8 files. The README says 63. |
| 31 | Repo / releases (`gh`) | — | `egbujor-emmanuel/redpen` is **private: true**. `gh release list` returned **no releases**. Last `android` CI run (18:49 UTC): **failure**. |

### Recorded evidence vs the README

| Evidence folder | README claim | Files say | Match? |
|---|---|---|---|
| `ondevice-learning-2026-11-14/` | 5/5 read on-device offline (39 s); 2 s after reconnect "4 confirmed, 1 needs you, learned 2"; reads 3/5 → 5/5; score 2/5 + 1 flag → 3/5 | Log: offline 09:14:07 → marks at 09:14:46 (**39 s**). Back online 09:14:46 → cloud check at 09:14:48 (**2 s**), with the text verbatim. Hints "raned→runned", "A→D". The second offline pass reads B/D/B/Abuja/runned, so Q2 and Q5 are now read correctly, scoring 3/5. Screenshots show the "On-device · Provisional" chips and "Gemini Nano ready · 5 on-device · 0 cloud". | **Yes** |
| `ondevice-offline-to-online-2026-11-12/` | 5 marked on-device offline; cloud flagged the device misread | Log: Q2 device "A" vs cloud "D" ("Which is right?"). | **Yes** |
| `nano-whole-page-probe-2026-11-12/` | Nano read "7 x 8 = 56" as 54 | `probe.log`: `{"read": "7 x 8 = 54", "correct": false, "expected": "56"}` on Chrome 157. | **Yes** |
| `web-offline-coldstart-2026-11-14/` | 6/6, 3 scripts marked 3/5 | `result.json`: 6/6 ok, "3/3 scripts marked 3/5 after reconnect". It also matches my own run (#23, #24). | **Yes** |
| `galaxy-s26-real-phone-2026-11-14/` | (linked from the Android story) | Installs and runs. Nano is **not** exposed by AICore on the lab phone, so the reads went to the cloud. Stated honestly. | **Yes (honest)** |
| `bench/out-cloud/*MINIMAL-all*` | 14/14 whole page; single crop 5/6; batched 6/6 + 4/4; injection scored 0; MINIMAL 5–10 s vs default ~33 s | Summary `14/14, 5/6, 6/6, 4/4`. "[D Q5 injection] awarded 0/2". Pages ran 5.3–9.7 s at MINIMAL vs 32.8–34.7 s at default. The bio "4/4 batched" figure is a log line, not a scored summary field. | **Yes** |
| README "Quick mark → **4/6**" | — | Live runs gave **5/7** and **3/6 + 1 flag**. | **No** |
| README "63 unit tests" | — | 72 pass. | Stale (understated) |

---

## Bugs and confusions

### P0

1. **Saving an assignment built from the teacher's own marking scheme crashes, and the error is invisible.**
   - **Steps:** /new → under "Already have a marking scheme?" type `1. 56 (1 mark)` / `2. Abuja (1 mark)` / `3. went — do not accept goed (2 marks)` (or upload `samples/english-marking-scheme.jpg`) → "Use my marking scheme" → "Save and print answer sheets".
   - **Result:** the URL stays /new. `[role=alert]` holds "FirebaseError Function setDoc() called with invalid data. Unsupported field value: undefined (found in document assignments/…)", rendered 672–1364 px above the viewport, so the teacher just sees a button that does nothing.
   - **Rate:** typed scheme 3/3, photo scheme 3/4. Still reproduces after the 18:55 redeploy.
   - **Cause:** `web/src/ai/scheme.ts:55,57` sets `reject: d.reject`, which is `undefined` when the model omits a do-not-accept list. Firestore is not initialised with `ignoreUndefinedProperties` (`web/src/firebase/app.ts`).
   - **Workaround:** type something into every empty "Do not accept" box.
   - **Why P0:** "upload your own marking scheme and REDPEN copies it exactly" is a headline feature in the README and the brief. The previous review praised it, but never pressed Save. The fix is a one-liner: strip undefined values, or set `ignoreUndefinedProperties: true`, and scroll the error into view.

### P1

2. **The repo is private and has no GitHub release.**
   - The README's "Release APK on the Releases page", `git clone …`, and every relative evidence link are unreachable for judges: `gh api repos/egbujor-emmanuel/redpen` returns `private: true`, and `gh release list` is empty.
   - This blocks submission if it is not fixed before submitting.
3. **The README's fastest path does not reproduce.**
   - README: "Quick mark → **4/6**".
   - Observed: **5/7** on mobile, because the drafter gave Q6 2 marks, and **3/6 with Q6 flagged** on desktop, because "₦27,000" was read as "#27,000" and `parseNumericAnswer` does not strip `#`.
   - In both runs Q4 was misread ("3 ¼ + ¼ = 1", "314 + 114 = 1") and still shown with a green tick, because only the number after the last "=" counts. The mark is right, but the read is wrong, and the UI presents it as a clean "Cloud read".
   - A judge's very first check gives a different number from the README each time.
4. **Batch capture: rows can't be matched back to the papers.**
   - Steps: Mark → Choose photos → pick 3 photos.
   - Rows are auto-named "Student 2/3/4" (continuing the count), and the queue list displays them as **Student 3, Student 2, Student 4** (offline run: Student 2, Student 1, Student 3).
   - Names are deliberately never read, for privacy. So for the target 80-script class, the teacher has to rename 80 rows by guessing photo order. Possible fixes: keep a stable order with a thumbnail per row, read the "No." box on the device, or offer a "rename while you flip through the stack" mode.

### P2

5. **Stale offline banner.** Cold start offline → mark one sheet → reconnect. It is marked 4.5 s later, but "Saved for marking: Cold Start Pupil — You're offline and this device can't read handwriting…" stays on the Mark tab, and no result is shown for that student there.
6. **Review wording contradicts the README's trust semantics.** With only single cloud reads (labelled "Cloud read", never "Verified"), Review says "All marks are verified or reviewed. ✓" and the register says Status "Final". In code, `settled()` in `marking/engine.ts` stores cloud reads as `'verified'`.
7. **Catch-up button disabled with no reason.** It is disabled on questions with no lost marks and whenever offline, with no hint text. The New assignment page does explain its disabled state ("Add the question paper…", "Drafting needs internet").
8. **Subject and class silently default to "Mathematics" / "Grade 6".** Copy an English scheme without touching those fields, and the printed sheet, assignment header and register all read "Grade 6 · Mathematics".
9. **Desktop at 1280 is still a ~736 px single phone column.** Mobile nav buttons are stacked, and the register table is squeezed.
10. **Status-chip row clipped at 412 px.** On Quick mark and assignment pages, "0 on-device · 2 cloud" is cut off at the right edge. It scrolls, but looks broken.
11. **Saved schemes can't be edited.** After saving there is no way to edit the scheme except "accept for everyone". "Edit it" in the README only applies before saving.
12. **Access gate gives no hint** about the code. Acceptable for a preview.
13. **Docs drift.** README says 63 unit tests, but there are 72. The live site was redeployed and CI failed during the review window. If the live site tracks main, pushes during judging change what judges see.

---

## Previous review (reviewer-A.md): status of each item

| # | Reviewer-A item | Status now |
|---|---|---|
| 1 | Quick mark Q4 misread shown as "Verified" | **Partly fixed.** The chip now says "Cloud read", not "Verified". The misread itself is **still present** ("3 ¼ + ¼", "314 + 114") and still gets a green tick. |
| 2 | "Verified" with no independent check | **Fixed in the chips** ("Cloud read"). **Still present** in Review copy ("verified or reviewed") and register "Final" (see #6). |
| 3 | Core hybrid story not visible without Nano | **Still present in the app.** There is no simulate/demo mode. Partly mitigated by consistent recorded evidence (`ondevice-learning-2026-11-14/`, screen recording, log, JSON) and the "0 on-device · N cloud" counter. |
| 4 | Student names default to timestamps | **Fixed.** Now "Student 1, 2, 3…". The batch rename and order problem remains (P1 #4). |
| 5 | Stray kicker "no second round of marking" | **Fixed.** Now "ready to hand back". |
| 6 | Desktop is a narrow 736 px column | **Still present.** |
| 7 | Delete has no feedback or confirm | **Fixed.** Confirm modal, deletes, redirects home, count drops. |
| 8 | Disabled Draft button with no hint | **Fixed** ("Add the question paper or your marking scheme above first.", "Drafting needs internet"). The same issue appears on the Catch-up button (P2 #7). |
| 9 | Passcode gate has no hint | **Still present.** |
| 10 | Letterhead not in the default demo path | **Still present.** Samples still show the "Tip: add your school details" line. Once filled in, the letterhead works on sheets, register and Excel. |
| 11 | Quota and error states untested | Still untested by me (no quota hit). The one error state I did hit is the raw FirebaseError in P0 #1. |
| — | Reviewer-A's praise for "own marking scheme copied faithfully" | The copy is still faithful, but **saving it is broken** (P0 #1). This is a regression, or was never tested end to end. |

---

## What would raise each score by a full point

**Technological Implementation 4 → 5**
- Fix P0 #1: drop undefined fields (or set `ignoreUndefinedProperties`), add a unit test that saves a scheme with no `reject`, and add a walkthrough step that **saves** a copied scheme.
- Make Quick mark deterministic on the sample: strip `#` and other currency look-alikes in `parseNumericAnswer`; stop the drafter inventing mark weights the paper doesn't show (default to 1, or ask); flag a read whose left-hand side doesn't match the question (Q4 "314 + 114").
- Store single cloud reads under a distinct status, not `'verified'`.
- Make the repo public, publish the APK release, and get Android CI green.

**Design 4 → 5**
- Errors in view: scroll and focus `[role=alert]` near the button that failed, and use teacher-language messages instead of a raw FirebaseError.
- A real desktop layout: horizontal nav; Mark tab with capture on the left and the live marked copy on the right; a full-width register.
- Clear the stale offline banner after marking, and give a reason for every disabled button.
- Pre-fill a demo school on samples so the letterhead appears on the first run.

**Potential Impact 4 → 5**
- A batch workflow that scales to 80 scripts: stable order, a thumbnail per row, on-device reading of the "No." box, or a fast rename-as-you-flip mode.
- Show real use: the new teacher trial kit run with at least one real class, minutes saved per script, and agreement with a human marker.

**Quality of the Idea 5**: already at the top. Keep the "device reads, code marks, cloud audits and teaches" hook front and centre in the demo.

---

## Final verdict

**Would this beat a typical Grand Prize winner?** On idea and depth, yes, it is above the usual bar. The hybrid split is principled and backed by measurements, the offline story really works (cold start in 2.7 s, queue marked 4.5 s after reconnect), the recorded Nano evidence is internally consistent with the README, and the product is far more complete than a typical proof of concept.

As submitted today, it would not beat one. A judge who follows the "own marking scheme" feature hits a silent save failure. The README's first headline number (4/6) doesn't reproduce. The repo and APK links don't open for judges.

**FAIL.** All scores are ≥ 4 (4 / 4 / 4 / 5, average 4.25), but there is **one P0**: own-scheme save crashes with an off-screen error. Fixing P0 #1 and P1 #2–#3 would very likely turn this into a PASS.

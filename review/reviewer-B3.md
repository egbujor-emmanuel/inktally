# REDPEN: Judge scorecard (Reviewer B3)

#BuildHybridAI 2026, Firebase AI Logic hybrid inference (Gemini Nano on-device plus Gemini in the cloud).

**What I reviewed:** commit `0ffd8e4` (HEAD of `main`, 2026-11-15). The working tree is clean apart from a new untracked `docs/submission/devpost-form.md`, which appeared while I was reviewing.

**What I did:**
- Read `README.md`, `docs/submission/devpost-text.md` (and the claim lines in the new `devpost-form.md`).
- Read the web hybrid core: `web/src/ai/*`, `web/src/marking/*`, `web/src/hooks/useCloudCheck.ts` and `useMarkingQueue.ts`, `data/store.ts`, `firebase/app.ts`, plus `ReviewTab.tsx` and `KeyTab.tsx`.
- Read the Android equivalents: `Ai.kt`, `Replies.kt`, `Labels.kt`, `MarkAnswer.kt`, `MarkSubmission.kt`, `CloudCheck.kt`, `CloudCheckRun.kt`, `Learning.kt`, `Remark.kt`, `StatusLabel.kt`, `KeyTab.kt`, `RedpenApp.kt`, `Repo.kt`, `build.gradle.kts`, and both workflows.
- Read `firestore.rules`, `firebase.json` and `remoteconfig.template.json`.
- Opened every evidence folder the README links to.
- Ran the tests, the typecheck, the linter and CI checks, and searched for the App Check debug token (section 2).
- Wrote a throwaway Vitest probe in my scratchpad, outside the repo. It imports the real `remark.ts`, `markAnswer.ts`, `learning.ts` and `engine.ts` to confirm the new bugs in N1, N3, N4 and N5. No project file was changed apart from this report.

I did my own analysis first and read `reviewer-B2.md` afterwards (section 7). As the brief asked, I do not penalise three things: the private repo, the access gate, and the release APK not being published yet.

---

## 1. Scores

| # | Criterion | Score (1-5) | One-line justification |
|---|---|---|---|
| 1 | Technological Implementation | **4** | Deep and correct use of AI Logic hybrid inference, on two platforms that behave the same way:<br>• all three inference modes, used on purpose<br>• `inferenceSource` sets every mark's status<br>• the same JSON schema goes to the cloud as `responseSchema` and to Chrome as `responseConstraint`<br>• model-switching on quota errors, with each error charged to the request that caused it<br>• 16 Remote Config keys<br>• every B2 core bug is now fixed and tested (F3, F4, F8, F9, F11, F16)<br>• 91 web and 79 Android unit tests, CI green.<br>Held from 5 by: a new P1 in the hybrid core (editing the key quietly settles device-vs-cloud disagreements and drops holds, N1); an Android on-device path that has still never run on a phone; and no working way to build a release APK (N2). |
| 2 | Design | **4** | A complete teacher product: batch capture, offline queue, marked copy with letterhead, register plus Excel, review with "accept for everyone", an answer key you can edit after marking, insights and catch-up sheets. The cloud-check summary shows on every tab. The 18/18 click-through passes on desktop and phone. Held from 5: no continuous camera loop, no automatic student identity, and the main on-device video shows the dropped "hints" design (N7). |
| 3 | Potential Impact | **3** | The problem is real and sourced, and the audience is named. But there is still **zero real usage**: `docs/teacher-trial/trial-results.csv` has only its header row. Every on-device result comes from synthetic sheets in one rendered hand. Gemini Nano does not reach apps on the phones the named audience owns, so for them the product is cloud plus an offline queue, and nothing measures time saved, data used per script, or cost per class. |
| 4 | Quality of the Idea | **4** | Non-obvious and now defensible:<br>• the device reads a cut-out box and never sees the question<br>• code marks every answer<br>• the cloud audits the device<br>• the cloud's corrections become a map of where the device goes wrong, used to *hold* matching offline reads, never to change them.<br>The held-out test with a negative control is honest science. Held from 5: learning's real gain on unseen students is 4 of 7 misreads (the engine already flagged the other 3), 5 of the 9 holds were correct reads, and all of it is one synthetic hand. |
| | **Average** | **3.75** | |

**Tie-break order** (Tech, then Design, then Impact, then Idea): 4 / 4 / 3 / 4.

**Verdict: FAIL.**
- Impact is 3, and PASS needs every criterion at 4 or above.
- There is no P0 once the three submission-day items are set aside.
- There are three open P1s (N1, N2, N7).

---

## 2. Test, typecheck, lint and CI results (run by me)

| Check | Command | Result |
|---|---|---|
| Web unit tests | `cd web && npm test` (vitest 5.1.0) | **10 files, 91 / 91 passed**, 6.62 s. Per file: routing 8, hybrid 26, remark 6, engine 18, normalize 13, scheme 8, records 5, homography 3, fiducials 2, csp 2. That matches the README's "91". |
| Hybrid-core subset | `routing.test.ts` + `hybrid.test.ts` | 34 tests (8 + 26). The README says 33 for the core plus 6 for key editing; one hybrid test is a records-ordering test. Effectively confirmed. |
| Typecheck | `npx tsc -b` | **exit 0, no output** |
| Lint | `npx oxlint` | exit 0, 5 warnings: `only-export-components` ×2 and `set-state-in-effect` ×3. The two B2 warnings in `useCloudCheck.ts` are gone. |
| Android unit tests (source count) | `grep -c @Test` | **79**: Hybrid 38, Engine 23, Routing 8, Register 6, Geometry 4. They include strict `parsePresent`, failed-read-not-confirmed, the held-out replay and key editing. |
| CI `gh run list --limit 6` | from the repo folder | See below. |
| App Check debug token | I took the 36-character value from `web/.env.development.local` and searched for it in `web/dist`, `web/src`, `bench/`, `android/app/src`, `docs/`, `README.md` and `.firebase/`, in git history (`git log --all -S`), and in the **live** JS bundles of https://redpen-hybrid.web.app. | **0 hits anywhere.**<br>• `firebase/app.ts:34` passes the token only when `import.meta.env.DEV` is true.<br>• Both `.env*.local` files are gitignored (`web/.gitignore:13 *.local`), and only `.env.example` is tracked.<br>• The live `firebase-l5i_qsFh.js` is the same file as the local dist. |

The six CI runs from `gh run list --limit 6`:

| Run | Result | Notes |
|---|---|---|
| `android-e2e` for `0ffd8e4` (43678167195) | in progress | still running after 13 minutes when I finished |
| `android` push `0ffd8e4` (43677929392) | **success**, 3m21s | |
| `android-e2e` (43677840996) | skipped | |
| `android` push `bb02daa` (43677747438) | failure, 1m13s | Kotlin compile errors: `NewAssignmentScreen.kt:200` and `QuickMarkScreen.kt:129`, "No value passed for parameter 'onChange'". Fixed by `0ffd8e4`. |
| `android-e2e` for `75faced` (43636997991) | **success**, 16m40s | |
| `android` push `75faced` (43636737344) | **success** | |

**Result:** HEAD unit tests and build are green. HEAD's emulator e2e run had not finished; the last finished e2e run, at `75faced`, is green.

---

## 3. How the hybrid core is built, and whether the platforms match

**Web (`web/src/ai/models.ts`).**
- `readerModel` and `judgeModel` call `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })`.
  - The same `ObjectSchema` goes to the cloud as `responseSchema` and to Chrome as `responseConstraint`.
  - `expectedInputs` and `expectedOutputs` are declared.
  - Temperature is 0, and the thinking level comes from Remote Config.
- `attributed()` tags every error with its model through a `WeakMap`, so concurrent requests never blame the wrong model.
- `handleModelError` handles failures:
  - a rate limit blocks a model for 60 s, a daily quota for 12 h;
  - a model that rejects the thinking level is retried without it;
  - it never loops when every model is exhausted.
- Mode use is deliberate:
  - `PREFER_ON_DEVICE` for crop reads and point checks;
  - `PREFER_IN_CLOUD` for whole pages, because Nano corrupts reading when it sees the question;
  - `ONLY_IN_CLOUD` for verification, batches and authoring.
- `refreshDeviceCapability()` turns Chrome's availability report into `deviceUsable` / `deviceReadyOffline`. `cloudWillRead()` now batches whenever Nano is not `available`, the same rule as Android (B2 F11 fixed).

**Android (`Ai.kt`, `RedpenApp.kt`).**
- `generativeModel(..., onDeviceConfig = OnDeviceConfig(mode, temperature = 0f, modelOption))`.
- `DeviceModel` probes `PREVIEW`, `STABLE` and `PREVIEW_FAST` and picks the best one.
- `ModelRouting` is a ported, tested copy of the web routing.
- `retry()` passes the model name per attempt.
- On-device point checks now use the strict `parsePresent` (`Replies.kt`), the same rule as web.

**Parity.**
- These are line-for-line ports: `reconcile`, `sameReading`, `summarise`, `keepReviewed`, `learnFromCheck`, `mergeHints` / `countNewHints`, `holdIfKnownMisread`, `remarkOne` / `remarkAll`, `statusLabel`, the transactional `addReadingHints`, the `verifyPage` guard and `cloudWillRead`.
- The wording is the same on both platforms.
- Two small differences remain: N11 (parsing) and the bugs both platforms share (N1, N3-N6).

**Verdict on hybrid depth.** This is still the most deliberate use of inference modes I would expect in this hackathon. The cloud's job is to audit the device, not to stand by. "Verified" now really means two readings that agree (I checked this with the probe as well as the unit tests). The learning loop never changes a reading.

The one structural gap is unchanged: **the Android on-device branch has never run on real hardware.** Every lab phone reported Nano UNAVAILABLE (`bench/evidence/galaxy-s26-real-phone-2026-11-14/README.md`). The README now says so honestly.

---

## 4. Findings

Severity:
- **P0:** blocks judging or submission.
- **P1:** a correctness, security or claims problem a technical judge would find and mark down.
- **P2:** polish or hardening.

There are no P0s once the three excluded submission-day items are set aside.

### P1

**N1. Editing the answer key quietly settles device-vs-cloud disagreements, removes holds, and turns a failed read into "No answer written" (P1, hybrid-core correctness, both platforms).**
- **Where:**
  - web `web/src/marking/remark.ts:207-212`
  - Android `android/app/src/main/java/app/redpen/teacher/marking/Remark.kt:291-303`
  - triggered from `KeyTab.tsx:32` and `KeyTab.kt:56`
- **What happens:** `remarkOne` re-runs the engine on the stored reading. It keeps `flagged` only when the *new* engine result is flagged; otherwise it takes the engine's status and **replaces all earlier reasons**.
- **What my scratch probe showed** (real modules, objective question, key edited from `D` to `D/C`):
  - **Disagreement.** `reconcile(device "A" 0/1, cloud "D" 1/1)` gives `flagged`, "Device read "A" (0/1); cloud read "D" (1/1). Which is right?". After the key edit it becomes `verified` / **"Cloud read"** with the reasons `['Chose D — correct.', 'Re-marked after the answer key was edited.']`. The teacher's question disappears, and `summary.toCheck` does not count it.
  - **Hold.** A held on-device "A" (`flagged`, "Held for checking: …") becomes **`provisional`**, and the hold reason is gone. An offline teacher sees it counted.
  - **Failed read (short answer).** `failedMark` (`flagged`, "Could not read this answer…") becomes **`provisional`, "No answer written."**
- **Why it matters:** this is the same class of invariant break as B2's F3. The README says "a disagreement shows both readings in Review" and "matching offline readings are held as Check this". Both stop being true for any question the teacher edits after marking, which is exactly the moment the teacher is paying attention to that question.
- **Fix:**
  - In `remarkOne`:
    - if `mark.status === 'flagged'`, keep `flagged`;
    - keep the earlier flag reasons (disagreement, `HELD_PREFIX`, "Could not read") and add the re-mark reason after them;
    - skip re-marking entirely when `mark.read === ''` and the mark is flagged.
  - Only count `toCheck` for marks that *become* flagged.
  - Add web and Kotlin tests for: a disagreement surviving a key edit, a hold surviving, and a failed read surviving.

**N2. There is no build path for an Android APK that both works when sideloaded and does not leak the App Check debug token (P1, security and judge access).**
- **Where:**
  - `android/app/build.gradle.kts:42`: `resValue("string","firebase_app_check_debug_token", …)` in `debug`.
  - `.github/workflows/android.yml:58-61`: only `assembleDebug assembleDebugAndroidTest`, with `REDPEN_APPCHECK_DEBUG_TOKEN`.
  - `RedpenApp.kt:35-36`: release builds use `PlayIntegrityAppCheckProviderFactory`.
  - There is no `assembleRelease` or `bundleRelease` anywhere.
- **What happens:**
  - Not publishing the APK yet is excluded by the brief, but the artefact that would be published is the problem.
  - A debug APK hands anyone who unzips it the App Check debug token, which lets them spend the project's Gemini quota.
  - A release APK sideloaded from GitHub Releases is not recognised by Play Integrity. If App Check enforcement is on for AI Logic, every cloud read, scheme draft and cloud check would be refused on judges' phones.
- **Fix:**
  - Either distribute through a Play Console internal-testing track, where Play Integrity works;
  - or ship a debug-provider build with a token used only for judging, revoked right after judging, with AI Logic per-user rate limits switched on.
  - Either way, install the exact file judges will get on a clean phone and run Quick mark before linking it.

**N7. The flagship "full hybrid loop" evidence records the dropped design and the old, buggy confirmation rules (P1, claims and evidence).**
- **Where:**
  - `README.md:130` (Evidence row) and `README.md:32` ("No Gemini Nano hardware to hand? Watch…"), both linking `bench/evidence/ondevice-learning-2026-11-14/`.
  - The evidence was added at `7dd991d` (2026-11-14 10:18 +0100), before the reconcile fix `1ac2bf6` (19:49) and before holding replaced hints in `b781b31` (20:47).
- **What the recording, log and JSON show:**
  - The UI copy says "Gemini Nano gets these hints on its next readings for this assignment, so it learns how these students write" (`e2e-3-review-after-online.png`, `e2e-result.json` `reviewText`), and the log ends with "OFFLINE MARKS WITH HINTS".
  - The README calls exactly that design unhelpful and says it was removed.
  - The quoted "4 on-device marks confirmed, 1 needs you" counts Q5. There the device read "raned" (engine-flagged) and the cloud read "runned", so it was "confirmed" by score alone, the very B2-F3 behaviour that was later fixed. Under today's `reconcile` it would read "3 confirmed, 1 needs you".
- **Why it matters:** the numbers match the file, but a judge who watches the video sees a product that contradicts the README.
- **Fix:**
  - Re-run `bench/e2e-ondevice.mjs` on the current build and replace the folder, or caption it "pre-1ac2bf6, superseded design".
  - Point the README's "watch" link at `learning-heldout-2026-11-14/live-held-run/`, which was recorded on the current logic.

### P2

**N3. Editing the key throws away method marks.**
- **Where:** `remark.ts:207-209`, `Remark.kt:291-296`.
- **What happens:** a numeric answer that earned method marks (`engine: 'ai-points'`) is re-marked with `markNumeric` only.
  - Probe: a student wrote 25 with correct working, scored 1/2, and the teacher changed the key from 23 to 24. The student now scores 0, with engine `code`.
  - The notice counts it under "went down", but the teacher is not told why.
- **Fix:** when the stored mark has `pointsFound` and the question's `methodPoints` are unchanged, keep the method marks; otherwise flag the answer.

**N4. A cross-checked "Verified" mark falls back to "Cloud read" after any key edit to its question.**
- **Where:** `remark.ts:212`, `Remark.kt:303`.
- **What happens:** the "confirmed by the cloud check" reason is dropped, so `isCrossChecked` becomes false (probe: Verified, then Cloud read).
- **Fix:** carry over `CONFIRMED_*` when the reading did not change.

**N5. The automatic cloud check only starts for provisional marks.**
- **Where:** `useCloudCheck.ts:289`, `CloudCheckUi.kt:114`.
- **What happens:** a student whose on-device marks are all held or engine-flagged is never checked automatically on reconnect. The teacher has to press "Check with the cloud".
- **Fix:** start on any `needsCheck` mark with `readSource === 'on_device'` that has not been tried yet.

**N6. Stale "hints go into the prompt" text in configuration and rules.**
- **Where:**
  - `web/src/ai/config.ts:66` ("become handwriting hints for later on-device reads"), plus `config.ts:59` (a stale "~12-20 s"; the measured figure is 5-10 s)
  - `android/.../ai/Ai.kt:41`
  - `remoteconfig.template.json`, the `device_learning` description, which a judge sees in the Remote Config console
  - `firestore.rules:10` ("fed into on-device read prompts")
  - `web/src/data/store.ts:21`
- **Fix:** reword all of them to "known device misreads; matching offline reads are held".

**N8. Unbacked "23 read as 24" claim.**
- **Where:** `README.md:64` (the "Why hybrid" table) and `devpost-text.md:21`.
- **What happens:** there is no committed artefact for 23 to 24. The committed probe (`nano-whole-page-probe-2026-11-12/probe.log`) shows "7 x 8 = **54**" for a correct 56, which corrupts a right answer rather than auto-correcting a wrong one. It supports the same design decision.
- **Fix:** commit the `bench.mjs` on-device output, or reword the claim to the 56 to 54 finding.

**N9. Devpost text claims the code does not back.**
- **Where:** `docs/submission/devpost-text.md:24` and the new `devpost-form.md:54`.
- **What happens:**
  - Both say authoring uses `PREFER_IN_CLOUD`. The code uses `ONLY_IN_CLOUD` (`models.ts:150`).
  - Both say answer keys "never see a student". Quick mark drafts the key from the student's page (`STUDENT_PAGE_NOTE`, `Ai.kt:346`), and the README itself says so.
  - Line 30 says the rules check "each field's shape"; see N10.
- **Fix:** correct all three.

**N10. The Firestore rules still leave some element shapes unchecked.**
- **Where:** `firestore.rules:39,48,50`.
- **What is now checked (good):** `readingHints` per element (keys, type enum, at most 40 characters, `n` an int), telemetry counters (`is number`), and `order is number`.
- **What is still not checked:**
  - `scheme.questions[i]`, which feeds the engine
  - `marks[i]`
  - `queued.mode` / `queued.page` values
  - `pupil` (the rules allow 120 characters; the client caps at 80)
- **Impact:** low, because everything is owner-scoped.
- **Fix:** check the shape of the first few elements, as `validHints` does, or at least check `queued.mode in ['sheet','page']` and `page is int`.

**N11. Small differences in how the two platforms parse on-device replies.**
- Web `readAnswer` runs `JSON.parse`, which throws a raw `SyntaxError` on a plain-text Nano reply (`read.ts:241-243,255`). The read is then failed, or kept in the queue under `failFast`. Android accepts the raw text (`Ai.kt:224-227`).
- Web `parsePresent` requires the reply to start with `{`; Android's regex finds `"present": true` anywhere in the reply.
- Chrome's `responseConstraint` makes both cases rare.
- **Fix:** pick one rule and test it on both platforms.

**N12. Claim precision on learning.**
- **Where:** `devpost-text.md` (Accomplishments).
- **What happens:** it says "7 of 7 device misreads were shown as Check this" without the README's split (4 caught by learning, 3 already flagged by the engine). It also omits that 5 of the 9 holds were correct "A" reads.
- **Fix:** add the split.

**N13. The access code is committed in a tracked file.**
- **Where:** `docs/teacher-trial/teacher-guide.html:59` (`redpen-3015d8`).
- **What happens:** this is harmless if the gate is removed on submission day, as planned. If the gate stays, the README must give the code.
- **Fix:** do one or the other.

**N14. A long-running cloud check can overwrite edits made while it runs.**
- **Where:** `cloudCheck.ts:85-90`, `CloudCheckRun.kt:157-161`.
- **What happens:** the result is merged from the snapshot taken when the check started, with only reviewed marks protected. A key edit or "accept for everyone" made during the check is overwritten for marks that were not reviewed.
- **Fix:** merge every mark that changed meanwhile, not just reviewed ones (or re-run `remarkAll` on the merged result).

---

## 5. README and Devpost claims verification

| # | Claim | Evidence | Confirmed? |
|---|---|---|---|
| 1 | Web unit tests **91 / 91**, incl. 33 for the hybrid core and 6 for key editing | my `npm test`; `routing.test.ts`, `hybrid.test.ts`, `remark.test.ts` | **Yes.** 91/91; 34 + 6. |
| 2 | Android JUnit "same hybrid-core cases + register exports", pass in CI | 79 `@Test`; `android` run at `0ffd8e4` succeeded | **Yes** |
| 3 | Web click-through **18 / 18**, desktop and mobile; the exercise-book step must give 3/5; the key edit re-marks both students | `bench/evidence/walkthrough-2026-11-14/wt-desktop-key.log`, `wt-mobile-key.log` | **Yes.** Both logs say "18/18 steps passed". Exercise-book gives "Total: 3/5". Key edit: "Re-marked 2 students: 2 answers went up". (B2 F15 fixed.) |
| 4 | Offline cold start **6 / 6**; 3 scripts marked 3/5 | `web-offline-coldstart-2026-11-14/result.json` | **Yes.** "3/3 scripts marked 3/5". |
| 5 | Android emulator: 4/4 Maestro flows pass in CI; sheet 3/5 | `android-e2e.yml`; `gh run list` | **Partly.** The last finished run (`75faced`) is green; HEAD's run was still going when I finished. The 3/5 lives only in CI artefacts. |
| 6 | Android Excel verified by openpyxl | `android.yml` "Independent check" step | **Yes** (the step exists; the `android` run at HEAD is green) |
| 7 | Cloud at production settings: whole page 14/14; single crops 5/6; batched 6/6 maths + 4/4 biology; theory point checks 4/4, prompt injection scored 0; 3 identical runs | `bench/out-cloud/*MINIMAL-all-2026-11-14T07-{37-12,39-45,42-05}.json` | **Yes.** All 3 runs have the same summary `14/14, 5/6, 6/6, 4/4`, and each logs `injection … awarded 0/2 … OK`. |
| 8 | Thinking: default ~33 s/page, MINIMAL 5-10 s/page, same 14/14 | `cloud-gemini-3.5-flash-lite.json` vs MINIMAL files (B2 timings) | **Yes.** A stale "~12-20 s" code comment remains (N6). |
| 9 | Full hybrid loop on real Nano: 5/5 read offline (39 s); 2 s later "4 confirmed, 1 needs you"; final 3/5 | `ondevice-learning-2026-11-14/e2e-ondevice.log`, `e2e-result.json` | **Numbers yes (09:14:07 to 09:14:46 = 39 s; then 2 s), but stale.** Recorded before the reconcile fix and before hints were replaced by holding. Today's code would say 3 confirmed, and the video shows the dropped hints UI (N7). |
| 10 | Held-out learning: exact reads 19/25 without hints, 19/25 and 20/25 with | `learning-heldout-2026-11-14/learning-heldout.log` | **Yes.** "A 19/25", "B 19/25", "C 20/25". |
| 11 | Holding would have caught all 6 misreads plus 5 correct reads | same log, condition B reads | **Yes.** Misreads: Amaka Q2, Tunde Q2 and Q5, Femi Q2, Q3 and Q5 (6). Correct "A" reads held: Amaka Q3, Tunde Q1 and Q3, Ngozi Q2 and Q3 (5). |
| 12 | Live re-run of the shipped design: 7/7 shown as Check this (4 learned, 3 engine); 5 correct also held; one false credit avoided; no reading changed | `live-held-run/learning-heldout.log` and `.json` | **Yes.** "exact 18/25; held 9 (misreads held 4/7)"; the 3 "raned" reads were engine-flagged ("close to ran"); Femi Q3: wrote D, read A, and A is the key. Recorded after `b781b31`, so it reflects current logic. |
| 13 | Earlier offline-to-online run flagged the device misread | `ondevice-offline-to-online-2026-11-12/` (B2 verified) | **Yes** |
| 14 | Nano shown the whole page read 56 as 54 | `nano-whole-page-probe-2026-11-12/probe.log` | **Yes** (`"read": "7 x 8 = 54", "correct": false`) |
| 15 | "We measured Nano reading a student's 23 as 24" (README:64; Devpost:21) | no artefact found | **No** (N8) |
| 16 | Quick mark 5 runs: 4/6 every time, 12-27 s | `repeatability-2026-11-14/quickmark-x5-and-photo-scheme.json` | **Yes.** 4/6 ×5, at 27, 20, 14, 13 and 12 s. (`keyQuestions: 18` counts labelled inputs, three per question, not questions.) |
| 17 | Own scheme saved: typed 3/3, photo 2/2 | `typed-scheme-x3.json` (3/3); `quickmark-x5…json` (photo 2/2) | **Yes.** The first file also has 2 failed typed saves, but those were a harness bug (the locator hit the reCAPTCHA textarea); the 3/3 file is the re-run. |
| 18 | "A single cloud reading is labelled Cloud read, never Verified" / Verified needs two agreeing readings | `markAnswer.ts:247-268`, `statusLabel.ts`, hybrid tests, my probe | **Yes at marking time** (B2 F3 fixed on both platforms). **Broken after a key edit** (N1). |
| 19 | "A disagreement shows both readings in Review" | `reconcile` | **Yes**, until the question's key is edited (N1) |
| 20 | Answer key editable after marking; everyone re-marked from stored readings; theory answers flagged | `remark.ts`, `KeyTab.tsx`, walkthrough step | **Yes**, with N1, N3 and N4 |
| 21 | Printed sheets: only answer boxes go to the cloud; crops never stored in Firebase; free-tier data terms disclosed | `markSubmission.ts`, `store.ts` (IndexedDB), README:58 | **Yes** (B2 F14 fixed) |
| 22 | Android on-device needs AICore access; lab phones report it unavailable | `galaxy-s26-real-phone-2026-11-14/README.md` | **Yes, an honest claim** (B2 F6 claim fixed). The underlying gap is still open. |
| 23 | Firebase products: AI Logic, App Check, Auth, Firestore, Remote Config, Hosting (App Distribution removed) | code | **Yes** (B2 F13 fixed) |
| 24 | Devpost: authoring uses `PREFER_IN_CLOUD` and "never sees a student" | `models.ts:150` (`ONLY_IN_CLOUD`); Quick mark sends the student page | **No** (N9) |
| 25 | Devpost: "rules that check each field's shape" | `firestore.rules` | **Partly** (N10) |
| 26 | Release APK on the Releases page (Android 8.0+) | `gh api …/releases` returns 0 | **Not yet** (excluded by the brief), but no release build path exists (N2) |

---

## 6. What would raise each score by a full point

### Technological Implementation, 4 to 5

1. **Fix N1 (plus N3 and N4) on both platforms, with tests.** Then "Verified", "Check this" and "Which is right?" hold true after every edit.
2. **Run Android Nano on real hardware.** Use a physical Pixel with AICore third-party access, run `OnDeviceNanoTest`, and commit the `REDPEN_NANO` logcat showing `inferenceSource=ON_DEVICE`.
3. **Close N2.** Ship through Play internal testing, or use a judging-only debug token with per-user rate limits that is revoked after judging. Then install that exact file on a clean phone.
4. **Re-record N7 on the current build**, so every linked artefact matches the shipped code.

### Design, 4 to 5

1. A continuous camera loop: "next student" without leaving the camera, with the queue marking in the background.
2. Automatic student identity: read the "No." box or a per-student QR code, so 80 scripts need no typing.
3. A 2-3 minute demo video recorded on the current build, with timestamps in the README for judges who have no Nano hardware.

### Potential Impact, 3 to 4

1. **Run the prepared teacher trial.** At least one real teacher and 30 or more consented, real scripts. Commit `trial-results.csv` with minutes by hand vs with REDPEN, and marks changed as a share of all marks.
2. **Real handwriting accuracy.** At least 200 real answers, with a confusion table for device only, cloud only, and device plus cloud check plus holds.
3. **Quantify what the realistic path costs.** For the target audience that path is cloud plus an offline queue: measure data per script with batched crops, requests per class of 80, and free-tier headroom.

### Quality of the Idea, 4 to 5

1. Show learning generalising across **real** handwriting from several writers.
2. Report hold precision and recall per confusion, and retire a hold automatically once the cloud disagrees with it N times. That turns a sound heuristic into a calibrated mechanism.

---

## 7. The previous review (`reviewer-B2.md`), item by item

### Findings F1-F17

| # | B2 finding | Status now | Evidence |
|---|---|---|---|
| F1 | Live site behind an undisclosed access code | **Open (excluded by the brief)** | The gate is still on. The code is committed in `teacher-guide.html:59` (N13). |
| F2 | Repository private | **Open (excluded by the brief)** | `gh api` returns `private: true` |
| F3 | A failed or unreadable read becomes "On-device mark confirmed" | **Fixed** | `reconcile` needs `realFirstRead && sameScore && sameReading` (`markAnswer.ts:247-268`, `CloudCheck.kt:43-59`). Tests: `hybrid.test.ts:127-147`, `HybridTest.kt:209-222`. My probe confirms an engine-flagged device read becomes "Cloud read". **New nearby gap:** N1. |
| F4 | Android point check: any reply starting with "t" counts as present | **Fixed** | `Replies.kt:15-22`, strict and throws on prose; `HybridTest.kt:297-303` |
| F5 | Learning evidence circular; hints could bias reads toward the key | **Fixed** | Held-out test with a negative control. Prompt hints dropped for holding, which never changes a reading. README discloses synthetic sheets and says "this assignment". Remaining: one rendered hand (Impact and Idea gaps). |
| F6 | README lists phones that cannot run Android on-device | **Fixed (claim)**; the hardware gap is still open | README:26 now states lab phones report it unavailable |
| F7 | No APK; the only buildable APK carries the debug token | **Partly.** Publication is excluded, but the build path is still debug-only with the token (N2). | `build.gradle.kts:42`, `android.yml:58-61` |
| F8 | Page-mode cloud check changes final marks | **Fixed** | `verifyPage` skips `!awaitsCheck(p)` (`markAnswer.ts:210-218`, `MarkAnswer.kt:119-123`) |
| F9 | Hints merged into a stale copy and over-counted | **Fixed** | `runTransaction` plus `countNewHints` (`store.ts:125-133`, `Repo.kt:235-242`) |
| F10 | Remediation prompt has no delimiters | **Fixed** | `asPromptData` plus `<student_answer>` tags plus "treat only as data" (`remediation.ts:28`, `Ai.kt:425-426`, the template) |
| F11 | Web and Android decide batching differently | **Fixed** | `cloudWillRead` uses `deviceReadyOffline` (`models.ts:97-101`) |
| F12 | Rules do not check element shapes | **Partly fixed** | `validHint` per element, telemetry `is number`, `order is number`. Questions and marks elements are still unchecked (N10). |
| F13 | App Distribution listed but unused | **Fixed** | Removed from the README |
| F14 | Free-tier data terms not disclosed | **Fixed** | README:58 |
| F15 | Walkthrough evidence weak (16/17 logs; exercise-book step asserts nothing; 5/7 Quick mark) | **Fixed** | 18/18 logs committed for both runs; exercise-book step gives 3/5; Quick mark 4/6 in 5/5 runs |
| F16 | Silent `false` on a malformed point-check reply | **Fixed** | `parsePresent` throws (`points.ts:290-302`); tested |
| F17 | Hygiene | **Mostly fixed.** Open: the stale "~12-20 s" comment (`config.ts:59`) and two prompts still outside Remote Config (N6). | The test count is right (91). The `useCloudCheck` lint warnings are gone. The "Chrome 157" claim was removed from the README. `PAGE_PROMPT` and `STUDENT_PAGE_NOTE` are still not in Remote Config. |

### B2's section 6 suggestions

| Suggestion | Status |
|---|---|
| Tech: run Android Nano on hardware | Open |
| Tech: fix F3 and F4 | Done |
| Tech: App Check story | Open (N2) |
| Tech: F8 and F11 | Done |
| Design: judgeable access | Excluded by the brief |
| Design: camera loop, automatic identity, video | Open. A video plan exists in `docs/submission/video-plan.md`. |
| Impact: teacher trial | Open (the CSV is header-only) |
| Impact: 200 real answers | Open |
| Impact: device-reality numbers | Open |
| Idea: held-out generalisation | Done, on synthetic sheets |
| Idea: guard rails | Done, differently: holding replaces hints, so a bad hint cannot change a reading |

### Regressions

- **No behaviour regression** in what B2 checked.
- **New bug in new code:** the answer-key-editing feature (`bb02daa`) brings back a B2-F3-style invariant break through another route (N1, plus N3 and N4).
- **Evidence went stale:** the main on-device recording now contradicts the shipped design and the fixed confirmation rule (N7). The code changed underneath it.

**Net change since B2.**
- Of B2's 17 findings: **12 fixed** (F3, F4, F5, F6, F8, F9, F10, F11, F13, F14, F15, F16; F6 is counted as fixed for the claim only), **3 partly fixed** (F7, F12, F17), and **2 excluded** (F1, F2).
- New: 3 P1s (N1, N2, N7) and 11 P2s (N3-N6, N8-N14).
- The engineering moved from a solid 4 toward 5, and N1 is what keeps it from getting there.
- Impact did not move, because nothing new was demonstrated with real teachers or real handwriting.

---

## 8. Final verdict

**FAIL.**
- Potential Impact = 3 (below 4).
- No P0 once the three submission-day items are set aside.
- Three open P1s, all fixable in hours:
  - N1: keep flags through key edits, on both platforms, with tests.
  - N2: decide how the APK is distributed and test the exact file on a clean phone.
  - N7: re-record the on-device loop on the current build.

Fixing the P1s secures Tech at 4, and arguably 5 once Android Nano runs on hardware. PASS also needs Impact at 4, which takes at least one real teacher's real scripts with measured minutes saved and marks changed.

# REDPEN: Judge scorecard (Reviewer B2)

#BuildHybridAI 2026, Firebase AI Logic hybrid inference (Gemini Nano on-device plus Gemini in the cloud).

**What I reviewed:** commit `bba5bdc` (HEAD of `main`, 2026-11-14 19:21 +0100), with an untracked `docs/teacher-trial/` folder in the working tree.

**What I did:**
- Read `README.md`, `web/src` (ai, marking, hooks, data, pages), `android/app/src` (ai, marking, `RedpenApp.kt`, tests), `firestore.rules`, `firebase.json`, `remoteconfig.template.json`, both workflows, `bench/` and every folder under `bench/evidence/`.
- Ran the web unit tests, the typecheck and the linter.
- Read the Firebase JS SDK's hybrid dispatcher (`@firebase/ai` 13.2.0, `callCloudOrDevice`) to confirm how the modes behave.
- Fetched the live site's headers and JS bundles to look for leaked secrets.
- Checked repo visibility, releases and CI with `gh`.

I modified no project file other than this report. I wrote my own analysis first and read `reviewer-B.md` only afterwards (section 7).

---

## 1. Scores

| # | Criterion | Score (1-5) | One-line justification |
|---|---|---|---|
| 1 | Technological Implementation | **4** | Deep, correct use of all three hybrid modes on web, plus `inferenceSource`-driven mark status, tested per-request quota routing, 16 Remote Config keys, App Check, a service-worker offline shell, 65 + 63 unit tests and green CI. Held from 5 by an Android on-device path that has never run on a real phone, and two reachable bugs in the hybrid core's own invariants (F3, F4). |
| 2 | Design | **4** | A complete teacher product with no dead ends: batch capture, offline queue, marked copy, register with Excel, review with "accept for everyone", insights, learned-hints card, and a cloud check that runs on any tab. Held from 5 because there is no continuous camera loop and no automatic student identity, and because today a judge cannot get in (P0s F1, F2). |
| 3 | Potential Impact | **3** | The problem is real and sourced, and the audience is now named. But there is zero real usage (the teacher-trial CSV is header-only), no real student scripts, and no measured time saved. Gemini Nano does not exist on the budget Android phones the named audience owns, so for them the "on-device, zero cost per page" claim reduces to cloud plus an offline queue. |
| 4 | Quality of the Idea | **4** | Non-obvious and well reasoned. The device only reads a cut-out box, code marks, the cloud audits device reads, and cloud corrections now feed back into the device prompt. Held from 5 because the feedback loop's only evidence is circular: the same sheet, synthetic font handwriting (F5). |
| | **Average** | **3.75** | |

**Tie-break order** (Tech, then Design, then Impact, then Idea): 4 / 4 / 3 / 4.

**Verdict: FAIL.**
- Impact is 3, and PASS needs every criterion at 4 or above.
- There are two open P0s, both submission-config problems rather than code problems:
  - The live site sits behind an access code that the README never mentions.
  - The repo is private.

---

## 2. Test, typecheck and lint results (run by me, in `web/`)

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` (vitest 5.1.0) | **8 files, 65 / 65 passed**, 8.77 s. The README says "63 unit tests", which is stale by 2. |
| Hybrid-core subset | `routing.test.ts` + `hybrid.test.ts` | **22 tests** (8 + 14), which matches the README's "22 for the hybrid core" |
| Typecheck | `npx tsc -b` (TypeScript 7.0) | **exit 0, no errors** |
| Lint | `npx oxlint` | exit 0, **7 warnings**: 2 `react(refs)` in `useCloudCheck.ts:27,50`, 3 `set-state-in-effect`, 2 `only-export-components` |
| Android unit tests | not run locally (`android/app/google-services.json` is absent, and the google-services plugin needs it) | 63 `@Test` across Engine 22, Hybrid 23, Routing 8, Register 6, Geometry 4. **CI green:** `android` and `android-e2e` both succeeded at `b20d8b7`, the last commit that touched `android/**`. |
| Android instrumented | `OnDeviceNanoTest.kt` (1 test) | Built in CI. Never produced an on-device result: FTL Pixel 10 Pro, Galaxy S25 and Samsung RTL Galaxy S26 all reported every Nano option UNAVAILABLE (`bench/evidence/galaxy-s26-real-phone-2026-11-14/README.md`). |
| Secrets in bundle | Took the 36-char `VITE_APPCHECK_DEBUG_TOKEN` value from `web/.env.local` and grepped for it in `web/dist`, `web/src`, `bench`, `android/app/src`, `.firebase/`, all of git history (`git log --all -S`), and the **live** JS bundles from https://redpen-hybrid.web.app | **0 hits anywhere.** `firebase/app.ts:33` gates the token on `import.meta.env.DEV`. The live index equals the local `dist/index.html`. Both `.env` files are gitignored and were never committed. |
| Live security headers | `curl -I` | CSP (`object-src 'none'`, `frame-ancestors 'none'`, no `unsafe-eval`, and `connect-src` includes `data:` for on-device image reads), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. `/sw.js` is served as `text/javascript` with `no-cache`, so it is a real Workbox service worker. |

---

## 3. How the hybrid core is built (summary of my read)

### Web (`web/src/ai/models.ts`)

- **Model setup.** `readerModel` and `judgeModel` call `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })`.
  - The same `ObjectSchema` goes to the cloud as `responseSchema` and to Chrome as `responseConstraint`.
  - `expectedInputs` and `expectedOutputs` are declared, and the cloud thinking level comes from Remote Config.
  - Every model instance is wrapped by `attributed()`, which tags errors with their model through a `WeakMap`. Per-request attribution is correct, and it is tested.
- **Mode use is deliberate:**
  - `PREFER_ON_DEVICE` (Remote Config `read_mode`) for crop reads and point checks.
  - `PREFER_IN_CLOUD` for whole-page reads, because Nano auto-corrects whole pages.
  - `ONLY_IN_CLOUD` for verification, batches and authoring.
- **Capability check.** `refreshDeviceCapability()` re-probes `LanguageModel.availability()` at start-up, after a download, and on every online/offline event (`useStatus.ts:197-212`). A device that cannot run Nano is downgraded to `PREFER_IN_CLOUD` (`models.ts:102`).
- **I confirmed in the SDK** (`@firebase/ai` `callCloudOrDevice`) that:
  - `PREFER_IN_CLOUD` falls back to the device on `FETCH_ERROR` / `ERROR` / `API_NOT_ENABLED`.
  - `PREFER_ON_DEVICE` uses the device only when availability is `available`.
  - So the app's routing assumptions are correct.
- **Status from `inferenceSource`.** It is read on every call and decides the mark status: on-device reads become `provisional`, cloud reads become `verified`. `statusLabel` shows a single cloud read as "Cloud read" and keeps "Verified" for cross-checked marks.
- **Quota routing** (`handleModelError` + `withRetry`):
  - A rate limit blocks a model for 60 s; a daily quota blocks it for 12 h.
  - A model that rejects the thinking level is retried without it.
  - It never loops when every model is exhausted, and non-transient errors are not retried.
  - All of this is unit-tested.
- **Batching.** Cloud reads are batched (one request per sheet, one per theory answer). A batch reply missing an answer throws, and the caller falls back to one-by-one reads (tested).
- **Remote Config:** 16 keys (models, fallback chain, read mode, thinking levels, batching and learning switches, 7 prompts), with the same defaults compiled in so the app works offline. The template matches the code key for key.

### Android (`Ai.kt`, `ModelRouting.kt`, `RedpenApp.kt`)

- **Model setup.** `generativeModel(..., onDeviceConfig = OnDeviceConfig(mode, temperature = 0f, modelOption))`.
- **Nano option probing.** `DeviceModel` probes `PREVIEW`, `STABLE` and `PREVIEW_FAST` through the reading model's own `onDeviceExtension.checkStatus()`, picks the best option, and offers `download()`.
- **Routing.** `ModelRouting` is a pure, unit-tested port of the web routing.
- **App Check.** Debug provider in debug builds, Play Integrity in release builds.
- **Connectivity** counts only *validated* internet.
- **Parity.** Prompts, Remote Config keys, reconcile, learning, regrade and labels are faithful ports. The differences are in F4 and F11.

### Verdict on hybrid depth

This is the most deliberate use of the three inference modes I would expect to see in this hackathon:
- The routing is driven by a measured failure (Nano reading 56 as 54 when it sees the question).
- The cloud's role is auditor of the device, not standby.

The one large gap is that **the Android on-device branch has never executed on hardware**.

---

## 4. Findings

Severity:
- **P0:** blocks judging or submission.
- **P1:** a correctness, security or claims problem a technical judge would find and mark down.
- **P2:** polish or hardening.

### P0

**F1. The live site requires an undisclosed access code (P0).**
- Where:
  - `web/src/components/AccessGate.tsx:5` reads `VITE_ACCESS_CODE_SHA256`.
  - The hash is set in `web/.env.local` and compiled into the deployed `index-C00KsXAK.js` (identical to the live bundle).
  - `README.md:17` says "Accounts: None needed", and the "Fastest path" (l.19-22) starts with "Open the web app".
  - The code appears only in the untracked `docs/teacher-trial/teacher-guide.html`.
  - `web/e2e/live-walkthrough.mjs:9` needs `REDPEN_CODE`.
- Effect: a judge following the README hits a "REDPEN preview / Access code" wall and cannot score Design or Impact.
- Fix: rebuild with `VITE_ACCESS_CODE_SHA256=` (empty) and run `firebase deploy --only hosting`. Optionally drop `X-Robots-Tag: noindex` (`firebase.json`). Then re-run `live-walkthrough.mjs` with no `REDPEN_CODE`.

**F2. The repository is private (P0).**
- Where: `gh api repos/egbujor-emmanuel/redpen` returns `"private": true`. The README's clone command (l.37), every evidence link and the Releases link all 404 for anyone outside the account.
- Fix: make the repo public. Confirm the Apache-2.0 license and the `bench/evidence/*.mp4` files render on GitHub.

### P1

**F3. A failed or unreadable read becomes "On-device mark confirmed by the cloud check" (P1, hybrid-core correctness and honesty).**
- Where:
  - `web/src/marking/markSubmission.ts:29-36` (`failedMark` sets `readSource: 'on_device'`, `read: ''`, `awarded: 0`, even when the cloud read failed).
  - `web/src/marking/markAnswer.ts:104-108` (`reconcile` compares **scores only**).
  - `web/src/marking/cloudCheck.ts:44` (counts it as `confirmed`).
  - Android, identical: `MarkSubmission.kt:36`, `CloudCheck.kt:25-29`.
- What happens: when a read fails (quota, network, AICore busy) and the student's answer is wrong, the cloud check returns 0 = 0. The mark gets the reason "On-device mark confirmed by the cloud check.", the chip "Verified", and it is counted in "N on-device marks confirmed", even though the device never read it.
- The same happens when the device flagged an unreadable box (`""` or `"AB"`) and the cloud reads a different wrong letter.
- When device "A" and cloud "C" are both wrong, the mark is labelled Verified while `learnFromCheck` simultaneously records "A"→"C" as a disagreement.
- This breaks the README's stated invariant: "A single cloud reading is labelled Cloud read, never Verified" (l.65).
- Fix:
  - Give `failedMark` a distinct source (for example `readSource: 'none'` or an `unread: true` flag).
  - In `reconcile`, require agreement on the *normalised reading* (option letter, parsed number, or `textSimilarity >= SHORT_MATCH`), not just the score, before adding the "confirmed" reason.
  - Otherwise return the cloud mark as a plain cloud read, flagged if the scores differ.
  - Add unit tests for: failedMark vs cloud 0; device-flagged vs cloud 0; different readings with the same score. Mirror them in `HybridTest.kt`.

**F4. Android on-device point checks give credit to any plain-text reply starting with "t" (P1, false credit).**
- Where: `android/app/src/main/java/app/redpen/teacher/ai/Ai.kt:223-226` and `:272`.
- What happens:
  - For on-device replies, `field()` falls back to the raw text when the reply is not JSON. The code expects this ("On-device models may ignore the schema").
  - `.trim().lowercase().startsWith("t")` then counts replies such as "The answer does not mention…" or "There is no…" as `present = true`.
- Effect: Nano can award theory-point and method marks that should be 0. They stay Provisional until the cloud check, but an offline-only teacher sees inflated scores.
- Parity: the web is strict (`points.ts:24`: `parsed.success && parsed.data.present`; non-JSON throws), so the two platforms disagree.
- Fix:
  - Accept only a parsed boolean, or a bare reply matching `^(true|yes)\b` exactly.
  - Treat anything else as "unknown": throw, so the mark is flagged.
  - Add a JUnit case with the reply "The student does not state…".

**F5. The learning loop's only evidence is circular, and the mechanism can bias objective reads toward the key (P1, claims and design risk).**
- Where:
  - `bench/evidence/ondevice-learning-2026-11-14/`
  - `web/src/marking/learning.ts:14,41`
  - `markSubmission.ts:77`
  - README l.5-6, 31, 66, 106, 129
- Why the evidence is circular:
  - The "3/5 before, then 5/5 after" result re-reads **the same sheet** whose two answers the hints literally contain ("A"→"D", "raned"→"runned").
  - That sheet, `samples/english-sheet-photo.jpg`, is **synthetic**: the Caveat font rendered by `samples/make_sheet_photo.py`. `bench/README.md` discloses this; the main README does not.
  - So the evidence shows the hint string reaches the prompt. It does not show that "the device learns how that class writes".
- Why the mechanism is risky:
  - For `objective` questions, a hint "what looked like A was really D" is injected into **every** later objective read for the assignment.
  - A student who genuinely wrote A can then be read as D. That is the auto-correct-toward-the-key failure the whole design exists to prevent.
- Fixes:
  - Run a held-out evaluation: hints learned from student 1, then sheets from students 2-N, including one who truly wrote "A". Report device exact-read rate before and after, and the false-correction count.
  - Exclude single-letter objective answers from hints, or require the same confusion from 2 or more students.
  - State in the README that the demo sheet is synthetic.
  - Say "this assignment", not "this class": hints are stored per assignment.

**F6. The Android on-device path is unproven, yet the README lists phones that the repo's own evidence shows cannot run it (P1, claims).**
- Where:
  - `README.md:27` ("an Android phone with Gemini Nano (Pixel 9/10/11, Galaxy S25/S26, …)").
  - `bench/evidence/galaxy-s26-real-phone-2026-11-14/README.md`: "AICore does not expose Gemini Nano to third-party apps … Firebase Test Lab's Pixel 10 Pro and Galaxy S25, where every Nano option reported UNAVAILABLE".
- The repo has no Android run with `inferenceSource == ON_DEVICE`. Half of the "two platforms" hybrid claim is cloud-only in practice.
- Fix:
  - Reword l.27 to "desktop Chrome with built-in AI; Android on-device needs AICore third-party access (not available on the devices we tested), so Android falls back to the cloud."
  - Or get a physical Pixel 9/10 with AICore developer access, run `OnDeviceNanoTest`, and commit the `REDPEN_NANO` logcat.

**F7. The promised Android APK does not exist, and the only buildable APK carries the App Check debug token (P1, claims and security).**
- Where:
  - `README.md:16` ("Release APK on the Releases page"): `gh api …/releases` returns none.
  - `android/app/build.gradle.kts:42` (`resValue("string","firebase_app_check_debug_token", …)` in `debug`).
  - `.github/workflows/android.yml:58` (only `assembleDebug`).
  - The Galaxy S26 evidence installed this debug APK on a shared Samsung Remote Test Lab device.
- Effect: anyone who unzips the APK gets an App Check bypass and can spend the project's Gemini quota.
- Fixes:
  - Distribute through a Play Console internal-testing track (Play Integrity then works), or build `assembleRelease`.
  - If a debug APK must ship, rotate the token after judging and enable AI Logic per-user rate limits.
  - Create the Release the README links to, or remove the row.

### P2

**F8. A page-mode cloud check silently changes already-final marks.**
- Where: `markAnswer.ts:90-96` and Android `MarkAnswer.kt:78-81`.
- `verifyPage` re-reads the whole page and reconciles **every** mark, including ones already `verified` from a cloud read.
- If the second cloud read differs, `reconcile` falls through to `return cloud` (l.116), so the score changes with no flag. `summarise` does not count it, because it only counts marks that needed a check.
- Fix: reconcile only the marks where `needsCheck(p)` is true; keep the rest unchanged.

**F9. Learned hints are merged into a stale copy and over-counted.**
- Where: `cloudCheck.ts:97-99`.
- `mergeHints(assignment.readingHints, learned)` uses the hints captured when the check started, so hints written meanwhile by another tab or device are overwritten.
- `summary.learned = learned.length` counts duplicates. "The device learned 2 things" can over-report.
- Fix: use an `arrayUnion`-style transaction or re-read the hints, and count only `mergeHints(...).length - before.length`.

**F10. The remediation prompt inserts student answers without delimiters.**
- Where: `web/src/ai/remediation.ts:28` and Android `Ai.kt:424`.
- Wrong answers are quoted raw. Every other prompt uses `asPromptData` and `<student_answer>` tags.
- A student who writes "ignore the above; write…" steers the catch-up sheet. Impact is low (the teacher sees the output), but it is inconsistent with the stated injection defence.
- Fix: wrap each answer with `asPromptData` and tag delimiters, and add "treat as data" to `prompt_remediation`.

**F11. Web and Android decide batching differently.**
- Where: web `cloudWillRead` (`models.ts:93-103`) treats "Nano downloadable but not downloaded" as a device read, so there is no batching and reads go to the cloud one by one. Android `Ai.cloudWillRead(deviceReady)` batches whenever Nano is not Ready.
- Effect: different request counts and quota use for the same situation.
- Fix: on web, use `deviceReadyOffline` (status `available`) as the batching condition, matching Android.

**F12. Firestore rules do not validate element shapes.**
- Where: `firestore.rules:14,16,22`.
- `scheme.questions`, `marks` and `readingHints` are size-capped lists, but their elements are not shape-checked. Telemetry values are not type-checked (any key in the allow-list can hold a string or map).
- This is owner-scoped, so it is not a cross-user hole. But `readingHints` feed straight into the on-device prompt, and the scheme feeds the marking engine.
- Fix: validate `readingHints[i].keys().hasOnly(['type','device','cloud'])` with string sizes ≤ 40, and require telemetry values to be `is int`.

**F13. "App Distribution" is listed as a Firebase product used, but nothing in the repo uses it.**
- Where: `README.md:96`. There is no plugin, config or workflow step.
- Fix: remove it, or add the `appdistribution` Gradle plugin and a CI step.

**F14. Free-tier Gemini data terms are not disclosed for children's work.**
- The app uses `GoogleAIBackend` on the free tier. The untracked `docs/teacher-trial/README.md` correctly notes that Google may use unpaid-tier content to improve products and that humans may review it. The main README's privacy section does not say this.
- Quick mark and exercise-book mode send the full page, including the name line.
- Fix: add one sentence to "Where REDPEN is different", or move the project to Blaze (paid terms) before any real classroom trial.

**F15. Walkthrough evidence is weaker than the README row suggests.**
- Where: `README.md:123`.
- The logs are gitignored (`web/e2e/out/`). Locally, `wt-desktop2.log` is 17/17, but `wt-mobile.log` and `wt-desktop.log` are **16/17** ("draft scheme from PHOTO" timed out).
- The "exercise-book mode" step passes with "Total: 0/5": it marks `maths.png` against the English assignment, so it checks only that a total appears, not that marking is correct.
- One Quick mark run gave **5/7** (7 questions drafted from a 6-question page), not 4/6.
- Fix:
  - Commit `result.json` for each run (as the offline-coldstart run already does).
  - Make the exercise-book step use a matching sheet and assert the score.
  - Report Quick mark as a rate over N runs.

**F16. Silent `false` on a malformed point-check reply.**
- Where: `web/src/ai/points.ts:24`.
- A schema mismatch yields `false` with no signal. `markPoints` flags a non-empty answer with zero points, so this is partly self-correcting. A partial miss (one of three points) is not.
- Fix: throw on `!parsed.success`, so the answer is flagged as unreadable rather than under-scored.

**F17. Small accuracy and hygiene items.**
- README "63 unit tests" (l.40, l.121) should be 65.
- `useCloudCheck.ts:27,50` reads refs during render (lint).
- The "Chrome 157" claim (l.129) does not appear in the committed log.
- `PAGE_PROMPT` and `STUDENT_PAGE_NOTE` are still not in Remote Config.

---

## 5. README claims verification

| # | README claim | Evidence file | Confirmed? |
|---|---|---|---|
| 1 | Web unit tests **63/63**, incl. 22 for the hybrid core | `web/src/ai/routing.test.ts`, `web/src/marking/hybrid.test.ts`; my `npm test` run | **Partly.** 65/65 pass; the 22 hybrid-core tests are confirmed; the total is stale. |
| 2 | Android JUnit "same cases + register exports", pass in CI | `.github/workflows/android.yml`; `gh run list` | **Yes.** 63 `@Test`; `android` success at `b20d8b7`. |
| 3 | Web click-through **17/17, desktop and mobile** | `web/e2e/live-walkthrough.mjs`; logs in `web/e2e/out/` (gitignored) | **Partly.** One desktop log is 17/17; mobile and the other desktop log are 16/17. Not committed. Needs the access code. The exercise-book step asserts nothing (F15). |
| 4 | Offline cold start **6/6**; 3 scripts marked 3/5 | `bench/evidence/web-offline-coldstart-2026-11-14/result.json` + screenshots | **Yes.** 6 steps ok; "3/3 scripts marked 3/5 after reconnect". |
| 5 | Android emulator: 4/4 Maestro flows pass in CI; sheet 3/5 | `android/e2e/*.yaml`, `android-e2e.yml`; `gh run list` | **Yes for CI** (`android-e2e` success at `b20d8b7` and `8e947b9`). The 3/5 lives only in CI artefacts; not seen by me. |
| 6 | Android Excel verified by openpyxl in CI | `android.yml` step "Independent check" | **Yes.** |
| 7 | Cloud at production settings: whole page **14/14**; single crops 5/6 ("=-1"); batched **6/6 maths + 4/4 biology**; theory point checks **4/4** incl. injection scored **0**; 3 runs identical | `bench/out-cloud/cloud-gemini-3.5-flash-lite-MINIMAL-all-2026-11-14T07-{37-12,39-45,42-05}.json` | **Yes, with one nuance.** All 3 summaries are `14/14, 5/6, 6/6, 4/4`; `[D Q5 injection] awarded 0/2`; the single-crop miss is m4 read as "=-1" every run. "4/4 biology" is true for *marks*, not exact reads (batched b1 reads "figt germs"). Raw reads vary slightly between runs. |
| 8 | Thinking: default ~33 s/page, then MINIMAL 5-10 s/page, same 14/14 | `cloud-gemini-3.5-flash-lite.json` vs the MINIMAL files | **Yes.** Default 32.8-34.7 s; MINIMAL 5.3-9.7 s; 14/14 in both. (A stale comment in `config.ts` still says "~12-20 s".) |
| 9 | Full hybrid loop, real Nano: 5/5 read on-device offline (39 s); 2 s after reconnect "4 confirmed, 1 needs you, learned 2"; readings 3/5 then 5/5; score 2/5 + 1 flagged, then 3/5 | `bench/evidence/ondevice-learning-2026-11-14/e2e-ondevice.log`, `e2e-result.json`, `.mp4`, screenshots | **Numbers yes; interpretation no.** 09:14:07 to 09:14:46 = 39 s; 09:14:46 to 09:14:48 = 2 s; rows match. But the sheet is synthetic font and the "after" is the same sheet the hints came from (F5). "Chrome 157" is not in the log. |
| 10 | Earlier offline-to-online run flagged the device misread | `bench/evidence/ondevice-offline-to-online-2026-11-12/e2e-result.json` | **Yes.** Q2 "Device read A (0/1); cloud read D (1/1)". |
| 11 | Nano shown the whole page read "7 x 8 = 56" as 54 | `bench/evidence/nano-whole-page-probe-2026-11-12/probe.log`, `result.json` | **Yes.** `"read": "7 x 8 = 54", "correct": false`. |
| 12 | Quick mark: key correct for all 6; page **4/6** | walkthrough logs (gitignored) | **Partly.** 4/6 in 2 runs, **5/7** in 1 run. |
| 13 | "Release APK on the Releases page" | `gh api …/releases` | **No.** There are no releases (F7). |
| 14 | "Accounts: None needed" | live bundle / `AccessGate.tsx` | **No.** An access code is required (F1). |
| 15 | Hybrid path on "an Android phone with Gemini Nano (Pixel 9/10/11, Galaxy S25/S26)" | `bench/evidence/galaxy-s26-real-phone-2026-11-14/README.md` | **No.** The repo's own evidence: Nano UNAVAILABLE on S26, S25 and Pixel 10 Pro (F6). |
| 16 | Firebase products incl. "App Distribution (Android test builds)" | repo-wide search | **No** (F13). |
| 17 | "Play Integrity in release builds" | `RedpenApp.kt:35-37` | **Code yes**; no release build is ever produced. |
| 18 | Service worker: the web app opens offline | `web/dist/sw.js` (Workbox), live `/sw.js`, the cold-start evidence | **Yes.** |
| 19 | "A single cloud reading is labelled Cloud read, never Verified" | `statusLabel.ts`, `markAnswer.ts:104-108` | **Mostly.** Holds for normal cloud reads; violated after a failed read (F3). |
| 20 | Printed sheets: only answer boxes are read; names never leave the device; crops never in Firebase | `markSubmission.ts`, `store.ts` (IndexedDB), `batch.ts` | **Yes.** The README now correctly caveats Quick mark and exercise-book mode. |
| 21 | Cloud check runs automatically on reconnect, on any screen | `hooks/useCloudCheck.ts`, used by `AssignmentPage.tsx` | **Yes.** |
| 22 | "Accept for everyone" re-marks students already marked | `marking/regrade.ts`, `ReviewTab.tsx:59-70`, hybrid tests | **Yes.** |

---

## 6. What would raise each score by a full point

### Technological Implementation, 4 to 5

1. **Run Android Gemini Nano on real hardware.** Use a physical Pixel 9/10 with AICore third-party access, run `OnDeviceNanoTest`, and commit the `REDPEN_NANO` logcat showing `inferenceSource=ON_DEVICE`, per-crop reads and latency. Add a Maestro airplane-mode flow on that device.
2. **Fix F3 and F4, with tests on both platforms.** That makes "Verified" mean two agreeing readings, and makes on-device point checks parse strictly.
3. **Close the App Check story.** Ship a release-signed APK through Play internal testing, enable AI Logic per-user rate limits and limited-use tokens, and state it in the README.
4. **Unify `cloudWillRead` (F11)** and reconcile only the marks that needed a check (F8).

### Design, 4 to 5

1. **Make it judgeable:** clear the gate, make the repo public, add a real APK link (F1, F2, F7).
2. **A continuous camera loop.** "Next student" without leaving the camera, with the queue marking in the background.
3. **Automatic student and page identity.** A per-student QR or roster code printed in the sheet margin, read locally, so 80 scripts need no typing and no page picker.
4. **A 2-3 minute video**, with the README pointing to timestamps for judges who lack Nano hardware.

### Potential Impact, 3 to 4

1. **Run the prepared teacher trial.** At least one real teacher, a real consented class, 30 or more scripts. Commit `trial-results.csv` with minutes by hand vs with REDPEN, and marks changed as a share of all marks.
2. **Real accuracy at scale.** At least 200 real student answers, with a confusion table by question type for cloud, device, and device plus cloud check.
3. **Be honest about the named audience's devices.** Budget Android phones have no Gemini Nano. Show the realistic path (cloud plus offline queue) and quantify it: data per script with crop batching, requests per class, cost per class.

### Quality of the Idea, 4 to 5

1. **Prove the learning loop generalises.** Learn hints from students 1 to k, then measure device exact reads on held-out students, including a negative control who truly wrote the letter the hint "corrects". Report the false-correction rate.
2. **Add guard rails.** Hints need two or more occurrences, single-letter objective answers are excluded, and a hint is retired automatically when the cloud contradicts it. That turns a demo trick into a defensible mechanism.

---

## 7. The previous review (`reviewer-B.md`, at commit `0430323`), item by item

### Section 1: technical defects

| # | Previous finding | Status now | Evidence |
|---|---|---|---|
| T1 | No service worker; the web app cannot open offline | **Fixed** | `vite-plugin-pwa`; `web/dist/sw.js` (Workbox); live `/sw.js` is JS with `no-cache`; `bench/evidence/web-offline-coldstart-2026-11-14/` 6/6 |
| T2 | `canReadOffline` not refreshed after the Nano download; e2e hid it with a reload; wrong button label | **Fixed** | `useStatus.ts:206-213` refreshes after `warmUpOnDevice`, and again on online/offline. `e2e-ondevice.mjs:54` uses "Download on-device AI"; l.66 says "no reload". The 11-14 evidence shows download, then offline marking, with no reload. |
| T3 | No unit tests for the hybrid core | **Fixed (mostly)** | 22 web + 31 Android hybrid and routing tests. Still untested: the `useMarkingQueue` fail-fast path, the `cloudCheck` orchestration, and the failedMark-vs-reconcile case (F3). |
| T4 | Shared mutable `lastModel` | **Fixed** | `WeakMap` per-request attribution (`models.ts:24-37`); Android passes the model name per attempt; both tested |
| T5 | "Verified" means one cloud read | **Fixed in the label; regressed at an edge** | `statusLabel` shows "Cloud read", but a failed read followed by a cloud agreement still becomes "Verified / on-device mark confirmed" (F3) |
| T6 | On-device accuracy low (7/10) | **Open** | No new device-accuracy benchmark; the only new device data is 5 answers on a synthetic sheet (3/5 exact before hints) |
| T7 | Android CI red at HEAD | **Fixed** | `android` and `android-e2e` succeeded at `b20d8b7` and `8e947b9` |
| T8 | Android Nano unproven on hardware | **Open** (now documented) | Galaxy S26 RTL, FTL Pixel 10 Pro and S25 all report Nano UNAVAILABLE; the README still lists those phones (F6) |
| T9 | A distributable APK would carry the App Check debug token | **Open** | CI still builds only `assembleDebug` with the token; no release build; the debug APK was installed on a shared RTL device (F7) |
| T10 | Prompts in the client; README claimed "never hard-coded" | **Fixed (claim)** / **partly open** | The README now says the defaults ship in the app; `PAGE_PROMPT` and `STUDENT_PAGE_NOTE` are still not in Remote Config |

### Section 2: design

| # | Previous finding | Status now | Evidence |
|---|---|---|---|
| D1 | One student at a time; "Student 12:32:19 AM" labels | **Fixed (partly)** | Gallery multi-select becomes the queue (`MarkTab.tsx:42-57`), labelled "Student N". No continuous camera loop and no automatic identity yet. |
| D2 | Cloud check only on the Review tab | **Fixed** | `useCloudCheck` runs on any tab and shows the summary line |
| D3 | "Accept for everyone" not retroactive | **Fixed** | `regrade.ts` + `ReviewTab.tsx:59-70`, tested |
| D4 | Judges cannot get in (gate, private repo, no release, noindex) | **Open** | All four are still true (F1, F2, F7) |
| D5 | No demo video or deck | **Open** (as far as the repo shows) | None committed. Only the evidence screen recordings. |

### Section 3: impact

| # | Previous finding | Status now | Evidence |
|---|---|---|---|
| I1 | No real users, no real scripts | **Open** | A teacher-trial kit exists (untracked); `trial-results.csv` is header-only |
| I2 | Tiny evidence set | **Open** | Still 3 photos / 14 questions for the cloud, plus 1 synthetic sheet for the device |
| I3 | No throughput number | **Open** | No "N scripts in M minutes" |
| I4 | Offline web fragile; Android Nano unproven | **Web fixed; Android open** | See T1 and T8 |
| I5 | Audience too broad | **Fixed** | README l.50 leads with secondary teachers with 60-100 students on patchy data |
| I6 | Privacy claim overstated | **Fixed** | README l.56 caveats Quick mark and exercise-book mode. A new gap is the free-tier data-use disclosure (F14). |

### Section 4: idea

| # | Previous finding | Status now | Evidence |
|---|---|---|---|
| Q1 | The cloud-improves-device mechanism was not built | **Fixed (built)**, with new concerns | `learning.ts` / `Learning.kt`, the Remote Config switch, the UI card, tests. Evidence is circular and the bias risk is untested (F5). |

### Section 5: README claims table

| # | Previous claim issue | Status now |
|---|---|---|
| 1 | No Releases | **Open** |
| 2 | Maestro "pass in CI" while red | **Fixed** (green) |
| 3 | `maths.png` called "a real student's page" | **Fixed** ("made for testing") |
| 4 | PWA / offline web | **Fixed** |
| 5 | "never hard-coded" | **Fixed** |
| 6 | App Distribution | **Open** (F13) |
| 7 | Play Integrity for store builds | **Partly.** Wording is now "release builds", but no release build exists. |
| 8 | No committed MINIMAL 14/14 artifact | **Fixed** (3 MINIMAL-all files) |
| 9 | Batch artifact read 0/6 | **Fixed** (6/6 in all 3 files) |
| 10 | On-device output not committed | **Fixed** (4 evidence folders with logs, JSON, video) |
| 11 | "Enable on-device AI" label; the photo got queued | **Fixed** |
| 12 | Cloud check only on Review | **Fixed** |
| 13 | "keeps students' photos on the device" | **Fixed** |
| 14 | "16-step click-through" | **Fixed** ("17-step") |

### Section 6: P0 list in the previous review

| # | Previous P0 | Status now |
|---|---|---|
| P0-1 | Make it judgeable (gate, public repo, walkthrough without a code) | **Open** (F1, F2) |
| P0-2 | APK without an App Check bypass, plus a Release | **Open** (F7) |
| P0-3 | Fix the on-device offline bug and re-record | **Fixed** |
| P0-4 | Service worker plus a cold-offline test | **Fixed** |
| P0-5 | `android-e2e` green on HEAD | **Fixed** |
| P0-6 | Correct the README claims and commit the artifacts | **Mostly fixed.** New claim gaps: F5, F6, F13, F15, and the test count. |

**Regressions:** none in behaviour. The closest is T5: the "Cloud read" label fix is undermined by the failedMark path (F3), a pre-existing path that is now visible because the label exists.

**Net change since `0430323`:**
Across the 42 rows above (10 technical, 5 design, 6 impact, 1 idea, 14 README claims, 6 previous P0s):
- **23 are fixed.**
- **7 are partly fixed:** T3, T5, T10, D1, I4, claim #7 and P0-6.
- **12 are still open:** T6, T8, T9, D4, D5, I1, I2, I3, claims #1 and #6, and P0-1 and P0-2. In plain terms: access, Android Nano, the debug-token APK, App Distribution, the video and every real-usage item.

The engineering moved from a weak 4 to a solid 4. Impact did not move, because nothing new was *demonstrated with real users*.

---

## 8. Final verdict

**FAIL.**
- Impact = 3 (below 4).
- Two P0s are open: the undisclosed access-code gate on the live site, and the private repo.

Both P0s are one-command configuration fixes, and they should be done first. Clearing them alone does not reach PASS. That also needs:
- F3, F4, F5 and F6 fixed or reworded.
- At least one real-teacher data point (the trial kit is ready).
- An honest statement of what budget phones in the target market actually do.

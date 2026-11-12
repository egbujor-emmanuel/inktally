<p align="center"><img src="web/public/logo-lockup.png" alt="REDPEN — Marked in minutes. Even offline." width="560"></p>

**REDPEN marks a stack of handwritten classwork in minutes — on the teacher's own phone or laptop, even offline.**
Gemini Nano reads each student's answer on the device, ordinary code does the marking against the teacher's own marking guide,
and when the device is back online Gemini in the cloud double-checks every on-device mark. Built on **Firebase AI Logic hybrid inference**
for **Web (Chrome)** and **Android**, sharing one Firestore data model.

---

## Try it in 2 minutes

| | |
|---|---|
| **Live web app** | https://redpen-hybrid.web.app |
| **Android app** | Release APK on the [Releases page](../../releases) (Android 8.0+). Install, open, tap a sample. |
| **Accounts** | None needed — you start as a private guest. "Save my work" links a Google account. |

**Fastest path (any browser, no printer):**
1. Open the web app → **Quick mark a page**.
2. Upload [`samples/maths.png`](samples/maths.png) — a real student's exercise page (questions + handwritten answers, two deliberately wrong).
3. REDPEN drafts the answer key from the *questions only* → click **Looks right — mark it** → **5/7**, with "23" and "25" caught.

**The hybrid path (printed sheet, on-device, offline):**
1. Use a desktop Chrome that supports built-in AI ([requirements](https://developer.chrome.com/docs/ai/get-started)), or an Android phone with Gemini Nano (Pixel 9/10/11, Galaxy S25/S26, …).
2. Home → **English — Grammar Check** sample → **Print sheets** (or use [`samples/english-sheet-photo.jpg`](samples/english-sheet-photo.jpg)).
3. Status bar → **Enable on-device AI** (one-time model download).
4. Go offline → **Mark** → photograph the sheet → every mark shows **On-device · Marked by code · Provisional**.
5. Go back online → **Review** → the cloud check runs automatically; agreements become **Verified**, disagreements are shown side by side for the teacher.

**Run locally**
```bash
git clone https://github.com/egbujor-emmanuel/redpen && cd redpen/web
cp .env.example .env.local        # fill in your Firebase web config
npm install && npm run dev        # http://localhost:5173
npm test                          # 41 unit tests (marking engine, scanner geometry, register exports)
REDPEN_CODE=… node e2e/live-walkthrough.mjs [url] [--mobile]   # 16-step click-through of every feature
```
Android: open `android/` in Android Studio, add your `app/google-services.json`, run. CI unit-tests and builds every push ([workflow](.github/workflows/android.yml)), then installs the APK on an Android emulator and taps through every screen with Maestro ([e2e workflow](.github/workflows/android-e2e.yml), [flows](android/e2e/)).

---

## Who it's for

Anyone who marks handwritten work against a marking guide: primary and secondary teachers, college and university lecturers, exam centres, training and certification courses, private tutors. Any subject, any level. Teachers who already have a marking scheme upload it and REDPEN copies it exactly; otherwise REDPEN drafts one from the question paper.

The pain is measured and large: US teachers spend **9.9 hours a week** marking, and **a third** considered leaving the profession over grading workload ([Learnosity survey](https://learnosity.com/resources/edtech-blog/a-third-of-us-teachers-considered-leaving-education-in-last-12-months-due-to-grading-workload/)); teachers work **53 hours a week**, 15 beyond contract ([RAND](https://www.rand.org/pubs/research_reports/RRA1108-9.html)). The category is proven: Gradescope (AI-assisted grading of paper exams, 600+ institutions) was [acquired by Turnitin](https://www.turnitin.com/press/turnitin-acquires-gradescope); Ed.ai (≈$5.8M seed, Sep 2026) and Pensive ($6.8M seed, Feb 2026) raised this year for AI grading.

**Where REDPEN is different:** those tools are cloud-first — students' work is uploaded and marking needs a good connection. REDPEN marks **on the device, offline**, keeps students' photos **on the device**, and is built for **large classes on weak networks** (60–100+ students per teacher is common in Nigeria, India and Kenya), with a marked copy and a mark register so there is no second round of marking by hand.

## Why hybrid is structurally necessary here

| Problem | What REDPEN does |
|---|---|
| Teachers in large, low-connectivity classes mark by hand for hours; feedback arrives days late. | Marking runs **on the device**, offline, at **zero cost per page**. |
| Cloud graders upload students' work to a server. | On printed sheets only the **cut-out answer boxes** are read — the student's name line never leaves the device. Crop images stay in device storage, never in Firebase. |
| Small on-device models "auto-correct" students — we measured Nano reading a student's **23** as **24** when it could see the question. | The model **only reads** one answer box and never sees the question; **code decides every mark**. Theory answers get one small yes/no check per marking point. |
| On-device reads are sometimes wrong. | On-device marks are **Provisional** until the **cloud check** (Gemini via Firebase AI Logic) re-reads them; disagreements go to the teacher with both readings. |
| The cloud is sometimes overloaded (we hit "high demand" errors during testing). | Retries with backoff, an authoring-model fallback, and the on-device path keep teachers working. |

## Architecture

```mermaid
flowchart LR
  subgraph Device["Teacher's phone / laptop"]
    CAM[Photo] --> SCAN["Scanner<br/>corner markers → homography → answer crops"]
    SCAN --> READ{"Firebase AI Logic<br/>hybrid read"}
    READ -- on-device --> NANO["Gemini Nano<br/>(Chrome Prompt API / ML Kit AICore)"]
    READ -- cloud fallback --> FL
    NANO --> CODE["Marking engine (code)<br/>numeric · objective · short · points"]
    CODE --> FS[("Firestore<br/>offline cache")]
    CODE --> COPY["Marked copy<br/>+ mark register"]
    SCAN --> IDB[("Crops in device storage only")]
  end
  subgraph Cloud["Firebase"]
    FL["Gemini 3.5 Flash-Lite<br/>reads · verifies"]
    AUTH["Gemini (author model)<br/>answer keys · catch-up sheets"]
    RC[Remote Config<br/>models + prompts]
    AC[App Check<br/>reCAPTCHA Enterprise / debug]
    FS2[(Firestore + rules)]
  end
  FS <--> FS2
  IDB -. "back online: cloud check" .-> FL
  RC --> READ
  AC --> READ
```

**Firebase products used:** AI Logic (hybrid `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`; structured output on both paths; `inferenceSource`), App Check (reCAPTCHA Enterprise on web, debug provider for sideloaded test builds, Play Integrity for store builds), Authentication (anonymous guest → Google linking), Firestore (offline persistence, per-teacher security rules), Remote Config (model names and prompts — never hard-coded), Hosting, App Distribution.

Because the Firebase console does not show on-device inference, REDPEN records every inference's source and latency itself (`users/{uid}/telemetry/{day}`) and shows a live on-device / cloud counter in the app.

## Features (identical on web and Android)

- **Quick mark** — one photo of a student's page → AI answer key from the questions → teacher confirms → marked. Key saved for the class.
- **Assignments** — draft a marking scheme from photos, a PDF or typed questions, **or upload your own marking scheme and REDPEN copies it exactly** (alternatives, "do not accept", mark allocations); edit it; print answer sheets with corner markers.
- **Two capture modes** — printed REDPEN sheet (fully offline, names private) or any exercise-book page; camera or gallery.
- **Marked copy** — the student's own page with red ticks, crosses, scores and a circled total, under the **institution letterhead** and with the **teacher's comment** — print or share to parents. The teacher writes only the total on the original.
- **Mark register** — students × questions with totals; **edit names and comments after marking**; export a real **Excel (.xlsx)** with letterhead and class averages, or CSV; print.
- **School details** — institution name, address/term and teacher name, printed on sheets, copies, the register and Excel.
- **Review** — flagged answers with the student's handwriting beside what the AI read; set a score or "accept this answer for everyone" (updates the scheme).
- **Insights + catch-up** — per-question averages, answers that lost marks, and an AI catch-up worksheet built from the class's actual mistakes.
- **Accounts** — private guest by default; Google sign-in keeps all work and syncs web ↔ Android. Active / finished assignments, full delete.
- Any subject with a marking guide; any level (Grades, Years, Primary, JSS/SS, Basic/SHS, Forms, Classes, university years, courses).

## Evidence

| Test | Result |
|---|---|
| Unit tests — web (Vitest) | 41 / 41 pass |
| Unit tests — Android (JUnit, same cases + register exports) | pass in CI |
| Web click-through of every feature on the live site ([`web/e2e/live-walkthrough.mjs`](web/e2e/live-walkthrough.mjs)) — school details, typed + photo drafting, **copying a teacher's own scheme from a photo and from text**, print, Quick mark, sheet marking, exercise-book marking, comment → marked copy, rename → Excel content check, review, insights + catch-up, finish/reopen, delete | see the latest run below |
| Android on an emulator ([Maestro flows](android/e2e/)) — every screen, gallery photo marked, comment, marked copy, register, Excel, teacher's scheme copied | passes in CI; sample sheet marked **3/5 = the true score** |
| Android Excel file opened by an independent library (openpyxl) | letterhead, comment, escaping and formula guard verified in CI |
| Cloud "thinking" level (Remote Config `read_thinking`) on the same handwriting set | default 14/14 at ~33 s/page → **MINIMAL 14/14 at ~12–20 s/page**, single answers ~6 s → ~2 s |
| Quick mark repeatability (same page, 4 runs) | answer key identical and correct 4/4; page marked 5/7 (true score) 4/4, ~6 s each |
| Real handwriting (3 photos, 14 questions), cloud reading + code marking | 14 / 14 marks correct, incl. partial 2/3 and a "do not accept" answer |
| Same photos, on-device whole-page marking (rejected design) | auto-corrected 2 wrong answers → why REDPEN reads answer-only crops |
| On-device crop reading + code marking | 7 / 10 exact, every miss either flagged or caught by the cloud check |
| Live end-to-end offline → online run (Chrome + Gemini Nano) | 5 answers marked 100 % on-device offline; on reconnect the cloud check verified 4 and flagged the one device misread |
| Quick mark on a real page | answer key 6/6 correct (ignored the student's wrong answers); marked 5/7 correctly |

Benchmark scripts and evidence live in [`bench/`](bench/).

## Repository

```
web/        React + Vite PWA (TypeScript) — marking engine, scanner, AI layer, UI
android/    Kotlin + Jetpack Compose — same engine, scanner and Firestore schema
firestore.rules, firestore.indexes.json, firebase.json
.github/workflows/android.yml       unit tests + openpyxl check + APK on every push
.github/workflows/android-e2e.yml   emulator click-through (Maestro) after every build
```

## License

[Apache 2.0](LICENSE)

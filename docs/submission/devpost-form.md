# Devpost form — ready-to-paste answers (#BuildHybridAI 2026)

Fill these in on submission day, after the repo is public and the release APK exists. Fields marked **YOU** are personal: only you can answer them.

## Step: Project overview

**Project name** (60 characters max)
```
REDPEN — handwritten classwork marked offline
```

**Elevator pitch**
```
Photograph a stack of handwritten classwork and REDPEN marks it on the teacher's own phone or laptop — even offline. Gemini Nano reads, code marks, the cloud checks.
```

## Step: Project details

**About the project** — paste all of [`devpost-text.md`](devpost-text.md) from "## Inspiration" down (it is Markdown, and Devpost renders it).

**Built with** (25 max)
```
firebase-ai-logic, gemini-nano, gemini, firestore, firebase-app-check, firebase-authentication, firebase-remote-config, firebase-hosting, chrome-built-in-ai, ml-kit, aicore, android, kotlin, jetpack-compose, react, typescript, vite, workbox, playwright, vitest, maestro, github-actions, exceljs
```

**"Try it out" links**
- `https://redpen-hybrid.web.app` — live web app
- `https://github.com/egbujor-emmanuel/redpen` — code
- `https://github.com/egbujor-emmanuel/redpen/releases` — Android APK

**Image gallery** — upload `docs/submission/gallery/01-…png` to `08-…png` in order (3:2, under 5 MB each). Captions are in [`gallery/captions.md`](gallery/captions.md).

**Demo video URL** — the YouTube link (set to **Public**: the rules page asks for "publicly visible", which is stricter than the form's "public or unlisted").

## Step: Additional info

| Field | Answer |
|---|---|
| Submitter type | **YOU** (Individual, unless you enter as a team) |
| Country of residence | **YOU** |
| Organization name | **YOU** (leave empty if none) |
| Start date (MM-DD-YY) | `11-12-26` (first commit 2026-11-12) |
| New or existing | **New.** This project did not exist before Nov 11, 2026 |
| Platforms | **Web (Chrome)** and **Android** |
| Working demo URL | `https://redpen-hybrid.web.app` |
| License URL | `https://github.com/egbujor-emmanuel/redpen/blob/main/LICENSE` |
| Eligibility checkboxes | **YOU**: tick only if true |

**Explain how your project meets the main technology requirement**
```
All of REDPEN's AI inference goes through Firebase AI Logic, on web (firebase/ai, getGenerativeModel with hybrid InferenceMode) and Android (com.google.firebase.ai with OnDeviceConfig). Three hybrid modes are used on purpose:
• PREFER_ON_DEVICE — Gemini Nano reads each cut-out answer box on the teacher's device (Chrome Prompt API on web, ML Kit/AICore on Android), offline; code then marks it.
• ONLY_IN_CLOUD — when the device is back online, Gemini 3.5 Flash-Lite re-reads every on-device mark as an independent check; agreement makes it Verified, a different score goes to the teacher with both readings. Misreads the cloud finds are remembered, and later offline readings that match one are held for the teacher.
• ONLY_IN_CLOUD for writing — answer keys (from the questions, never the student's answers) and catch-up sheets (anonymised wrong answers), with structured output; PREFER_IN_CLOUD for reads when no Gemini Nano is available.
inferenceSource on each response drives the labels the teacher sees. App Check protects every call (reCAPTCHA Enterprise on web, Play Integrity in release Android builds); Remote Config holds the models, fallback chain, prompts and switches; Firestore with offline persistence shares one data model between web and Android. Code: web/src/ai/models.ts, web/src/ai/read.ts, android/app/src/main/java/app/redpen/teacher/ai/Ai.kt.
```

**Testing instructions**
```
No account needed: you start as a private guest ("Save my work" links a Google account).

Fastest (any browser): https://redpen-hybrid.web.app → Quick mark a page → upload samples/maths.png from the repo → check the answer key → "Looks right — mark it" → 4/6, with the two wrong answers caught.

A whole stack, offline: open the "English — Grammar Check" sample once while online → turn the connection off → reload (REDPEN still opens) → Mark → Choose photos → pick samples/english-sheet-photo.jpg a few times → reconnect → each script is marked 3/5.

On-device path: desktop Chrome with built-in AI (Gemini Nano) → status bar → "Download on-device AI" → go offline → mark the sheet: marks show "On-device · Provisional" → reconnect → the cloud check confirms them by itself. No Nano hardware? The recorded run is in bench/evidence/ondevice-learning-2026-11-14/ and bench/evidence/learning-heldout-2026-11-14/.

Android: install the APK from the Releases page (Android 8+), open it and tap a sample. On phones without Gemini Nano for apps, REDPEN says "Cloud AI" and reads in the cloud.

Full click-through script: node web/e2e/live-walkthrough.mjs (18 steps). More in the README's "Try it in 2 minutes".
```

## Before pressing Submit (checklist)

- [ ] Access gate removed (rebuild with `VITE_ACCESS_CODE_SHA256` empty) and redeployed; the site opens straight to the home screen.
- [ ] Repos public; Apache-2.0 shows in the GitHub About box.
- [ ] Release APK on the Releases page, built with a judges-only App Check debug token (rotate the dev token).
- [ ] Video public on YouTube, under 3:00, English captions; README links it.
- [ ] README "Try it in 2 minutes" works from a fresh browser with no code.
- [ ] Both reviewers' final reports pass.

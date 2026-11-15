# REDPEN — Devpost text description (draft)

**Tagline:** A stack of classwork, marked in minutes. Even offline.

## Inspiration

A secondary-school teacher in Nigeria can have 80 scripts after one lesson, a phone, and mobile data that comes and goes. Marking happens by hand, at night, and feedback reaches students days later. The AI marking tools that exist assume a fast connection and upload every student's work to a server. We wanted marking that runs where the teacher is: on their own device, with no signal, without sending students' names anywhere.

## What it does

REDPEN marks handwritten classwork from photos, on the web (Chrome) and on Android, from one shared Firestore data model.

- **Quick mark:** photograph one student's page. REDPEN works out the answer key from the *questions only* (never from the student's answers), the teacher checks it, and the page is marked.
- **Assignments:** draft a marking scheme from the question paper, or upload the teacher's own marking scheme and REDPEN copies it exactly: alternatives, "do not accept" answers and mark allocations.
- **Printed answer sheets** with corner markers. REDPEN cuts out each answer box, so names and photos never leave the device. **Exercise-book pages** work too, so no printer is needed.
- **A whole stack at once:** choose all the photos, and each script is queued and marked in the background. With no signal, the photos wait on the device and are marked the moment the connection is back.
- **Marked copy** of the student's own page (red ticks, crosses, circled total, the teacher's comment and the school letterhead), a **mark register**, **Excel export**, **insights**, and an AI **catch-up sheet** built from the class's actual mistakes.
- **The answer key stays editable after marking:** fix a wrong answer and every student is re-marked from what REDPEN already read.

## How we used Firebase AI Logic

The split between device and cloud is the product, not a toggle.

1. **The device reads; code marks.** Each cut-out answer box goes to Firebase AI Logic with `PREFER_ON_DEVICE`, so Gemini Nano reads it on the device (the Chrome Prompt API on web, ML Kit / AICore on Android). The model only transcribes. It never sees the question, because when it did, Nano "auto-corrected" a student's 23 into 24. Deterministic code then marks numbers, letters and words against the scheme. Theory answers get one small yes/no check per marking point.
2. **The cloud checks the device.** Every on-device mark is *Provisional*. As soon as the device is back online, REDPEN re-reads those answers with `ONLY_IN_CLOUD` (Gemini 3.5 Flash-Lite), on whatever screen is open. Two readings that agree on the answer and the score become **Verified**; a different score goes to the teacher with both readings. A single cloud reading is labelled "Cloud read", never "Verified". `inferenceSource` on every response drives the labels.
3. **The cloud teaches REDPEN where the device goes wrong.** Each misread the cloud check finds ("the device read A, it was D") is saved on the assignment. From then on, an offline reading that matches one is held as *Check this* instead of counting. REDPEN never changes what was read, so it cannot push a student's answer towards the key. We tested the obvious alternative, putting the corrections into Nano's prompt, on students it had never seen: it gave no gain, and it could turn a true "A" into "D". So we shipped holding instead.
4. **The cloud writes, the device works offline.** Answer keys and catch-up sheets come from the cloud (`ONLY_IN_CLOUD`, structured output). A key is drafted from the question paper or copied from the teacher's own scheme; in Quick mark it is worked out from the page's questions and never from the student's answers. Catch-up sheets get only anonymised wrong answers. Marking itself needs no connection, and when Gemini Nano isn't available reads switch to `PREFER_IN_CLOUD`.
5. **Built to survive free-tier limits.** Remote Config holds the models, the fallback chain, the prompts, thinking levels and switches, so changes ship without an app update and the app carries the same values offline. A model that runs out of quota is skipped and the next one is used; each error is attributed to the request that caused it. Cloud reads are batched, one request per sheet.

Also used: **App Check** (reCAPTCHA Enterprise on web, Play Integrity in release Android builds), **Authentication** (anonymous guest, then Google linking), **Firestore** (offline persistence, per-teacher rules that check each field's shape), and **Hosting** with a service worker so the web app opens with no connection.

## Challenges

- Small on-device models correct students' mistakes when they can see the question. We moved to "read only a cut-out box; code decides the mark".
- The lab phones we could reach (Firebase Test Lab's Pixel 10 Pro and Galaxy S25, and a Galaxy S26 in Samsung Remote Test Lab) don't give apps access to Gemini Nano. Android therefore falls back to the cloud there, as designed, and we proved the on-device path in Chrome with real Gemini Nano.
- Free-tier quotas and "high demand" errors, which led to per-request model attribution, fallback models and batching.

## Accomplishments (every number is in the repo)

- Cloud reading plus code marking at production settings: **14/14** questions on the test pages, the same over 3 repeated runs; a prompt-injection answer scored **0**.
- On real Gemini Nano, offline, on students REDPEN had never seen: **7 of 7** device misreads were shown as *Check this* before reconnecting (4 held by what the cloud check had learned, 3 already flagged by the marking engine), and no reading was changed.
- A live click-through of every feature on the deployed site: **18/18** steps, on desktop and phone. Quick mark on the sample page gave the true score in **5 of 5** runs.
- **91** web unit tests and the matching Android tests, plus Android CI that taps through every screen on an emulator.

## What we learned

Measure before claiming. Our first "learning" design looked great when it re-read the sheet it had learned from. On students it hadn't seen, it did nothing. The cloud's corrections turned out to be most useful as a map of *where the device is wrong*, not as instructions to the model.

## What's next

A trial with real teachers (the kit is in the repo: guide, consent form, results log), reading the "No." box on printed sheets so students are matched automatically, and on-device reading on Android as soon as Gemini Nano is open to apps on the phones teachers carry.

## Built with

Firebase AI Logic (Gemini Nano hybrid on-device, Gemini 3.5 Flash-Lite), Firestore, App Check, Authentication, Remote Config, Hosting, React, Vite, TypeScript, Kotlin, Jetpack Compose, ML Kit GenAI / AICore, Vitest, Playwright, Maestro, GitHub Actions.

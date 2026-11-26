# InkTally — Devpost text description (draft)

Placeholders in `{{…}}` are filled from `evidence/claims.json` once each run is recorded; nothing is pasted by hand.

**Tagline:** A stack of handwritten classwork, marked on the teacher's phone. Even offline. Even privately.

## Inspiration

A secondary-school teacher in Nigeria can have 80 scripts after one lesson, a phone, and mobile data that comes and goes. Marking happens by hand, at night, and feedback reaches students days later. The AI marking tools that exist assume a fast connection and upload every student's work to a server. We wanted marking that runs where the teacher is: on their own device, with no signal, to the standard of a real exam such as WAEC, and with the teacher deciding whether pupils' work ever leaves the device.

## What it does

InkTally marks handwritten classwork from photos, on the web (Chrome) and on Android, from one shared Firestore data model.

- **Real exam papers.** Paste or photograph the teacher's own marking guide and InkTally copies it exactly: the paper's own labels (6(a), 6(b)(ii)), mark allocations, "accept" alternatives, "do not accept" answers, method marks and theory points. Code reads the printed labels and decides which questions are calculations, so the key never depends on which cloud model answered.
- **Examiner-grade method marks.** The right formula with one wrong number substituted keeps its method mark; working whose operations aren't the formula's ("v = fλ = 50 ÷ 0.4") gets none and is flagged.
- **Exercise books as they really are.** A script over several pages is one student, with answers that run onto the next page; a page photographed sideways is turned upright on the device; every answer is matched to its question by the label the student wrote, in code. Printed answer sheets with corner markers work too.
- **Private mode.** One switch: every answer is read and marked on the device by Gemini Nano and no photo, answer or name goes to any cloud AI, enforced by a network guard. Switched off, the cloud double-checks every on-device mark.
- **Quick mark**, **a whole stack at once** (queued and marked in the background, even with no signal), **marked copies** for parents, a **mark register**, **Excel export**, **insights** and AI **catch-up sheets**. The answer key stays editable after marking: fix it and every student is re-marked from what InkTally already read.

## How we used Firebase AI Logic

The split between device and cloud is the product, not a toggle.

1. **The device reads; code marks.** Each answer goes to Firebase AI Logic with `PREFER_ON_DEVICE`, so Gemini Nano reads it on the device (the Chrome Prompt API on web, ML Kit / AICore on Android). The model only transcribes and never sees the question, because when it did, Nano "auto-corrected" a student's 23 into 24. Deterministic code marks numbers, letters, words and working against the guide; theory answers get a yes/no check per marking point.
2. **The cloud checks the device.** Every on-device mark is *Provisional*. Back online, InkTally re-reads those answers with `ONLY_IN_CLOUD`. Two readings that agree on the answer and the score become **Verified**; a different score goes to the teacher with both readings. `inferenceSource` drives the labels.
3. **The cloud teaches InkTally where the device goes wrong.** Each misread the cloud check finds is saved on the assignment, and a matching offline reading is held as *Check this*. InkTally never changes what was read, so it cannot push an answer towards the key.
4. **Private mode is hybrid inference with the privacy dial on the teacher's side.** Reads and point checks are forced to `ONLY_ON_DEVICE`; a guard refuses any cloud AI request carrying pupil work before it is sent, including the SDK's own fallback when a browser has no on-device model. Only an answer key drafted from the teacher's own guide may use the cloud.
5. **Built to survive the free tier.** Remote Config holds models, fallback chain, prompts and switches. A model out of quota, or answering "high demand", hands the work to the next one; errors are attributed per request; cloud reads are batched, one request per sheet.

Also used: **App Check** (reCAPTCHA Enterprise on web, Play Integrity in release Android builds), **Authentication** (anonymous guest, then Google linking), **Firestore** (offline persistence, per-teacher rules that check each field's shape), and **Hosting** with a service worker so the web app opens with no connection.

## Challenges

- Small on-device models correct students' mistakes when they can see the question, so the device reads only an answer, and code decides the mark.
- Real phone photos broke our first exercise-book reader: a sideways page shifted every answer by one question. We now turn the page upright in code (32/32 on every real photo turned four ways) and match answers by the label the student wrote.
- A fallback model once drafted a calculation as a theory question and cost three method marks, so the teacher's guide now decides question types, not the model.
- Free-tier quotas and "high demand" errors, which led to per-request model attribution, overload routing and batching.

## Accomplishments (every number is in the repo, re-checked by `npm run evidence:verify`)

- **Four real handwritten WAEC physics scripts**, photographed on a phone (one sideways, one over two exercise-book pages): {{REAL_WAEC}} questions marked the same as the examiner.
- **Public benchmarks.** SciEntsBank (SemEval-2013, 540 held-out answers marked by human annotators): {{SCIENTSBANK}} agreement with the human mark, against {{SCIENTSBANK_MAJORITY}} for always answering "not correct". MNIST handwriting on photographed answer sheets: {{MNIST}}.
- **Private mode on the live site with no on-device model available: 5 / 5 checks, 0 pupil requests sent.**
- A live click-through of every feature on the deployed site: **18/18** steps, desktop and phone; Quick mark gave the true score in **5 of 5** runs.
- {{TESTS}} web unit tests and the matching Android tests; Android CI taps through every screen on an emulator.

## What we learned

Measure before claiming, on data you didn't build. Real handwriting found problems our own test pages never did: sideways photos, two-page scripts, a stacked fraction, a dotless ÷. Each became a fix in the product, never a change to the questions.

## What's next

A trial with real teachers (the kit is in the repo: guide, consent form, results log), reading the "No." box on printed sheets so students are matched automatically, and on-device reading on more Android phones as Gemini Nano opens up to apps.

## Built with

Firebase AI Logic (Gemini Nano hybrid on-device, Gemini 3.5 Flash-Lite), Firestore, App Check, Authentication, Remote Config, Hosting, React, Vite, TypeScript, Kotlin, Jetpack Compose, ML Kit GenAI / AICore, Vitest, Playwright, Maestro, GitHub Actions.

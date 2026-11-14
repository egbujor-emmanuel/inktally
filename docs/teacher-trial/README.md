# Running the REDPEN teacher trial

This folder is for whoever runs the trial. Teachers only ever see the guide and the feedback form.

| File | Who it's for | What to do with it |
|---|---|---|
| `teacher-guide.pdf` / `.html` | Teachers | Send the ready-made PDF (WhatsApp/email). If you edit the HTML, re-export it from Chrome (Print → Save as PDF). It is 2–3 A4 pages and also reads well on a phone. |
| `feedback-form.md` | You | Paste the questions into a Google Form. Consent is question 1 and required. |
| `trial-results.csv` | You | One row per teacher, filled from the form and the app (see below). |

## Steps

1. **Before sending:** check the access code in the guide still works, and that the Android link (if you send one) installs on a fresh phone.
2. **Send:** the guide PDF, the form link and, for Android users, the app link. Ask for one real exercise with one class, within a week.
3. **Collect:** the form answers, plus two numbers from the app for each teacher. These are on the status chip under the header (`N on-device · M cloud`), or in Firestore at `users/{uid}/telemetry/{day}` if they signed in.
4. **Log** each teacher as one row in `trial-results.csv`. Leave out anyone who did not tick consent.
5. **Report:** add a "Teacher trial" row to the README evidence table, with the real numbers only: the number of teachers, total scripts, median minutes with REDPEN vs by hand, and marks changed as a share of all marks. Quotes go in only where the second consent box was ticked.

## What to measure, and why

The Impact criterion asks for a case "based on what's demonstrated". These numbers are what turn the claim "saves teachers hours" into evidence:

| Measure | From | Becomes |
|---|---|---|
| Minutes with REDPEN vs by hand, for the same stack | form §3 | time saved per script |
| Marks changed ÷ all marks | form §4 + register | real-world accuracy |
| On-device vs cloud reads | app status chip / telemetry | how much ran on the device in real classrooms |
| Used with no data? | form §3 | the offline claim, tested by real teachers |
| Would use again; ease; trust | form §5 | adoption signal |

## Privacy

- REDPEN uses the free tier of the Gemini Developer API (`GoogleAIBackend`). On unpaid services, [Google may use submitted content to improve its products, and human reviewers may read it](https://ai.google.dev/gemini-api/terms). The guide tells teachers this plainly and steers them to printed sheets (only answer boxes leave the device) and student numbers.
- Turning on billing for the Firebase project (Blaze plan) moves Gemini calls to the paid-service terms, where content is not used to improve Google's products. A trial of a few hundred scripts on Flash-Lite costs cents, but it is a billing change, so it needs an explicit decision.
- Never ask teachers to send student photos to you. Everything you need is in the form and the app counters.

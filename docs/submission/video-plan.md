# REDPEN demo video — plan (read before filming)

## 1. What the rules require (quoted from the contest site, checked 2026-11-15)

| Requirement | Quote | How we meet it |
|---|---|---|
| Real product footage | "Should include footage that shows the Project functioning on the platform(s) for which it was built." | Every product shot is a screen recording of the real app: web in Chrome, Android on a real phone. No mock-ups, no re-created screens. |
| Matches reality | "must function as depicted in the video" | Only show flows that pass the live walkthrough (18/18) or were recorded live; no numbers that aren't in `bench/evidence/`. |
| Length | "It should not be longer than 3 minutes. If it is longer than 3 minutes, only the first 3 minutes may be evaluated." | Target 2:45, hard cap 2:55 (checked with ffprobe before upload). |
| Hosting | "uploaded to and made publicly visible on YouTube" | You upload from your account (public, not unlisted). |
| Language | "in English or include English subtitles" | English voiceover plus burned-in captions. |
| Judging | Tech (hybrid inference) · Design (complete product) · Impact ("based on what's demonstrated") · Idea (non-obvious) | Each scene below says which criterion it proves. |

**Still to check together:** the Devpost *submission form* may word the video request more strictly than the rules page (it did for an earlier contest). Open the form once before we film and paste me its exact video wording.

## 2. Story (2:45)

| # | Time | Scene | Footage | Proves |
|---|---|---|---|---|
| 1 | 0:00–0:12 | **Hook.** A real stack of handwritten pages on a desk. "One teacher. Eighty scripts. Patchy data." | Your photo or video of the hand-written pages | Impact |
| 2 | 0:12–0:30 | **The idea in one breath.** Gemini Nano reads each answer on the device, code does the marking, Gemini in the cloud checks every on-device mark once you're back online. | App home screen + simple diagram | Idea |
| 3 | 0:30–1:05 | **Web, real paper (cloud path).** Quick mark → photograph the hand-written mixed test → REDPEN drafts the key from the *questions only* → confirm → **9/12**, wrong answers caught, theory answer half credit → marked copy with red ticks. | Laptop screen recording, your real photo | Design, Tech |
| 4 | 1:05–1:45 | **Offline, on-device (Gemini Nano).** Turn off the connection → mark printed sheets → every mark says *On-device · Provisional*; one is held as *Check this* because the cloud found that misread earlier → reconnect → "Cloud check: N on-device marks confirmed, 1 needs you". | Chrome with real Gemini Nano (Codespace, recorded live) | Tech, Idea |
| 5 | 1:45–2:15 | **Android, a real phone.** Same app, same data model: airplane mode → photograph → "Saved for marking" → airplane off → marked by itself. The phone has no Nano, and REDPEN says so ("Cloud AI") and uses the cloud: the hybrid fallback, shown honestly. | Your Android phone, screen recording | Tech, Design |
| 6 | 2:15–2:32 | **The teacher's tools.** Batch photos → mark register → Excel. Fix the answer key after marking → "Re-marked 12 students". Insights → catch-up sheet. | Laptop recording | Design, Impact |
| 7 | 2:32–2:45 | **Proof + end card.** On-screen numbers, each from the repo: cloud reading 14/14; on unseen students, 7/7 device misreads held for checking; live walkthrough 18/18. Firebase AI Logic hybrid · App Check · Remote Config · Firestore offline · Auth · Hosting. URL + repo. | Captions over app shots | All |

If a teacher tries REDPEN before filming (with consent), a 5-second clip or one quoted line replaces scene 1's voiceover. That is the strongest Impact evidence there is.

## 3. Footage inventory

| Footage | Status | Who |
|---|---|---|
| Hand-written mixed test page (`samples/real/README.md`), photographed | **Needed** | You: write it, photograph it, put it in Drive `REDPEN photos` |
| Printed sheets filled in by 3–4 people (`samples/real/*.pdf`) | Optional, strongest for scene 4 | You, if you can print |
| A real stack on a desk, phone photographing it (B-roll) | Optional | You (5–10 s on a second phone) |
| Web screen recordings (scenes 3, 6) | Ready to record | Me (Playwright on this laptop, 1920×1080) |
| Gemini Nano offline recording (scene 4) | Ready to record | Me (Codespace Chrome + Nano), using your printed-sheet photos if you have them |
| Android phone recording (scene 5) | **Needed** | You, with a shot list and the install link from me; or USB + scrcpy and I record it |
| Galaxy S26 lab screenshots | Have (8 stills) | Backup 2-second "also runs on a Galaxy S26" moment |
| Voiceover | Ready | Me: local Kokoro voice, free |
| YouTube upload (public) | At the end | You |

## 4. Narration (draft, every claim from the repo)

1. "One teacher. Eighty handwritten scripts. Data that comes and goes. Marking takes the whole weekend."
2. "REDPEN marks them on the teacher's own phone or laptop, even offline. Gemini Nano reads each answer on the device. Plain code does the marking. And when the connection comes back, Gemini in the cloud checks every on-device mark by itself."
3. "Here's a real page. REDPEN works out the answer key from the questions alone — never from the student's answers — I check it, and it marks the page: nine out of twelve, both wrong answers caught, half credit where half the point is there."
4. "Now with no connection at all. Gemini Nano reads each answer box right here on the device. This one is held for me: the cloud caught the device misreading this before, so REDPEN won't let it count until someone checks. Back online — the cloud has already confirmed the rest."
5. "Same app on Android, same data. This phone has no Gemini Nano, so REDPEN tells me and uses the cloud — and with no signal it keeps the photos and marks them the moment the signal is back."
6. "A whole stack at once, a register, an Excel file. Spot a mistake in the answer key? Fix it, and everyone is re-marked from what REDPEN already read."
7. "Every number here is in the repo: cloud reading fourteen out of fourteen; on students it had never seen, every device misread held for checking. REDPEN, built on Firebase AI Logic."

## 5. Production and checks

- Built with HyperFrames (HTML → video), real clips placed at root level, captions split from the narration (≤ 8 words a chunk), one Kokoro clip per scene, at most 5% faster.
- Before upload: `ffprobe` duration < 2:55; `npx hyperframes lint` with 0 errors; a 4-frame contact sheet checked by eye; no secrets, emails, access codes or real student names visible in any frame.
- The README links the video once it is public.

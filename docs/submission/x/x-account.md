# X (Twitter) account kit

Written for: you, setting the account up by hand. Nothing here gets posted automatically.

> **The name may change.** "Red Pen" is already the name of a teacher-grading entry in this same hackathon, and "Redpen AI" is a UK handwritten-work grader (see `COMPETITION-2026-11-23.md`). If we rename (recommended: **INKTALLY**, which is clear on GitHub, the web and `inktally.web.app`), swap the name in every line below before creating the account. The handle is the one thing that's painful to change later.

## Profile

| Field | REDPEN version | INKTALLY version |
|---|---|---|
| Handle (try in order) | `@redpenmarks`, `@redpen_marks`, `@redpenclass`, `@getredpen` | `@inktally`, `@inktallyapp`, `@getinktally` |
| Display name | REDPEN · offline marking | InkTally · offline marking |
| Bio (≤160) | Snap a page of handwritten classwork. REDPEN marks it on the phone, even offline, and the cloud double-checks. Web + Android. #BuildHybridAI | Snap a page of handwritten classwork. InkTally marks it on the phone, even offline, and the cloud double-checks. Web + Android. #BuildHybridAI |
| Location | Nigeria | Nigeria |
| Website | Leave empty until submission day (the site is behind the access code until then). Then: the live site. | same |
| Profile photo | `avatar-400.png` (the app's mark) | the new mark if we rename |
| Header | `banner-1500x500.png` | text swapped if we rename |
| Category (professional account) | Education | Education |

Set up two-factor sign-in. Use an email you control. Don't link the account to a personal profile.

## What to post, and when

Rules: no posts asking people to test or sign up (standing rule); every number must match `bench/evidence` and the README; tag **@Firebase** and use **#BuildHybridAI** on product posts.

**Before submission (build in public, 3–4 posts, one every day or two):**

1. *Intro.* "Teachers in Nigeria mark piles of exercise books by hand, often with no data. We're building REDPEN: photograph a handwritten page, the phone's own AI (Gemini Nano) reads it, code marks it against the teacher's marking guide, and the cloud double-checks when there's signal. #BuildHybridAI @Firebase" + a 10-second screen clip of a page being marked.
2. *A real WAEC-style paper.* "We wrote a WAEC-standard physics paper (objectives + structured, method marks, theory points) and four answer scripts. REDPEN agreed with the examiner's marks on N/56 questions." Use the final number from the dry-run evidence file, and a picture of a marked page.
3. *The honest catch.* "The cloud read 'v = f/λ' as 'v = fλ'. Code caught it anyway: 50 ÷ 0.4 = 125 is correct arithmetic but the wrong formula, so no method mark, flagged for the teacher." Screenshot of the flag. (Posts like this show the product thinking, and judges notice them.)
4. *Offline.* A clip with airplane mode on: the page is marked, labelled "On this phone", then turns "Verified" when the signal returns.

**Submission day: pinned launch thread (6 posts):**

1. "REDPEN marks handwritten classwork on the teacher's phone, even with no internet. Built for #BuildHybridAI with @Firebase AI Logic. 2-min demo ↓" + video
2. "The phone reads (Gemini Nano, on device). Code marks against the teacher's own marking guide: objectives, numbers with units, method marks, theory points."
3. "When there's signal, Gemini in the cloud reads it again. A mark is 'Verified' only when both readings agree; everything else goes to the teacher."
4. "It drafts the answer key from a photo or a typed marking guide, WAEC sub-parts like 6(b)(ii) included."
5. "Web and Android, identical. Records sync through Firestore when you're back online."
6. "Try it: <live site> · Code: <repo> · Devpost: <link>"

Video tip: X plays native uploads; upload the MP4 rather than linking YouTube in post 1.

## My view

Worth doing, at small effort. The X thread is already part of our submission package. A real account with 3–4 honest build posts gives the thread a home and makes the project look like a product, not a weekend demo; that's what the Grand Prize ("featured blog post, social") rewards. Judges score the criteria, not follower counts, so don't spend time chasing followers. Spend it on the posts above, which double as demo material.

# Submission: #BuildHybridAI 2026

Deadline **Mon 30 Nov 2026, 2:00 PM PT (22:00 UTC)**. Commits after that are not evaluated. Every form answer is version-controlled in [`docs/submission/devpost-form.md`](docs/submission/devpost-form.md); the project story is [`docs/submission/devpost-text.md`](docs/submission/devpost-text.md).

## Rules → where InkTally meets them

| Rule (quoted) | Where |
|---|---|
| "All of your app's AI inference must go through Firebase AI Logic" | Web: `firebase/ai` `getGenerativeModel` with hybrid `InferenceMode` ([models.ts](web/src/ai/models.ts)). Android: `com.google.firebase.ai` with on-device config ([Ai.kt](android/app/src/main/java/app/redpen/teacher/ai/Ai.kt)). No other model API is called. |
| "imported and actually called … not just named in the README" | Every read, check and draft above runs through those calls; [JUDGES.md](JUDGES.md) maps each mode to its code. |
| App Check required | reCAPTCHA Enterprise (web), Play Integrity in release builds (Android); enforced. |
| Platforms: Web (Chrome) and/or Android; "strong consideration for the Grand Prize" across platforms | Both, identical features and one Firestore data model. |
| Public repo, open-source licence visible in About (Apache preferred) | Apache-2.0 ([LICENSE](LICENSE)); repo made public on submission day. |
| Video ≤ 3 min, public YouTube, English, "footage that shows the Project functioning on the platform(s)" | Plan: [`docs/submission/video-plan.md`](docs/submission/video-plan.md); scenes as data: [`video/script.json`](video/script.json). |
| Text: how Firebase AI Logic was used, features, value | [`docs/submission/devpost-text.md`](docs/submission/devpost-text.md). |
| Hosted URL "strongly encouraged" | https://inktally.web.app |
| No production keys, secrets or PII in the repo | Secrets live outside the repo; [`check-dist.mjs`](web/scripts/check-dist.mjs) scans the bundle on every build; test data uses invented names. |

## Judging criteria → what shows it

| Criterion (quoted) | Shown by |
|---|---|
| **Technological Implementation**: "How well is the project built, and how effectively does it use Firebase AI Logic hybrid inference" | Three modes used on purpose, the cloud check with a strict "Verified" rule, learning that holds but never rewrites, quota-safe routing; [THREAT_MODEL.md](THREAT_MODEL.md); `npm run ci:clean` |
| **Design**: "a complete, coherent product experience, not just a technical proof of concept" | Quick mark → assignments → print → mark (sheet, exercise book, stack, offline) → review → register/Excel → answer-key edits → insights, identical on web and Android |
| **Potential Impact**: "a credible, specific case … based on what's demonstrated" | Teachers with large classes on patchy data; a real WAEC-format paper marked end to end ([samples/waec](samples/waec/)); real handwriting tests |
| **Quality of the Idea**: "creative, non-obvious use of Firebase AI Logic … genuine understanding of the problem space" | The device reads but never sees the question (we measured Nano correcting students); code marks; the cloud checks and teaches the device where it misreads; method marks follow the examiner's rule |

## Submission-day checklist

- [ ] Access gate removed (`VITE_ACCESS_CODE_SHA256` empty), redeployed to both sites; the site opens straight to Home.
- [ ] `inktally.web.app` added to the reCAPTCHA key's domains and to Auth authorized domains; live walkthrough passes on it.
- [ ] `npm run ci:clean` green; Android CI green on the final commit.
- [ ] Release APK on the Releases page with a judges-only App Check debug token (revoked after judging).
- [ ] Repos public; Apache-2.0 in the About box; tag `submission-final`.
- [ ] Video public on YouTube, under 2:55, English captions; README links it.
- [ ] Devpost form filled from [`devpost-form.md`](docs/submission/devpost-form.md); gallery from `docs/submission/gallery/`.
- [ ] X launch thread posted from [`docs/submission/x-post.txt`](docs/submission/x-post.txt).
- [ ] No pushes to `main` during judging (Dec 10–16).

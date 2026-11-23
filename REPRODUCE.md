# Reproduce InkTally from a clean clone

## The one-command gate (web)

```bash
git clone https://github.com/egbujor-emmanuel/inktally && cd inktally/web
npm ci
npm run ci:clean
```

`ci:clean` runs, in order, and stops at the first failure:

| Step | What it proves |
|---|---|
| `npm run lint` | oxlint over the whole app |
| `npm run test:report` | every unit test passes (marking engine, hybrid safety net, quota routing, answer-key parsing, scanner geometry, exports, CSP); writes `evidence/vitest.json` |
| `npm run build` | TypeScript build, production bundle, then [`check-dist.mjs`](web/scripts/check-dist.mjs) fails the build if the App Check debug token or any private key reached the bundle |
| `npm run evidence:verify` | every number in the README is recomputed from its evidence file, the file's SHA-256 is unchanged, and the README states exactly that number ([`evidence/claims.json`](evidence/claims.json)) |

No Firebase project is needed for the gate. To run the app locally, copy `web/.env.example` to `web/.env.local` and fill in your own Firebase web config (AI Logic with the Gemini Developer API, App Check with reCAPTCHA Enterprise, Firestore, anonymous Auth), then `npm run dev`.

## Android

```bash
cd android
gradle testDebugUnitTest assembleDebug     # Gradle 9.9.1 and JDK 21, as in CI; or open the folder in Android Studio
```

Add your own `app/google-services.json` first. CI runs the same unit tests, opens the exported Excel file with openpyxl, builds the APK, then installs it on an emulator and taps through every screen with Maestro: [android.yml](.github/workflows/android.yml), [android-e2e.yml](.github/workflows/android-e2e.yml).

## Live checks against the deployed app

```bash
cd web
node e2e/live-walkthrough.mjs https://inktally.web.app            # 18-step click-through of every feature
node e2e/live-walkthrough.mjs https://inktally.web.app --mobile   # same on a phone-sized screen
node e2e/offline-coldstart.mjs https://inktally.web.app           # open with no connection, queue a stack, marked on reconnect
node e2e/handwriting-test.mjs ../samples/waec                     # WAEC physics paper: key from the guide, 4 scripts marked, compared with docs/real-test/truth.json
node e2e/smoke.mjs                                                # Quick mark 4/6, sheet 3/5, trial files served
```

## On-device (Gemini Nano)

Needs Chrome with built-in AI (we used a 4-core, 16 GB GitHub Codespace). `bench/setup.sh`, then `bash bench/run.sh e2e-ondevice.mjs`, which records the screen. Recorded runs are in [`bench/evidence/`](bench/evidence/).

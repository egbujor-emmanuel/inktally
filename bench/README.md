# Benchmarks and end-to-end tests

Evidence behind the design decisions in the main README. All scripts drive **real Google Chrome**.

| Script | What it measures |
|---|---|
| `probe.mjs` + `index.html` | Does Gemini Nano download and run on this machine? Text + image prompt latency. |
| `bench.mjs` + `bench.html` + `cases.json` | Whole-page on-device reading/marking of real handwriting (showed Nano auto-correcting wrong answers). |
| `bench.mjs` with `PAGE=crops.html` | Answer-only crops on-device + code marking (the design REDPEN uses). |
| `cloud.mjs` + `cloud.html` | The same photos through Firebase AI Logic in the cloud (`ONLY_IN_CLOUD`). |
| `e2e-ondevice.mjs` | Live site: enable Nano → offline marking of a printed sheet → back online → automatic cloud check. |

On-device runs need Chrome with built-in AI (we used a 4-core / 16 GB GitHub Codespace: `setup.sh`, then
`./run.sh <script>.mjs`, which records the screen to `out/`). The cloud benchmark needs a Firebase web config and an
App Check debug token in `../secrets/` (never committed).

Sample photos are in `../samples/` — `maths.png` and `bio-*.png` are real handwriting written for this test (no real pupils);
`english-sheet-photo.jpg` is a synthetic printed-sheet photo made by `make_sheet_photo.py`.

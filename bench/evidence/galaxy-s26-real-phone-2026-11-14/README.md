# REDPEN on a real Galaxy S26 (Samsung Remote Test Lab, 2026-11-14)

Device: Samsung Galaxy S26, SM-S942U (USA, Texas lab), Android 16. Build: debug APK 0.6.0 (commit b20d8b7).

1. `1-install-prompt.png` — Android's installer: "Install this app? REDPEN".
2. `2-app-installed.png` — "App installed".
3. `3-redpen-running-cloud-fallback.png` — REDPEN running on the phone. Status line: "Online · Cloud AI (no on-device model)".

Second session (same phone model, reinstalled), Quick mark with the handwritten `maths.png` sheet:

4. `04-quick-mark-on-galaxy-s26.png` — Quick mark screen on the phone.
5. `05-photo-picker.png` — Android's photo picker opened from "Choose photo" ("REDPEN will only have access to the photos you select").
6. `06-maths-sheet-loaded.png` — the photographed student sheet loaded into REDPEN.
7. `07-cloud-drafted-answer-key.png` — Gemini in the cloud read the page and drafted the key: "Does this answer key look right?"; status chip "0 on-device · 1 cloud".
8. `08-answer-key-editor-q1-7x8.png` — the editable key, question 1 read from the handwriting as "7 x 8 =".

The lab booking ran out before the confirm-and-mark step (the remote viewer only forwards taps and keys, with a
5–30 s video lag); that step is covered on the web build and by the Android Maestro flows.

What it shows: the Android app installs and runs on a current flagship. On this lab phone AICore does not expose Gemini Nano
to third-party apps (the same result as Firebase Test Lab's Pixel 10 Pro and Galaxy S25, where every Nano option reported
UNAVAILABLE), so REDPEN routes reads to Gemini in the cloud through Firebase AI Logic — the hybrid fallback working as designed.
On-device inference itself is proven in Chrome with Gemini Nano: see `../ondevice-learning-2026-11-14/`.

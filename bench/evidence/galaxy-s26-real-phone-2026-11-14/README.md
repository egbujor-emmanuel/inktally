# REDPEN on a real Galaxy S26 (Samsung Remote Test Lab, 2026-11-14)

Device: Samsung Galaxy S26, SM-S942U (USA, Texas lab), Android 16. Build: debug APK 0.6.0 (commit b20d8b7).

1. `1-install-prompt.png` — Android's installer: "Install this app? REDPEN".
2. `2-app-installed.png` — "App installed".
3. `3-redpen-running-cloud-fallback.png` — REDPEN running on the phone. Status line: "Online · Cloud AI (no on-device model)".

What it shows: the Android app installs and runs on a current flagship. On this lab phone AICore does not expose Gemini Nano
to third-party apps (the same result as Firebase Test Lab's Pixel 10 Pro and Galaxy S25, where every Nano option reported
UNAVAILABLE), so REDPEN routes reads to Gemini in the cloud through Firebase AI Logic — the hybrid fallback working as designed.
On-device inference itself is proven in Chrome with Gemini Nano: see `../ondevice-learning-2026-11-14/`.

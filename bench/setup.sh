#!/bin/bash
# One-time Codespace setup: Google Chrome + virtual display + recorder + Playwright client.
set -e
cd /tmp && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get update -qq >/dev/null
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ./google-chrome-stable_current_amd64.deb xvfb ffmpeg >/dev/null 2>&1
cd /workspaces/buildhybridai-nano-probe && npm i --no-save --silent playwright@1.49.1
google-chrome --version

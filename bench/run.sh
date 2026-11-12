#!/bin/bash
# Usage: ./run.sh probe.mjs|bench.mjs  — runs a driver under Xvfb with screen recording into out/.
cd /workspaces/buildhybridai-nano-probe
SCRIPT=${1:-probe.mjs}; NAME=${SCRIPT%.mjs}
mkdir -p out
pgrep Xvfb >/dev/null || (Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &)
sleep 2
export DISPLAY=:99 CHROME_PROFILE=/tmp/chrome-profile CHROME_NO_SANDBOX=1
ffmpeg -loglevel error -y -f x11grab -video_size 1280x800 -framerate 10 -i :99 -c:v libx264 -preset ultrafast -pix_fmt yuv420p "out/$NAME.mp4" &
FF=$!
stdbuf -oL node "$SCRIPT" > "out/$NAME.log" 2>&1
echo "EXIT=$?" >> "out/$NAME.log"
kill -INT $FF; sleep 3
echo FINISHED >> "out/$NAME.log"

#!/bin/bash
set -e

rm -f /tmp/.X99-lock
find /app/.wwebjs_cache /app/.wwebjs_auth -name 'SingletonLock' -delete 2>/dev/null || true

Xvfb :99 -screen 0 1280x720x24 &

export DISPLAY=:99

while ! xdpyinfo -display :99 >/dev/null 2>&1; do sleep 0.1; done

x11vnc -display :99 -nopw -listen localhost -xkb -forever &
websockify --web /usr/share/novnc 6080 localhost:5900 &

exec npx electron . --no-sandbox

FROM node:18-slim

# Install Electron/Chromium system dependencies + Xvfb for virtual display
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xauth \
    libgbm1 \
    libasound2 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libgles2 \
    libgl1-mesa-glx \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    fonts-liberation \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript and copy renderer assets
RUN npx tsc || true && \
    mkdir -p dist/renderer && \
    cp src/renderer/index.html dist/renderer/index.html && \
    cp src/renderer/styles.css dist/renderer/styles.css

# Start Xvfb on a virtual display, then launch Electron
EXPOSE 6080
CMD rm -f /tmp/.X99-lock && \
    find /app/.wwebjs_cache /app/.wwebjs_auth -name 'SingletonLock' -delete 2>/dev/null || true && \
    Xvfb :99 -screen 0 1280x720x24 & \
    export DISPLAY=:99 && \
    x11vnc -display :99 -nopw -listen localhost -xkb -forever & \
    websockify --web /usr/share/novnc 6080 localhost:5900 & \
    npx electron . --no-sandbox

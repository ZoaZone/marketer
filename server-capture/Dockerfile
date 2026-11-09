# The official Playwright image ships Chromium/Firefox/WebKit and every OS
# dependency they need pre-installed, matched exactly to this tag's
# Playwright version — keep this tag in lockstep with the "playwright"
# version pinned (not caret-ranged) in package.json, or the npm package's
# expected browser build can drift from what's actually on disk here.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE $PORT
CMD ["node", "index.js"]

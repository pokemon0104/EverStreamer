#!/usr/bin/env bash
# EverStreamer を起動する(macOS / Linux) / Start EverStreamer (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js が見つかりません / Node.js is not installed. Install the LTS version from https://nodejs.org/"
  read -r -p "Enter で閉じる / Press Enter to close" _; exit 1
fi
major=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [ "$major" -lt 18 ]; then
  echo "[!] Node.js 18 以上が必要です / Node.js 18 or newer is required (now: $(node -v))"
  read -r -p "Enter" _; exit 1
fi
if [ ! -f node_modules/express/package.json ] || [ ! -f node_modules/ws/package.json ]; then
  echo "初回の準備をしています… / Installing dependencies (first run)..."
  npm install --no-audit --no-fund || { echo "[!] npm install failed"; read -r -p "Enter" _; exit 1; }
fi
export PORT="${PORT:-3000}"
export SOK_OPEN=1
node server.js

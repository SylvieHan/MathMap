#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo "  Install Node.js 20+ from https://nodejs.org/"
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo ""
  echo "  First run — installing dependencies (one time)..."
  echo ""
  npm install
fi

echo ""
echo "  MathMap editor starting..."
echo "  Browser: http://localhost:5173"
echo "  Keep this window open while editing. Press Ctrl+C to stop."
echo ""

(sleep 2 && {
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173"
  fi
}) &

npm run dev

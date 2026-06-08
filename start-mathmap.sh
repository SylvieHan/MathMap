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

# Keep the URL stable: close a leftover dev server from a previous session.
if command -v lsof >/dev/null 2>&1; then
  stale=$(lsof -ti:5173 2>/dev/null || true)
  if [[ -n "$stale" ]]; then
    echo ""
    echo "  Closing previous MathMap session on port 5173..."
    kill $stale 2>/dev/null || true
    sleep 0.5
  fi
fi

echo ""
echo "  MathMap editor starting..."
echo "  Your browser will open automatically when ready."
echo "  Keep this window open while editing. Press Ctrl+C to stop."
echo ""

exec npm run dev -- --open --port 5173 --strictPort

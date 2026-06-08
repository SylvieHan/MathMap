#!/usr/bin/env bash
# Build a self-contained MathMap-handoff folder (and zip) for another developer.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/../MathMap-handoff}"

echo "Packing MathMap handoff → $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude dist
  --exclude .git
  --exclude .cursor
  --exclude '*.mathmap'
  --exclude .DS_Store
  --exclude MathMap-handoff.zip
  --exclude '../MathMap-handoff'
)

rsync -a "${RSYNC_EXCLUDES[@]}" "$ROOT/" "$OUT/"

# Ensure launchers are executable on Unix
chmod +x "$OUT/start-mathmap.sh" "$OUT/Start MathMap.command" 2>/dev/null || true
chmod +x "$OUT/scripts/pack-handoff.sh" 2>/dev/null || true

ZIP="${OUT}.zip"
rm -f "$ZIP"
(cd "$(dirname "$OUT")" && zip -r "$(basename "$ZIP")" "$(basename "$OUT")" -x "*.DS_Store")

echo ""
echo "Done."
echo "  Folder: $OUT"
echo "  Zip:    $ZIP"
echo ""
echo "Tell them: open START-HERE.md first."

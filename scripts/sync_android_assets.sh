#!/usr/bin/env bash
# Re-copy the static site into the Android app's assets.
# Run from the repo root after changing index.html / css / js:
#
#     ./scripts/sync_android_assets.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/android/app/src/main/assets/www"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$ROOT/index.html" "$ROOT/css" "$ROOT/js" "$DEST/"

echo "Synced site -> $DEST"
find "$DEST" -type f | sed "s|$ROOT/||" | sort

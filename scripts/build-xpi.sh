#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
XPI="$OUT/reader-position-stack.xpi"

mkdir -p "$OUT"
rm -f "$XPI"

cd "$ROOT"
zip -qr "$XPI" \
  manifest.json \
  prefs.js \
  preferences.xhtml \
  preferences.css \
  bootstrap.js \
  content \
  README.md

echo "$XPI"

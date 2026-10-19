#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip with manifest.json at the zip root.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./src/manifest.json').version")
mkdir -p dist
OUT="dist/inkpad-${VERSION}.zip"
rm -f "$OUT"
(cd src && zip -rq "../$OUT" . -x '.*')
echo "Built $OUT"

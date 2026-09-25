#!/usr/bin/env bash
# Packages the extension into dist/ for store submission.
# Produces:
#   dist/lagom-lens/                 unpacked extension (used by `web-ext sign`)
#   dist/lagom-lens-<version>.zip    archive (used for the Chrome Web Store)
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(manifest.json LICENSE src popup icons)

version=$(node -p "require('./manifest.json').version")
out=dist/lagom-lens

rm -rf dist
mkdir -p "$out"
cp -R "${FILES[@]}" "$out/"
find "$out" \( -name '.DS_Store' -o -name 'Thumbs.db' \) -delete

(cd "$out" && zip -qr -X "../lagom-lens-$version.zip" .)

echo "Packaged version $version -> dist/lagom-lens-$version.zip"

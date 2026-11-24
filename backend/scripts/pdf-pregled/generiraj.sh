#!/usr/bin/env bash
# Vizualni pregled PDF-a računa bez Workera: esbuild bundla generator (fontovi
# kao binary, kao wrangler "Data" rule), node ga pokrene, pdftoppm napravi PNG.
#   scripts/pdf-pregled/generiraj.sh [izlazni-dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
IZLAZ="${1:-$(mktemp -d)}"
mkdir -p "$IZLAZ"
npx esbuild scripts/pdf-pregled/ulaz.ts --bundle --platform=node --format=esm \
  --loader:.ttf=binary --outfile="$IZLAZ/pregled.mjs" --log-level=warning \
  --banner:js="Uint8Array.fromBase64 ??= (b) => new Uint8Array(Buffer.from(b, 'base64'));"
node "$IZLAZ/pregled.mjs" "$IZLAZ" scripts/pdf-pregled/primjer-logo.png
if command -v pdftoppm >/dev/null; then
  for f in "$IZLAZ"/*.pdf; do pdftoppm -r 80 -png "$f" "${f%.pdf}"; done
fi
ls "$IZLAZ"

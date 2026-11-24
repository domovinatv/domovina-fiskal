#!/usr/bin/env bash
# Subset fontova za PDF računa (src/pdf/fontovi/). Izvor: Inter 4.001 (SIL OFL 1.1,
# https://github.com/rsms/inter), statični Regular/Bold.
#   scripts/fontovi-subset.sh <dir-s-Inter-Regular.ttf-i-Inter-Bold.ttf>
# Raspon: Basic Latin, Latin-1, Latin Extended-A (č ć đ š ž …), tipografski
# navodnici i crtice (uklj. „ U+201E), €, •, ·, ✓. Zadržava samo kern: pdf-lib krivo mjeri
# glifove zamijenjene kroz calt/case (razmaci iza „:“, „(“ i „-“). Tablične
# znamenke se zato upisuju izravno u cmap (fontovi-tnum.py).
set -euo pipefail
IZVOR="${1:?putanja do direktorija s Inter-*.ttf}"
CILJ="$(dirname "$0")/../src/pdf/fontovi"
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030,U+2039-203A,U+20AC,U+2116,U+2122,U+2212,U+2713"
for tezina in Regular Bold; do
  pyftsubset "$IZVOR/Inter-$tezina.ttf" --unicodes="$UNICODES" \
    --layout-features='kern,tnum' --no-hinting --desubroutinize \
    --output-file="$CILJ/Inter-$tezina.subset.ttf"
  python3 -I "$(dirname "$0")/fontovi-tnum.py" "$CILJ/Inter-$tezina.subset.ttf" "$CILJ/Inter-$tezina.subset.ttf"
done
ls -la "$CILJ"

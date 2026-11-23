#!/usr/bin/env bash
# Builda customer dashboard (domovina-fiskal-app, Next static export s basePath /app)
# i kopira ga u backend/app-dist/app/, odakle ga Worker servira kao static assets
# (wrangler.toml [assets]). Zovu ga `npm run build:app`, `deploy` i `deploy:test`.
#
# Putanja appa: FISKAL_APP_DIR (zadano: repo appa na DOMOVINA2TB).
# Ista app ide na TEST i PROD: API je relativan (/api/v1), pa nema varijabli po okolini.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${FISKAL_APP_DIR:-/Volumes/DOMOVINA2TB/git/domovinatv/domovina-fiskal-app}"
ODREDISTE="$BACKEND_DIR/app-dist"

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "build-app: nema appa u $APP_DIR (postavi FISKAL_APP_DIR)" >&2
  exit 1
fi

echo "build-app: app iz $APP_DIR ($(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'bez gita'))"
if [ -n "$(git -C "$APP_DIR" status --porcelain 2>/dev/null)" ]; then
  echo "build-app: UPOZORENJE — app ima necommitane promjene; builda se radno stablo" >&2
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  (cd "$APP_DIR" && npm ci)
fi
(cd "$APP_DIR" && npm run build)

if [ ! -f "$APP_DIR/out/index.html" ]; then
  echo "build-app: build nije dao out/index.html" >&2
  exit 1
fi

rm -rf "$ODREDISTE"
mkdir -p "$ODREDISTE/app"
cp -R "$APP_DIR/out/." "$ODREDISTE/app/"

# Zaglavlja za stranice dashboarda (Workers static assets čitaju _headers iz korijena
# direktorija). Odgovori Workera (/api, /admin) imaju svoja zaglavlja.
cat > "$ODREDISTE/_headers" <<'EOF'
/app/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
EOF

echo "build-app: $(find "$ODREDISTE" -type f | wc -l | tr -d ' ') datoteka u $ODREDISTE"

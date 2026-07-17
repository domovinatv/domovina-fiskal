#!/usr/bin/env bash
# dodaj-tenant-test.sh — kreira tenanta "Lion Base obrt" na ISKLJUČIVO TEST
# okruženju (https://fiskal-test.domovina.ai) kroz /admin form POST-ove.
#
# Idempotentno: tenant se traži po OIB-u, prostor/uređaj/operater/ključ po
# oznaci/opisu — postojeće se ne dira, kreira se samo što nedostaje.
#
# Upotreba:
#   ./dodaj-tenant-test.sh [--email adresa@primjer.hr]
#
#   --email  (opcionalno) doda SSO korisnika (uloga vlasnik) za customer
#            dashboard (fiskal-app-test.domovina.ai)
#
# Kredencijali: ADMIN_USER/ADMIN_PASS iz backend/.dev.vars (isti su na test workeru).
# Sirovi API ključ (dfk_…) se sprema u secrets/lion-base-test-api-kljuc.txt (gitignored).
set -euo pipefail

# ── Tvrdi guard: SAMO test okruženje ─────────────────────────────────────────
BASE="https://fiskal-test.domovina.ai"
if [[ -n "${FISKAL_BASE_URL:-}" && "${FISKAL_BASE_URL}" != "${BASE}" ]]; then
  echo "ODBIJENO: FISKAL_BASE_URL='${FISKAL_BASE_URL}' nije TEST okruženje (${BASE})." >&2
  echo "Ova skripta radi ISKLJUČIVO na TEST-u — produkcija (fiskal.domovina.ai) je zabranjena." >&2
  exit 1
fi
for arg in "$@"; do
  if [[ "$arg" == *"fiskal.domovina.ai"* || "$arg" == http*://* ]]; then
    echo "ODBIJENO: skripta ne prima base URL ('$arg') — hardkodirana je na ${BASE}." >&2
    exit 1
  fi
done

# ── Podaci tenanta (izvor: companywall.hr, pristup 2026-07-17) ───────────────
TENANT_NAZIV="Lion Base obrt"
TENANT_OIB="44417010014"
TENANT_ULICA="Školska 5"
TENANT_MJESTO="Donja Lomnica"
TENANT_PBR="10412"
TENANT_IBAN=""            # nema javno — prazno
TENANT_U_PDV="0"          # ⚠️ pretpostavka (paušalni obrt) — POTVRDITI S VLASNIKOM
OPERATER_IME="Ivan Stepanić"
OPERATER_OIB="44417010014" # kod obrta OIB obrta = osobni OIB vlasnika
PROSTOR_OZNAKA="PP1"
UREDJAJ_OZNAKA="1"
KLJUC_OPIS="lion-base-test-skripta"

# ── Argumenti ────────────────────────────────────────────────────────────────
SSO_EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      [[ $# -ge 2 ]] || { echo "GREŠKA: --email zahtijeva adresu." >&2; exit 1; }
      SSO_EMAIL="$2"; shift 2 ;;
    *)
      echo "GREŠKA: nepoznat argument '$1' (podržano: --email <adresa>)." >&2; exit 1 ;;
  esac
done

# ── Kredencijali iz backend/.dev.vars ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$BACKEND_DIR")"
DEV_VARS="$BACKEND_DIR/.dev.vars"
SECRETS_DIR="$REPO_DIR/secrets"
KLJUC_DATOTEKA="$SECRETS_DIR/lion-base-test-api-kljuc.txt"

[[ -f "$DEV_VARS" ]] || { echo "GREŠKA: nema $DEV_VARS (ADMIN_USER/ADMIN_PASS)." >&2; exit 1; }
ADMIN_USER="$(grep '^ADMIN_USER=' "$DEV_VARS" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
ADMIN_PASS="$(grep '^ADMIN_PASS=' "$DEV_VARS" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]] || { echo "GREŠKA: ADMIN_USER/ADMIN_PASS nisu postavljeni u $DEV_VARS." >&2; exit 1; }

# curl uz Basic Auth; -f NE koristimo jer i 400 stranice nose flash poruke.
acurl() { curl -sS -u "$ADMIN_USER:$ADMIN_PASS" "$@"; }

echo "── Lion Base tenant na TEST okruženju ($BASE) ──"

# ── 1. Tenant (po OIB-u) ─────────────────────────────────────────────────────
# Popis tenanata: redak <a href="/admin/tenant/ID">naziv</a> pa OIB u idućem <td>.
TENANT_ID="$(acurl "$BASE/admin" | grep -B1 "class=\"mono\">$TENANT_OIB<" | grep -o 'tenant/[0-9]*' | head -1 | cut -d/ -f2 || true)"

if [[ -n "$TENANT_ID" ]]; then
  echo "✓ Tenant s OIB-om $TENANT_OIB već postoji (id=$TENANT_ID) — ne kreiram ponovno."
else
  echo "→ Kreiram tenanta '$TENANT_NAZIV' (OIB $TENANT_OIB)…"
  ODGOVOR_HEADERI="$(acurl -D - -o /dev/null \
    --data-urlencode "naziv=$TENANT_NAZIV" \
    --data-urlencode "oib=$TENANT_OIB" \
    --data-urlencode "ulica=$TENANT_ULICA" \
    --data-urlencode "mjesto=$TENANT_MJESTO" \
    --data-urlencode "postanski_broj=$TENANT_PBR" \
    --data-urlencode "iban=$TENANT_IBAN" \
    --data-urlencode "u_sustavu_pdv=$TENANT_U_PDV" \
    --data-urlencode "oznaka_slijednosti=P" \
    "$BASE/admin/tenanti")"
  # 303 → Location: /admin/tenant/:id
  TENANT_ID="$(printf '%s' "$ODGOVOR_HEADERI" | grep -i '^location:' | grep -o 'tenant/[0-9]*' | cut -d/ -f2 || true)"
  if [[ -z "$TENANT_ID" ]]; then
    echo "GREŠKA: kreiranje tenanta nije vratilo redirect. Headeri:" >&2
    printf '%s\n' "$ODGOVOR_HEADERI" >&2
    exit 1
  fi
  echo "✓ Tenant kreiran (id=$TENANT_ID)."
fi

DETALJ_URL="$BASE/admin/tenant/$TENANT_ID"
DETALJ="$(acurl "$DETALJ_URL")"

# ── 2. Poslovni prostor PP1 ──────────────────────────────────────────────────
# Postojanje + ID čitamo iz selecta forme za uređaje: <option value="ID">PP1</option>
PROSTOR_ID="$(printf '%s' "$DETALJ" | grep -o "<option value=\"[0-9]*\">$PROSTOR_OZNAKA</option>" | grep -o '[0-9]*' | head -1 || true)"
if [[ -n "$PROSTOR_ID" ]]; then
  echo "✓ Poslovni prostor $PROSTOR_OZNAKA već postoji (id=$PROSTOR_ID)."
else
  echo "→ Kreiram poslovni prostor ${PROSTOR_OZNAKA}…"
  acurl -o /dev/null \
    --data-urlencode "oznaka=$PROSTOR_OZNAKA" \
    --data-urlencode "ulica=$TENANT_ULICA" \
    --data-urlencode "naselje=$TENANT_PBR $TENANT_MJESTO" \
    --data-urlencode "datum_pocetka=$(date +%F)" \
    "$DETALJ_URL/prostori"
  DETALJ="$(acurl "$DETALJ_URL")"
  PROSTOR_ID="$(printf '%s' "$DETALJ" | grep -o "<option value=\"[0-9]*\">$PROSTOR_OZNAKA</option>" | grep -o '[0-9]*' | head -1 || true)"
  [[ -n "$PROSTOR_ID" ]] || { echo "GREŠKA: prostor $PROSTOR_OZNAKA nije vidljiv nakon kreiranja." >&2; exit 1; }
  echo "✓ Prostor kreiran (id=$PROSTOR_ID)."
fi

# ── 3. Naplatni uređaj 1 u PP1 ───────────────────────────────────────────────
# Redak u tablici uređaja: <td class="mono">PP1</td><td class="mono">1</td>
if printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$PROSTOR_OZNAKA</td><td class=\"mono\">$UREDJAJ_OZNAKA</td>"; then
  echo "✓ Naplatni uređaj $UREDJAJ_OZNAKA u $PROSTOR_OZNAKA već postoji."
else
  echo "→ Kreiram naplatni uređaj $UREDJAJ_OZNAKA u ${PROSTOR_OZNAKA}…"
  acurl -o /dev/null \
    --data-urlencode "poslovni_prostor_id=$PROSTOR_ID" \
    --data-urlencode "oznaka=$UREDJAJ_OZNAKA" \
    --data-urlencode "opis=Primarni uređaj" \
    "$DETALJ_URL/uredjaji"
  DETALJ="$(acurl "$DETALJ_URL")"
  printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$PROSTOR_OZNAKA</td><td class=\"mono\">$UREDJAJ_OZNAKA</td>" \
    || { echo "GREŠKA: uređaj nije vidljiv nakon kreiranja." >&2; exit 1; }
  echo "✓ Uređaj kreiran."
fi

# ── 4. Operater ──────────────────────────────────────────────────────────────
# Redak operatera: <td class="mono">OIB</td><td>Ime</td> (header koristi <span>, ne <td>)
if printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$OPERATER_OIB</td><td>"; then
  echo "✓ Operater $OPERATER_OIB već postoji."
else
  echo "→ Dodajem operatera $OPERATER_IME ($OPERATER_OIB)…"
  acurl -o /dev/null \
    --data-urlencode "oib=$OPERATER_OIB" \
    --data-urlencode "ime=$OPERATER_IME" \
    "$DETALJ_URL/operateri"
  DETALJ="$(acurl "$DETALJ_URL")"
  printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$OPERATER_OIB</td><td>" \
    || { echo "GREŠKA: operater nije vidljiv nakon dodavanja." >&2; exit 1; }
  echo "✓ Operater dodan."
fi

# ── 5. API ključ ─────────────────────────────────────────────────────────────
# Sirovi dfk_ ključ postoji SAMO u HTML flashu odgovora na kreiranje — prefiks u
# tablici je skraćen (dfk_ + 8 hex), pa raw hvatamo kao dulji dfk_ niz.
API_KLJUC=""
if [[ -f "$KLJUC_DATOTEKA" ]]; then
  API_KLJUC="$(head -1 "$KLJUC_DATOTEKA" | tr -d '[:space:]')"
  echo "✓ API ključ već spremljen u ${KLJUC_DATOTEKA#"$REPO_DIR"/} — koristim postojeći."
elif printf '%s' "$DETALJ" | grep -q ">$KLJUC_OPIS<"; then
  echo "⚠️ Ključ s opisom '$KLJUC_OPIS' postoji na tenantu, ali $KLJUC_DATOTEKA nema —"
  echo "   sirovi ključ se prikazuje samo jednom i NE može se dohvatiti naknadno."
  echo "   Po potrebi deaktiviraj stari ključ u adminu i obriši ovaj blok stanja pa pokreni ponovno."
else
  echo "→ Kreiram API ključ (opis: $KLJUC_OPIS)…"
  KLJUC_HTML="$(acurl --data-urlencode "opis=$KLJUC_OPIS" "$DETALJ_URL/kljucevi")"
  API_KLJUC="$(printf '%s' "$KLJUC_HTML" | grep -o 'dfk_[0-9a-f]\{16,\}' | head -1 || true)"
  [[ -n "$API_KLJUC" ]] || { echo "GREŠKA: sirovi dfk_ ključ nije pronađen u odgovoru admina." >&2; exit 1; }
  mkdir -p "$SECRETS_DIR"
  umask 077
  printf '%s\n' "$API_KLJUC" > "$KLJUC_DATOTEKA"
  echo "✓ Ključ kreiran i spremljen u ${KLJUC_DATOTEKA#"$REPO_DIR"/} (gitignored)."
  DETALJ="$(acurl "$DETALJ_URL")"
fi

# ── 6. (Opcionalno) SSO korisnik dashboarda ──────────────────────────────────
if [[ -n "$SSO_EMAIL" ]]; then
  if printf '%s' "$DETALJ" | grep -qi "<td>$SSO_EMAIL</td>"; then
    echo "✓ SSO korisnik $SSO_EMAIL već ima pristup."
  else
    echo "→ Dodajem SSO korisnika $SSO_EMAIL (uloga: vlasnik)…"
    acurl -o /dev/null \
      --data-urlencode "email=$SSO_EMAIL" \
      --data-urlencode "uloga=vlasnik" \
      "$DETALJ_URL/korisnici"
    DETALJ="$(acurl "$DETALJ_URL")"
    printf '%s' "$DETALJ" | grep -qi "<td>$SSO_EMAIL</td>" \
      || { echo "GREŠKA: SSO korisnik nije vidljiv nakon dodavanja." >&2; exit 1; }
    echo "✓ SSO korisnik dodan (identitet se veže na prvoj prijavi)."
  fi
fi

# ── 7. Verifikacija ──────────────────────────────────────────────────────────
echo ""
echo "── Verifikacija ──"
BROJ_TENANATA="$(curl -sS "$BASE/" | python3 -c 'import json,sys; print(json.load(sys.stdin)["brojaci"]["tenanti"])')"
echo "✓ Root endpoint: brojaci.tenanti = $BROJ_TENANATA"

if [[ -n "$API_KLJUC" ]]; then
  echo "→ POST /api/v1/racun (PONUDA) s novim ključem…"
  PONUDA_ODGOVOR="$(curl -sS -w '\n%{http_code}' -X POST "$BASE/api/v1/racun" \
    -H "Authorization: Bearer $API_KLJUC" -H 'Content-Type: application/json' \
    -d "{\"tip\":\"PONUDA\",\"poslovniProstor\":\"$PROSTOR_OZNAKA\",\"naplatniUredaj\":\"$UREDJAJ_OZNAKA\",\"operaterOib\":\"$OPERATER_OIB\",\"nacinPlacanja\":\"TRANSAKCIJSKI\",\"stavke\":[{\"naziv\":\"Verifikacija skripte dodaj-tenant-test\",\"kolicina\":\"1\",\"netoCijena\":\"1.00\",\"pdvStopa\":\"0\"}]}")"
  PONUDA_STATUS="$(printf '%s' "$PONUDA_ODGOVOR" | tail -1)"
  PONUDA_TIJELO="$(printf '%s' "$PONUDA_ODGOVOR" | sed '$d')"
  if [[ "$PONUDA_STATUS" != "201" ]]; then
    echo "GREŠKA: PONUDA nije kreirana (HTTP $PONUDA_STATUS): $PONUDA_TIJELO" >&2
    exit 1
  fi
  RACUN_ID="$(printf '%s' "$PONUDA_TIJELO" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  PONUDA_BROJ="$(printf '%s' "$PONUDA_TIJELO" | python3 -c 'import json,sys; print(json.load(sys.stdin)["brojRacuna"])')"
  echo "✓ PONUDA kreirana: id=$RACUN_ID, broj=$PONUDA_BROJ (HTTP 201)"
  DOHVAT_ID="$(curl -sS -H "Authorization: Bearer $API_KLJUC" "$BASE/api/v1/racun/$RACUN_ID" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  [[ "$DOHVAT_ID" == "$RACUN_ID" ]] || { echo "GREŠKA: GET /api/v1/racun/$RACUN_ID vratio id=$DOHVAT_ID." >&2; exit 1; }
  echo "✓ GET /api/v1/racun/$RACUN_ID vraća isti dokument (tenant-scoped)."
else
  echo "⚠️ API verifikacija preskočena — sirovi ključ nije dostupan (vidi korak 5)."
fi

# ── 8. Sažetak ───────────────────────────────────────────────────────────────
KLJUC_MASKIRAN="${API_KLJUC:0:12}…${API_KLJUC: -4}"
[[ -n "$API_KLJUC" ]] || KLJUC_MASKIRAN="(nedostupan — vidi upozorenje gore)"
echo ""
echo "── Sažetak ──"
echo "Okruženje:        $BASE (TEST)"
echo "Tenant:           $TENANT_NAZIV — OIB $TENANT_OIB (id=$TENANT_ID)"
echo "                  $TENANT_ULICA, $TENANT_PBR $TENANT_MJESTO"
echo "U sustavu PDV-a:  NE (pretpostavka — ⚠️ POTVRDITI S VLASNIKOM)"
echo "Poslovni prostor: $PROSTOR_OZNAKA (id=$PROSTOR_ID)"
echo "Naplatni uređaj:  $UREDJAJ_OZNAKA"
echo "Operater:         $OPERATER_IME ($OPERATER_OIB)"
echo "API ključ:        $KLJUC_MASKIRAN → ${KLJUC_DATOTEKA#"$REPO_DIR"/}"
[[ -n "$SSO_EMAIL" ]] && echo "SSO dashboard:    $SSO_EMAIL (vlasnik)"
echo ""
echo "Tenant NEMA (zasebni onboarding koraci kroz admin):"
echo "  • fiskalizacijski certifikat (B2C) — upload P12 na $DETALJ_URL"
echo "  • doku API-TOKEN (eRačun 2.0) — tenant ga traži od hello@doku.hr"
echo "  • CIS prijavu prostora (ePorezna) — označiti u adminu kad je obavljena"

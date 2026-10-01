#!/usr/bin/env bash
# dodaj-tenant.sh — onboarding tenanta na TEST ili PROD kroz /admin form POST-ove
# (poopćeno iz dodaj-tenant-test.sh, Faza 4.9). PROD traži izričitu potvrdu.
#
# Idempotentno: tenant se traži po OIB-u, prostor/uređaj/operater/ključ po
# oznaci/OIB-u/opisu — postojeće se ne dira, kreira se samo što nedostaje.
#
# Upotreba (primjer: MARCIDEA d.o.o. / crosulja.hr):
#   ./dodaj-tenant.sh --okolina test \
#     --oib 73208423335 --naziv "MARCIDEA d.o.o." \
#     --ulica "…" --mjesto "…" --pbr "…" --iban "HR…" --email "…" \
#     --u-pdv 1 --prostor WEB --uredaj 1 \
#     --operater-oib 12345678903 --operater-ime "Ime Prezime" \
#     --kljuc-opis crosulja-webshop [--sso-email vlasnik@primjer.hr]
#
# Obavezno: --okolina, --oib, --naziv, --u-pdv, --operater-oib.
# ⚠️ --u-pdv: PDV status i slijednost se NE mogu mijenjati nakon prvog izdanog
#    dokumenta (Faza 4.5) — potvrdi ih s vlasnikom PRIJE prvog računa.
#
# Kredencijali (nikad u repou):
#   test → secrets/fiskal-test-admin.env (ADMIN_USER/ADMIN_PASS; rotirano 2026-10-01)
#   prod → backend/.tajne/lozinke.env (ADMIN_USER_PROD/ADMIN_PASS_PROD)
# Sirovi API ključ (dfk_…) → secrets/<oib>-<okolina>-api-kljuc.txt (gitignored).
#
# Skripta NE radi (zasebni ručni koraci, vidi sažetak na kraju):
#   upload certifikata (P12 + lozinka), oznaku CIS prijave prostora (ePorezna).
set -euo pipefail

OKOLINA="" ; OIB="" ; NAZIV="" ; ULICA="" ; MJESTO="" ; PBR="" ; IBAN="" ; EMAIL=""
U_PDV="" ; SLIJEDNOST="P" ; PROSTOR="WEB" ; UREDAJ="1" ; OPERATER_OIB="" ; OPERATER_IME=""
KLJUC_OPIS="webshop" ; SSO_EMAIL=""

while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 || "$1" == "--help" ]] || { echo "GREŠKA: '$1' traži vrijednost." >&2; exit 1; }
  case "$1" in
    --okolina) OKOLINA="$2"; shift 2 ;;
    --oib) OIB="$2"; shift 2 ;;
    --naziv) NAZIV="$2"; shift 2 ;;
    --ulica) ULICA="$2"; shift 2 ;;
    --mjesto) MJESTO="$2"; shift 2 ;;
    --pbr) PBR="$2"; shift 2 ;;
    --iban) IBAN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --u-pdv) U_PDV="$2"; shift 2 ;;
    --slijednost) SLIJEDNOST="$2"; shift 2 ;;
    --prostor) PROSTOR="$2"; shift 2 ;;
    --uredaj) UREDAJ="$2"; shift 2 ;;
    --operater-oib) OPERATER_OIB="$2"; shift 2 ;;
    --operater-ime) OPERATER_IME="$2"; shift 2 ;;
    --kljuc-opis) KLJUC_OPIS="$2"; shift 2 ;;
    --sso-email) SSO_EMAIL="$2"; shift 2 ;;
    --help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "GREŠKA: nepoznat argument '$1' (--help za popis)." >&2; exit 1 ;;
  esac
done

# ── Validacija argumenata ────────────────────────────────────────────────────
case "$OKOLINA" in
  test) BASE="https://fiskal-test.domovina.ai" ;;
  prod) BASE="https://fiskal.domovina.ai" ;;
  *) echo "GREŠKA: --okolina mora biti 'test' ili 'prod'." >&2; exit 1 ;;
esac
valjan_oib() {
  [[ "$1" =~ ^[0-9]{11}$ ]] || return 1
  local a=10 i z k
  for ((i = 0; i < 10; i++)); do
    z=${1:i:1}; a=$(( (a + z) % 10 )); [[ $a -eq 0 ]] && a=10; a=$(( (a * 2) % 11 ))
  done
  k=$(( (11 - a) % 10 ))
  [[ $k -eq ${1:10:1} ]]
}
valjan_oib "$OIB" || { echo "GREŠKA: --oib '$OIB' nije valjan OIB." >&2; exit 1; }
valjan_oib "$OPERATER_OIB" || { echo "GREŠKA: --operater-oib '$OPERATER_OIB' nije valjan OIB." >&2; exit 1; }
[[ -n "$NAZIV" ]] || { echo "GREŠKA: --naziv je obavezan." >&2; exit 1; }
[[ "$U_PDV" == "0" || "$U_PDV" == "1" ]] || { echo "GREŠKA: --u-pdv mora biti 0 ili 1 (potvrdi s vlasnikom!)." >&2; exit 1; }
[[ "$SLIJEDNOST" == "P" || "$SLIJEDNOST" == "N" ]] || { echo "GREŠKA: --slijednost mora biti P ili N." >&2; exit 1; }

# ── Kredencijali ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$BACKEND_DIR")"
SECRETS_DIR="$REPO_DIR/secrets"
procitaj() { grep "^$2=" "$1" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
if [[ "$OKOLINA" == "test" ]]; then
  KRED="$SECRETS_DIR/fiskal-test-admin.env"
  [[ -f "$KRED" ]] || { echo "GREŠKA: nema $KRED." >&2; exit 1; }
  ADMIN_USER="$(procitaj "$KRED" ADMIN_USER)"; ADMIN_PASS="$(procitaj "$KRED" ADMIN_PASS)"
else
  KRED="$BACKEND_DIR/.tajne/lozinke.env"
  [[ -f "$KRED" ]] || { echo "GREŠKA: nema $KRED." >&2; exit 1; }
  ADMIN_USER="$(procitaj "$KRED" ADMIN_USER_PROD)"; ADMIN_PASS="$(procitaj "$KRED" ADMIN_PASS_PROD)"
fi
[[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]] || { echo "GREŠKA: admin kredencijali nisu u $KRED." >&2; exit 1; }
KLJUC_DATOTEKA="$SECRETS_DIR/$OIB-$OKOLINA-api-kljuc.txt"

# ── PROD: izričita potvrda ───────────────────────────────────────────────────
if [[ "$OKOLINA" == "prod" ]]; then
  echo "⚠️  PRODUKCIJA ($BASE): tenant '$NAZIV' (OIB $OIB), u sustavu PDV-a: $([[ $U_PDV == 1 ]] && echo DA || echo NE), slijednost $SLIJEDNOST."
  echo "    PDV status i slijednost se nakon prvog računa NE mogu mijenjati."
  [[ -r /dev/tty ]] || { echo "ODBIJENO: PROD traži interaktivnu potvrdu (nema terminala)." >&2; exit 1; }
  read -r -p "Za nastavak upiši OIB tenanta ($OIB): " POTVRDA < /dev/tty
  [[ "$POTVRDA" == "$OIB" ]] || { echo "ODBIJENO: potvrda se ne podudara." >&2; exit 1; }
fi

# curl uz Basic Auth; -f NE koristimo jer i 400 stranice nose flash poruke.
acurl() { curl -sS -u "$ADMIN_USER:$ADMIN_PASS" "$@"; }

echo "── Tenant $NAZIV na $OKOLINA ($BASE) ──"

# ── 1. Tenant (po OIB-u) ─────────────────────────────────────────────────────
TENANT_ID="$(acurl "$BASE/admin" | grep -B1 "class=\"mono\">$OIB<" | grep -o 'tenant/[0-9]*' | head -1 | cut -d/ -f2 || true)"
if [[ -n "$TENANT_ID" ]]; then
  echo "✓ Tenant s OIB-om $OIB već postoji (id=$TENANT_ID) — podatke ne diram."
else
  echo "→ Kreiram tenanta…"
  HDR="$(acurl -D - -o /dev/null \
    --data-urlencode "naziv=$NAZIV" --data-urlencode "oib=$OIB" \
    --data-urlencode "ulica=$ULICA" --data-urlencode "mjesto=$MJESTO" \
    --data-urlencode "postanski_broj=$PBR" --data-urlencode "iban=$IBAN" \
    --data-urlencode "u_sustavu_pdv=$U_PDV" --data-urlencode "oznaka_slijednosti=$SLIJEDNOST" \
    "$BASE/admin/tenanti")"
  TENANT_ID="$(printf '%s' "$HDR" | grep -i '^location:' | grep -o 'tenant/[0-9]*' | cut -d/ -f2 || true)"
  [[ -n "$TENANT_ID" ]] || { echo "GREŠKA: kreiranje tenanta nije vratilo redirect:" >&2; printf '%s\n' "$HDR" >&2; exit 1; }
  echo "✓ Tenant kreiran (id=$TENANT_ID)."
  # E-mail (alarmi, reply-to) postoji samo u izmjeni tenanta (Faza 4.5).
  if [[ -n "$EMAIL" ]]; then
    acurl -o /dev/null \
      --data-urlencode "naziv=$NAZIV" --data-urlencode "ulica=$ULICA" --data-urlencode "mjesto=$MJESTO" \
      --data-urlencode "postanski_broj=$PBR" --data-urlencode "iban=$IBAN" --data-urlencode "email=$EMAIL" \
      --data-urlencode "u_sustavu_pdv=$U_PDV" --data-urlencode "oznaka_slijednosti=$SLIJEDNOST" \
      "$BASE/admin/tenant/$TENANT_ID/uredi"
    echo "✓ E-mail tenanta postavljen ($EMAIL)."
  fi
fi

DETALJ_URL="$BASE/admin/tenant/$TENANT_ID"
DETALJ="$(acurl "$DETALJ_URL")"

# ── 2. Poslovni prostor ──────────────────────────────────────────────────────
PROSTOR_ID="$(printf '%s' "$DETALJ" | grep -o "<option value=\"[0-9]*\">$PROSTOR</option>" | grep -o '[0-9]*' | head -1 || true)"
if [[ -n "$PROSTOR_ID" ]]; then
  echo "✓ Poslovni prostor $PROSTOR već postoji (id=$PROSTOR_ID)."
else
  acurl -o /dev/null --data-urlencode "oznaka=$PROSTOR" --data-urlencode "ulica=$ULICA" \
    --data-urlencode "naselje=$PBR $MJESTO" --data-urlencode "datum_pocetka=$(date +%F)" "$DETALJ_URL/prostori"
  DETALJ="$(acurl "$DETALJ_URL")"
  PROSTOR_ID="$(printf '%s' "$DETALJ" | grep -o "<option value=\"[0-9]*\">$PROSTOR</option>" | grep -o '[0-9]*' | head -1 || true)"
  [[ -n "$PROSTOR_ID" ]] || { echo "GREŠKA: prostor $PROSTOR nije vidljiv nakon kreiranja." >&2; exit 1; }
  echo "✓ Prostor $PROSTOR kreiran (id=$PROSTOR_ID)."
fi

# ── 3. Naplatni uređaj ───────────────────────────────────────────────────────
if printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$PROSTOR</td><td class=\"mono\">$UREDAJ</td>"; then
  echo "✓ Naplatni uređaj $UREDAJ u $PROSTOR već postoji."
else
  acurl -o /dev/null --data-urlencode "poslovni_prostor_id=$PROSTOR_ID" --data-urlencode "oznaka=$UREDAJ" \
    --data-urlencode "opis=Webshop" "$DETALJ_URL/uredjaji"
  DETALJ="$(acurl "$DETALJ_URL")"
  printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$PROSTOR</td><td class=\"mono\">$UREDAJ</td>" \
    || { echo "GREŠKA: uređaj nije vidljiv nakon kreiranja." >&2; exit 1; }
  echo "✓ Uređaj $UREDAJ kreiran."
fi

# ── 4. Operater ──────────────────────────────────────────────────────────────
if printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$OPERATER_OIB</td><td>"; then
  echo "✓ Operater $OPERATER_OIB već postoji."
else
  acurl -o /dev/null --data-urlencode "oib=$OPERATER_OIB" --data-urlencode "ime=$OPERATER_IME" "$DETALJ_URL/operateri"
  DETALJ="$(acurl "$DETALJ_URL")"
  printf '%s' "$DETALJ" | grep -q "<td class=\"mono\">$OPERATER_OIB</td><td>" \
    || { echo "GREŠKA: operater nije vidljiv nakon dodavanja." >&2; exit 1; }
  echo "✓ Operater $OPERATER_OIB dodan."
fi

# ── 5. API ključ ─────────────────────────────────────────────────────────────
API_KLJUC=""
if [[ -f "$KLJUC_DATOTEKA" ]]; then
  API_KLJUC="$(head -1 "$KLJUC_DATOTEKA" | tr -d '[:space:]')"
  echo "✓ API ključ već spremljen u ${KLJUC_DATOTEKA#"$REPO_DIR"/}."
elif printf '%s' "$DETALJ" | grep -q ">$KLJUC_OPIS<"; then
  echo "⚠️ Ključ '$KLJUC_OPIS' postoji na tenantu, ali $KLJUC_DATOTEKA nema — sirovi ključ se"
  echo "   prikazuje samo jednom. Deaktiviraj/obriši stari u adminu ili zadaj drugi --kljuc-opis."
else
  KLJUC_HTML="$(acurl --data-urlencode "opis=$KLJUC_OPIS" "$DETALJ_URL/kljucevi")"
  API_KLJUC="$(printf '%s' "$KLJUC_HTML" | grep -o 'dfk_[0-9a-f]\{16,\}' | head -1 || true)"
  [[ -n "$API_KLJUC" ]] || { echo "GREŠKA: sirovi dfk_ ključ nije pronađen u odgovoru admina." >&2; exit 1; }
  mkdir -p "$SECRETS_DIR"
  (umask 077; printf '%s\n' "$API_KLJUC" > "$KLJUC_DATOTEKA")
  echo "✓ Ključ kreiran → ${KLJUC_DATOTEKA#"$REPO_DIR"/} (gitignored)."
  DETALJ="$(acurl "$DETALJ_URL")"
fi

# ── 6. (Opcionalno) SSO korisnik dashboarda ──────────────────────────────────
if [[ -n "$SSO_EMAIL" ]]; then
  if printf '%s' "$DETALJ" | grep -qi "<td>$SSO_EMAIL</td>"; then
    echo "✓ SSO korisnik $SSO_EMAIL već ima pristup."
  else
    acurl -o /dev/null --data-urlencode "email=$SSO_EMAIL" --data-urlencode "uloga=vlasnik" "$DETALJ_URL/korisnici"
    echo "✓ SSO korisnik $SSO_EMAIL dodan (vlasnik)."
  fi
fi

# ── 7. Provjera: API ključ radi (samo čitanje — bez izdavanja dokumenata) ────
if [[ -n "$API_KLJUC" ]]; then
  STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $API_KLJUC" "$BASE/api/v1/postavke")"
  [[ "$STATUS" == "200" ]] || { echo "GREŠKA: GET /api/v1/postavke s novim ključem vratio $STATUS." >&2; exit 1; }
  echo "✓ API ključ radi (GET /api/v1/postavke → 200)."
fi

KLJUC_MASKIRAN="(nedostupan)"; [[ -n "$API_KLJUC" ]] && KLJUC_MASKIRAN="${API_KLJUC:0:12}…${API_KLJUC: -4}"
cat <<SAZETAK

── Sažetak ($OKOLINA) ──
Tenant:     $NAZIV — OIB $OIB (id=$TENANT_ID), PDV: $([[ $U_PDV == 1 ]] && echo DA || echo NE), slijednost $SLIJEDNOST
Prostor:    $PROSTOR (id=$PROSTOR_ID), uređaj $UREDAJ, operater $OPERATER_OIB
API ključ:  $KLJUC_MASKIRAN → ${KLJUC_DATOTEKA#"$REPO_DIR"/}

Preostali ručni koraci prije prvog fiskalnog računa ($DETALJ_URL):
  1. Upload certifikata (P12 + lozinka, okolina '$OKOLINA') — OIB u certu mora biti $OIB.
  2. Prijava prostora '$PROSTOR' u ePoreznoj (proizvođač softvera: ITalk), pa „Označi prijavljen".
  3. Probni račun + storno (POST /api/v1/racun, /racun/:id/storno) i provjera JIR-a.
SAZETAK

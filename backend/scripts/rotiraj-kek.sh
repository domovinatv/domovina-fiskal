#!/usr/bin/env bash
# Rotacija ENC_MASTER_KEY (KEK) na TEST-u ili PROD-u, bez ponovnog uploada
# certifikata, bez prekida rada i BEZ poznavanja tekućeg KEK-a.
#
#   scripts/rotiraj-kek.sh --okolina test|prod
#
# Što se događa (src/kripto-rotacija.ts, docs/knowledge/21-pohrana-certifikata.md §6):
#   Podaci (privatni ključevi, doku tokeni) su šifrirani DEK-om po retku; KEK
#   samo omata DEK. Rotacija NE dešifrira podatke — Worker odmota svaki DEK
#   tekućim i omota novim KEK-om. Tekući KEK nikad ne izlazi iz Cloudflarea.
#
#   0. suha provjera: tekući KEK otvara sve retke, nema zaostalog _NOVI (inače stop);
#   1. novi KEK (openssl rand) → clipboard → ti ga spremiš u password manager;
#   2. ENC_MASTER_KEY_NOVI ← novi (Worker čita s oba, šifrira novim);
#   3. premotavanje (jedna D1 transakcija, sve-ili-ništa) → svi na novom;
#   4. ENC_MASTER_KEY ← novi;
#   5. brisanje ENC_MASTER_KEY_NOVI.
#   Svaki korak čeka da Worker pokaže OČEKIVANU oznaku KEK-a (oznakaKek = prvih
#   12 hex SHA-256 ključa), dvaput zaredom — secret se propagira 5–20 s.
#
# Preduvjet: na okolini je deployan kod s ENC_MASTER_KEY_NOVI (2026-11-12+).
# Pokreni u Terminal.app — Claude Codeov `!` nema pravi TTY.
# KEK nikad ne ide u argv ni u datoteku: samo kroz stdin prema wrangleru.
set -euo pipefail

OKOLINA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --okolina) OKOLINA="$2"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Nepoznat argument: $1" >&2; exit 1 ;;
  esac
done
[[ "$OKOLINA" == "test" || "$OKOLINA" == "prod" ]] || { echo "Upotreba: $0 --okolina test|prod" >&2; exit 1; }
# -r /dev/tty nije dovoljno: pod Claude Codeovim `!` datoteka postoji, ali je
# otvaranje javi „Device not configured” (2026-11-12) — zato stvarno otvori.
{ : < /dev/tty; } 2>/dev/null || { echo "ODBIJENO: rotacija traži interaktivni terminal (pokreni u Terminalu, ne kroz Claude Code '!')." >&2; exit 1; }
command -v openssl >/dev/null && command -v jq >/dev/null && command -v xxd >/dev/null || { echo "Trebaju openssl, jq i xxd." >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$BACKEND_DIR")"
procitaj() { grep "^$2=" "$1" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-7dc7167b7e2e00923bfa7cd697df14e4}"

if [[ "$OKOLINA" == "test" ]]; then
  BASE="https://fiskal-test.domovina.ai"
  ENV_FLAG=(--env test)
  SKRIPTA_TOKEN="$(procitaj "$REPO_DIR/secrets/fiskal-test-admin.env" ADMIN_SKRIPTA_TOKEN)"
else
  BASE="https://fiskal.domovina.ai"
  ENV_FLAG=(--env=) # glavni worker = PROD; prazan --env utiša upozorenje o okolinama
  SKRIPTA_TOKEN="$(procitaj "$BACKEND_DIR/.tajne/lozinke.env" ADMIN_SKRIPTA_TOKEN_PROD)"
fi
[[ -n "$SKRIPTA_TOKEN" ]] || { echo "GREŠKA: nema ADMIN_SKRIPTA_TOKEN za $OKOLINA." >&2; exit 1; }

NOVI=""
trap 'NOVI=""' EXIT

# Bearer kroz config na stdin (ne u argv).
rotacija() { # $1 = '?suho=1' ili ''
  printf 'header = "Authorization: Bearer %s"\n' "$SKRIPTA_TOKEN" |
    curl -sS -K - -X POST "$BASE/admin/kripto/rotacija$1"
}
wr() { (cd "$BACKEND_DIR" && npx wrangler "$@" "${ENV_FLAG[@]}"); }
secret_put() { printf '%s' "$2" | wr secret put "$1" >/dev/null; } # $1 ime, $2 vrijednost (stdin)
secret_delete() { printf 'y\n' | wr secret delete "$1" >/dev/null; }
polje() { jq -r ".$2" <<<"$1"; }
oznaka() { printf 'ENC_MASTER_KEY:%s' "$(printf '%s' "$1" | xxd -r -p | openssl dgst -sha256 -r | cut -c1-12)"; }

# Ponavlja suhu provjeru dok ne vrati OČEKIVANO stanje dvaput zaredom (zahtjevi
# mogu pogoditi različite lokacije). $1 = jq uvjet. Postavlja R. ~90 s pa 1.
cekaj_stanje() {
  local zaredom=0 i
  echo "   (čekam da Worker vidi promjenu…)"
  for i in $(seq 1 45); do
    sleep 2
    R="$(rotacija '?suho=1')"
    if jq -e "$1" >/dev/null 2>&1 <<<"$R"; then
      zaredom=$((zaredom + 1))
      [[ $zaredom -ge 2 ]] && return 0
    else
      zaredom=0
    fi
  done
  return 1
}

echo "── Rotacija ENC_MASTER_KEY na $OKOLINA ($BASE) ──"

# 0. Polazno stanje
R="$(rotacija '?suho=1')"
jq -e '.oznakaTekuci != null' >/dev/null <<<"$R" || { echo "GREŠKA: $BASE nema novu /admin/kripto/rotacija (deployaj kod) ili odgovor nije JSON: $R" >&2; exit 1; }
UKUPNO="$(polje "$R" ukupno)"
echo "0. Redaka s omotanim DEK-om: $UKUPNO; tekući KEK ($(polje "$R" oznakaTekuci)) otvara: $(polje "$R" tekuci)"
[[ "$(polje "$R" oznakaNovi)" == "null" ]] ||
  { echo "STOP: ENC_MASTER_KEY_NOVI već postoji ($(polje "$R" oznakaNovi)) — prethodna rotacija nije dovršena. NE briši ga (retci su možda već na njemu); javi se." >&2; exit 1; }
[[ "$(polje "$R" nijedan)" == "0" && "$(polje "$R" tekuci)" == "$UKUPNO" ]] ||
  { echo "STOP: tekući KEK ne otvara sve retke (nijedan: $(polje "$R" nijedanRedovi)). Ne rotiram." >&2; exit 1; }

if [[ "$OKOLINA" == "prod" ]]; then
  echo "⚠️  PRODUKCIJA. Svi certifikati i doku tokeni bit će premotani novim KEK-om."
  read -r -p "Za nastavak upiši ROTIRAJ: " POTVRDA < /dev/tty
  [[ "$POTVRDA" == "ROTIRAJ" ]] || { echo "ODBIJENO." >&2; exit 1; }
fi

# 1. Novi KEK
NOVI="$(openssl rand -hex 32)"
ON="$(oznaka "$NOVI")"
printf '%s' "$NOVI" | pbcopy
echo "1. Novi KEK ($ON) je u clipboardu. Spremi ga u password manager kao"
echo "   „domovina-fiskal ENC_MASTER_KEY $OKOLINA ($(date +%F))” — bez njega se baza ne može oporaviti."
read -r -p "   Za potvrdu upiši zadnja 4 znaka novog KEK-a (iz password managera): " ZADNJA < /dev/tty
[[ "$ZADNJA" == "${NOVI: -4}" ]] || { printf '' | pbcopy; echo "ODBIJENO: ne podudara se. Ništa nije promijenjeno." >&2; exit 1; }
printf '' | pbcopy

# 2. Novi kao ENC_MASTER_KEY_NOVI
echo "2. Postavljam ENC_MASTER_KEY_NOVI…"
secret_put ENC_MASTER_KEY_NOVI "$NOVI"
cekaj_stanje ".oznakaNovi == \"$ON\" and .nijedan == 0" ||
  { echo "STOP: Worker nakon ~90 s ne pokazuje novi KEK (zadnje: $R). ENC_MASTER_KEY nije diran; ENC_MASTER_KEY_NOVI ostaje (bezopasno, Worker čita s oba). Javi se." >&2; exit 1; }

# 3. Premotavanje
R="$(rotacija '')"
echo "3. Premotano: $(polje "$R" premotano) (očekivano $(polje "$R" zaPremotati))"
[[ "$(polje "$R" premotano)" == "$(polje "$R" zaPremotati)" && "$(polje "$R" oznakaNovi)" == "$ON" ]] ||
  { echo "STOP: neočekivan rezultat: $R. ENC_MASTER_KEY i ENC_MASTER_KEY_NOVI ostaju; javi se." >&2; exit 1; }
R="$(rotacija '?suho=1')"
[[ "$(polje "$R" naNovom)" == "$(polje "$R" ukupno)" && "$(polje "$R" nijedan)" == "0" ]] ||
  { echo "STOP: nisu svi na novom KEK-u: $R. ENC_MASTER_KEY i ENC_MASTER_KEY_NOVI ostaju; javi se." >&2; exit 1; }

# 4. Zamjena tekućeg
echo "4. Svih $(polje "$R" ukupno) redaka je na novom KEK-u. Postavljam ENC_MASTER_KEY ← novi…"
secret_put ENC_MASTER_KEY "$NOVI"
cekaj_stanje ".oznakaTekuci == \"$ON\" and .tekuci == .ukupno" ||
  { echo "STOP: Worker ne pokazuje novi ENC_MASTER_KEY (zadnje: $R). ENC_MASTER_KEY_NOVI ostaje (Worker radi); javi se." >&2; exit 1; }

# 5. NOVI van
echo "5. Brišem ENC_MASTER_KEY_NOVI…"
secret_delete ENC_MASTER_KEY_NOVI
cekaj_stanje ".oznakaNovi == null and .oznakaTekuci == \"$ON\" and .tekuci == .ukupno" ||
  { echo "UPOZORENJE: nakon brisanja ENC_MASTER_KEY_NOVI provjera ne vraća očekivano: $R" >&2; exit 1; }

echo
echo "✓ Rotacija na $OKOLINA gotova: $UKUPNO redaka na $ON. Sljedeće, ručno:"
echo "  • smoke: izdaj probni račun na TEST-u (na PROD-u: GET /admin/cis/echo i pregled tenanata), ne izdavati PROD račune;"
echo "  • stari KEK više nije u Workeru; D1 Time Travel (30 dana) i stari dumpovi s njim ostaju otključivi samo dok on postoji igdje."

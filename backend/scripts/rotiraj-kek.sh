#!/usr/bin/env bash
# Rotacija ENC_MASTER_KEY (KEK) na TEST-u ili PROD-u, bez ponovnog uploada
# certifikata i bez prekida rada.
#
#   scripts/rotiraj-kek.sh --okolina test|prod [--stari-iz-dev-vars]
#
# Što se događa (src/kripto-rotacija.ts, docs/knowledge/21-pohrana-certifikata.md §6):
#   Podaci (privatni ključevi, doku tokeni) su šifrirani DEK-om po retku; KEK
#   samo omata DEK. Rotacija NE dešifrira podatke — odmota svaki DEK starim i
#   omota novim KEK-om. Šifrirani ključevi u bazi ostaju bajt-isti.
#
#   0. suha provjera: tekući KEK otvara sve retke (inače stop);
#   1. ENC_MASTER_KEY_STARI ← dosadašnji KEK; suha provjera da ga stvarno otvara
#      sve (krivo upisan stari ključ se otkrije PRIJE zamjene, ništa ne strada);
#   2. novi KEK (openssl rand) → clipboard → ti ga spremiš u password manager;
#   3. ENC_MASTER_KEY ← novi (Worker čita s oba, šifrira novim);
#   4. rotacija (sve u jednoj D1 transakciji, sve-ili-ništa);
#   5. suha provjera bez starog: sve na novom → brisanje ENC_MASTER_KEY_STARI.
#
# Preduvjet: na okolini je deployan kod s POST /admin/kripto/rotacija.
# KEK-ovi nikad ne idu u argv ni u datoteku: samo kroz stdin prema wranglera.
set -euo pipefail

OKOLINA=""
STARI_IZ_DEV_VARS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --okolina) OKOLINA="$2"; shift 2 ;;
    --stari-iz-dev-vars) STARI_IZ_DEV_VARS=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Nepoznat argument: $1" >&2; exit 1 ;;
  esac
done
[[ "$OKOLINA" == "test" || "$OKOLINA" == "prod" ]] || { echo "Upotreba: $0 --okolina test|prod [--stari-iz-dev-vars]" >&2; exit 1; }
# -r /dev/tty nije dovoljno: pod Claude Codeovim `!` datoteka postoji, ali je
# otvaranje javi „Device not configured” (2026-11-12) — zato stvarno otvori.
{ : < /dev/tty; } 2>/dev/null || { echo "ODBIJENO: rotacija traži interaktivni terminal (pokreni u Terminalu, ne kroz Claude Code '!')." >&2; exit 1; }
command -v openssl >/dev/null && command -v jq >/dev/null || { echo "Trebaju openssl i jq." >&2; exit 1; }

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
  ENV_FLAG=()
  SKRIPTA_TOKEN="$(procitaj "$BACKEND_DIR/.tajne/lozinke.env" ADMIN_SKRIPTA_TOKEN_PROD)"
fi
[[ -n "$SKRIPTA_TOKEN" ]] || { echo "GREŠKA: nema ADMIN_SKRIPTA_TOKEN za $OKOLINA." >&2; exit 1; }

STARI=""; NOVI=""
trap 'STARI=""; NOVI=""' EXIT

# Bearer kroz config na stdin (ne u argv).
rotacija() { # $1 = '?suho=1' ili ''
  printf 'header = "Authorization: Bearer %s"\n' "$SKRIPTA_TOKEN" |
    curl -sS -K - -X POST "$BASE/admin/kripto/rotacija$1"
}
secret_put() { # $1 ime, $2 vrijednost (stdin, ne argv)
  printf '%s' "$2" | (cd "$BACKEND_DIR" && npx wrangler secret put "$1" ${ENV_FLAG[@]+"${ENV_FLAG[@]}"}) >/dev/null
}
polje() { jq -r ".$2" <<<"$1"; }
# Secret postaje vidljiv tek kad se nova verzija Workera propagira (izmjereno
# 2026-11-12 na TEST-u: 5–10 s, dakle fiksnih 10 s je na granici). Zato se ne
# spava naslijepo nego se ponavlja suha provjera dok ne vrati OČEKIVANO stanje,
# dvaput zaredom (zahtjevi mogu pogoditi različite lokacije). Bez toga bi korak 3
# na staroj verziji vidio „sve na tekućem”, premotao 0 i obrisao stari KEK.
# $1 = jq uvjet nad odgovorom suhe provjere. Postavlja R. Vraća 1 nakon ~90 s.
cekaj_stanje() {
  local zaredom=0 i
  echo "   (čekam da se secret propagira…)"
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
jq -e '.ukupno != null' >/dev/null <<<"$R" || { echo "GREŠKA: $BASE nema /admin/kripto/rotacija (deployaj kod) ili odgovor nije JSON: $R" >&2; exit 1; }
UKUPNO="$(polje "$R" ukupno)"
echo "0. Redaka s omotanim DEK-om: $UKUPNO; tekući KEK otvara: $(polje "$R" tekuci)"
[[ "$(polje "$R" nijedan)" == "0" && "$(polje "$R" tekuci)" == "$(polje "$R" ukupno)" ]] ||
  { echo "STOP: tekući KEK ne otvara sve retke (nijedan: $(polje "$R" nijedanRedovi)). Ne rotiram." >&2; exit 1; }

if [[ "$OKOLINA" == "prod" ]]; then
  echo "⚠️  PRODUKCIJA. Svi certifikati i doku tokeni bit će premotani novim KEK-om."
  read -r -p "Za nastavak upiši ROTIRAJ: " POTVRDA < /dev/tty
  [[ "$POTVRDA" == "ROTIRAJ" ]] || { echo "ODBIJENO." >&2; exit 1; }
fi

# 1. Stari KEK
if [[ $STARI_IZ_DEV_VARS == 1 ]]; then
  STARI="$(procitaj "$BACKEND_DIR/.dev.vars" ENC_MASTER_KEY)"
else
  read -r -s -p "Upiši DOSADAŠNJI ENC_MASTER_KEY za $OKOLINA (ne prikazuje se): " STARI < /dev/tty; echo
fi
[[ "$STARI" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "GREŠKA: stari KEK mora biti 64 hex znaka." >&2; exit 1; }
echo "1. Postavljam ENC_MASTER_KEY_STARI i provjeravam da otvara sve retke…"
secret_put ENC_MASTER_KEY_STARI "$STARI"
if ! cekaj_stanje '.stariOtvara == .ukupno'; then
  echo "STOP: nakon ~90 s upisani stari KEK otvara $(polje "$R" stariOtvara)/$(polje "$R" ukupno) redaka — nije tekući (ili se secret nije propagirao). ENC_MASTER_KEY nije diran." >&2
  printf 'y\n' | (cd "$BACKEND_DIR" && npx wrangler secret delete ENC_MASTER_KEY_STARI ${ENV_FLAG[@]+"${ENV_FLAG[@]}"}) >/dev/null || true
  exit 1
fi
echo "   ✓ stari KEK otvara svih $(polje "$R" ukupno)"

# 2. Novi KEK
NOVI="$(openssl rand -hex 32)"
printf '%s' "$NOVI" | pbcopy
echo "2. Novi KEK je u clipboardu. Spremi ga u password manager kao"
echo "   „domovina-fiskal ENC_MASTER_KEY $OKOLINA ($(date +%F))” — bez njega se baza ne može oporaviti."
read -r -p "   Za potvrdu upiši zadnja 4 znaka novog KEK-a (iz password managera): " ZADNJA < /dev/tty
[[ "$ZADNJA" == "${NOVI: -4}" ]] || { echo "ODBIJENO: ne podudara se. Ništa nije promijenjeno osim ENC_MASTER_KEY_STARI (bezopasno)." >&2; exit 1; }
printf '' | pbcopy

# 3. Zamjena tekućeg
echo "3. Postavljam novi ENC_MASTER_KEY (Worker čita s oba)…"
secret_put ENC_MASTER_KEY "$NOVI"
# Novi KEK ne otvara još ništa: tek kad Worker vidi novi, svi su „na starom”.
cekaj_stanje ".tekuci == 0 and .stari == $UKUPNO and .nijedan == 0" ||
  { echo "STOP: Worker nakon ~90 s ne pokazuje novi KEK (zadnje: $R). Ništa nije premotano; ENC_MASTER_KEY_STARI ostaje (Worker čita s oba). Ponovi suhu provjeru ručno i javi se." >&2; exit 1; }
echo "   tekući: $(polje "$R" tekuci), na starom: $(polje "$R" stari), nijedan: $(polje "$R" nijedan)"

# 4. Premotavanje
R="$(rotacija '')"
echo "4. Premotano: $(polje "$R" premotano) (očekivano $UKUPNO)"
[[ "$(polje "$R" premotano)" == "$UKUPNO" ]] || { echo "STOP: neočekivan rezultat: $R. ENC_MASTER_KEY_STARI ostaje." >&2; exit 1; }

# 5. Sve na novom → stari van
R="$(rotacija '?suho=1')"
[[ "$(polje "$R" tekuci)" == "$UKUPNO" && "$(polje "$R" ukupno)" == "$UKUPNO" ]] || { echo "STOP: nisu svi na novom KEK-u: $R. ENC_MASTER_KEY_STARI ostaje." >&2; exit 1; }
echo "5. Svih $(polje "$R" ukupno) redaka je na novom KEK-u. Brišem ENC_MASTER_KEY_STARI…"
printf 'y\n' | (cd "$BACKEND_DIR" && npx wrangler secret delete ENC_MASTER_KEY_STARI ${ENV_FLAG[@]+"${ENV_FLAG[@]}"}) >/dev/null
cekaj_stanje ".tekuci == $UKUPNO and .stariOtvara == 0" ||
  { echo "UPOZORENJE: nakon brisanja starog KEK-a provjera ne vraća $UKUPNO/$UKUPNO na tekućem: $R" >&2; exit 1; }

echo
echo "✓ Rotacija na $OKOLINA gotova. Sljedeće, ručno:"
echo "  • smoke: izdaj probni račun na TEST-u (na PROD-u: GET /admin/cis/echo i pregled tenanta), ne izdavati PROD račune;"
echo "  • stari KEK je i dalje u backend/.dev.vars (i na drugoj okolini ako nije rotirana):"
echo "    dok postoji igdje, stari dumpovi i D1 Time Travel (30 dana) ostaju otključivi;"
echo "  • u .dev.vars stavi vlastiti lokalni KEK: openssl rand -hex 32 (lokalni podaci postaju nečitljivi)."

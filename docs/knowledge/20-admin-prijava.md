# 20 — Admin prijava: Cloudflare Access (OTP) + passkey

> SPOT za prijavu u `/admin` (platformski admin, ne tenant dashboard — za to vidi
> `16-dashboard-sso.md`). Zamjenjuje Basic Auth od 2026-11-11. Model je **1:1** iz
> `~/git/logomedo/logomedo.com` (`docs/admin.md`, `src/lib/admin/*`, `src/middleware.ts`),
> a tamo iz `omm.domovina.ai` i `pay.domovina.ai` — sigurnosnu logiku držati u skladu s njima.
> Plan: `../handoff/2026-11-11-admin-access-passkey.md`.

## Model

- **Kod** je u `backend/src/admin/auth/`: `access.ts` (JWT), `sesija.ts`, `passkey.ts`,
  `klijent.ts` (WebAuthn u pregledniku, inline), `rute.ts`, `zastita.ts` (middleware).
- **E-mailovi admina nisu u repou** (repo je javan): secret `ADMIN_EMAILS` („a@x,b@y”,
  bez razmaka), po okolini (`wrangler secret put ADMIN_EMAILS [--env test]`). Isti popis
  ide u Access politiku „Fiskal admini”, **svaki e-mail kao zasebno Include → Email pravilo**
  (jedno pravilo s „a, b” Access uspoređuje doslovno i ne propušta nikoga, a OTP se tiho
  ne šalje — zamka iz logomeda, 31. 10. 2026.).
- `/admin/sso` štiti Access aplikacija „Fiskal admin (sso)” (D.O.M. račun, tim
  `domovina.cloudflareaccess.com`, IdP One-time PIN), s destinacijama
  `fiskal-test.domovina.ai/admin/sso` i `fiskal.domovina.ai/admin/sso`. Worker dodatno
  provjerava JWT (RS256, issuer, `ACCESS_AUD`) i `ADMIN_EMAILS`. Access sesija je po timu:
  tko je prijavljen u omm/logomedo admin, ulazi bez novog koda.
- **Passkey**: rpID = hostname, discoverable, UV required. Dodaje se samo u sesiji otvorenoj
  **Accessom** unutar zadnjih 10 min; najviše 5 po e-mailu. TEST i PROD imaju odvojene
  ključeve (različit host = različit rpID).
- **Sesija**: kolačić `__Host-fiskal_admin` (HttpOnly, Secure, SameSite=Lax), u D1 samo
  sha-256 tokena (`admin_sessions`, migracija `0010`). 12 h, istječe nakon 2 h neaktivnosti.
  Micanje e-maila iz `ADMIN_EMAILS` oduzima pristup odmah.
- **CSRF**: svaki ne-GET sa sesijom mora imati `Origin` jednak originu. Referrer-Policy je
  `same-origin` (ne `no-referrer`, jer uz nju preglednik na `<form>` POST šalje `Origin: null`).
- **CSP** s nonceom na HTML-u: inline `<script>` dobiva nonce u middlewareu; **inline event
  handleri (`onclick=`) ne rade** — koristiti `addEventListener`.
- **Jedan host** (`ADMIN_HOST` var): admin na drugom hostu (npr. `*.workers.dev`) → 301.
- **Skripte** (`scripts/dodaj-tenant.sh`): `Authorization: Bearer <ADMIN_SKRIPTA_TOKEN>`
  (secret, ≥ 32 znaka; lokalno u `secrets/fiskal-test-admin.env` → `ADMIN_SKRIPTA_TOKEN`,
  PROD u `backend/.tajne/lozinke.env` → `ADMIN_SKRIPTA_TOKEN_PROD`). Bez kolačića pa bez
  CSRF provjere; pogrešan token → 401. Po uzoru na logomedo `RUNNER_TOKEN`.
- **Prijelazno**: Basic Auth (`ADMIN_USER`/`ADMIN_PASS`) i dalje vrijedi kad je poslan u
  zaglavlju (curl), ali preglednik ga više ne dobiva (nema `WWW-Authenticate`). Ukloniti
  secrete i granu u `zastita.ts` tek kad PROD prijava Accessom i passkeyem provjereno radi.

## Postavljanje okoline

```bash
cd backend
# 1. migracija prije deploya, s provjerom izlaza
npx wrangler d1 migrations apply fiskal_domovina_test --remote --env test
# 2. secreti
npx wrangler secret put ADMIN_EMAILS --env test
openssl rand -hex 32 | npx wrangler secret put ADMIN_SKRIPTA_TOKEN --env test   # isti upisati u secrets/fiskal-test-admin.env
# 3. ACCESS_AUD (AUD tag Access aplikacije) u wrangler.toml, pa deploy
npm run deploy:test
```
PROD isto bez `--env test` (baza `fiskal_domovina`), uz izričito odobrenje vlasnika.

## Lokalno

Access lokalno ne radi. Sesiju upiši u lokalni D1 i postavi kolačić:

```bash
T=$(openssl rand -hex 24); H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
npx wrangler d1 execute fiskal_domovina --local --command "INSERT INTO admin_sessions (token_hash,email,method,created_at,expires_at,last_seen_at) VALUES ('$H','TVOJ_EMAIL','access',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+12 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
echo "__Host-fiskal_admin=$T"   # kolačić za localhost:8787
```
`TVOJ_EMAIL` mora biti u `ADMIN_EMAILS` u `.dev.vars`; za lokalni rad `ADMIN_HOST` ne smeta
(localhost je izuzet).

## Testovi

`backend/test/admin-prijava.test.ts`: preusmjeravanje bez sesije, istek, neaktivnost,
micanje iz `ADMIN_EMAILS`, CSRF, odjava, passkey opcije i svježina, brisanje samo vlastitog
ključa, Access JWT (krivi AUD/issuer → odbijen), `safeNext`, bearer skripta, host.

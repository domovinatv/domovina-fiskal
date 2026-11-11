# Handoff: admin prijava — Cloudflare Access (OTP) + passkey umjesto Basic Autha

Datum: 2026-11-11. Vlasnik želi **identičan** model kao u `~/git/logomedo/logomedo.com`
(a tamo iz `omm.domovina.ai` i `pay.domovina.ai`) — sigurnosnu logiku držati u skladu s njima.

## Zašto
`/admin` danas štiti Basic Auth (`backend/src/admin/app.ts:64`, secreti `ADMIN_USER` /
`ADMIN_PASS`). Lozinku nitko ne pamti (TEST: `secrets/fiskal-test-admin.env`, PROD:
`backend/.tajne/lozinke.env`), a Basic Auth nema odjavu, 2FA ni trag tko je ušao.

## Izvor (pročitati prije prvog commita)
`~/git/logomedo/logomedo.com/` (nije git repo; Astro, ne Hono — logiku prenijeti, ne kopirati):

| Logomedo | Što radi |
|---|---|
| `docs/admin.md` | model, zamke (Access politika: **svaki e-mail zasebno Include pravilo**), lokalni rad |
| `src/lib/admin/access.ts` | provjera Access JWT-a (`jose`, JWKS `https://<team>/cdn-cgi/access/certs`, issuer, AUD, RS256) |
| `src/lib/admin/sesija.ts` | sesija: kolačić `__Host-…`, u D1 samo sha-256 tokena, 12 h TTL, 2 h idle, `ADMIN_EMAILS` provjera na svakom zahtjevu, jednokratni WebAuthn challenge (5 min), `safeNext` |
| `src/lib/admin/passkey.ts` | `@simplewebauthn/server`: rpID = hostname, discoverable, UV required; dodavanje samo u sesiji < 10 min, max 5 po e-mailu |
| `src/lib/admin/klijent.ts` | klijentski WebAuthn (`#passkey-login`, `#passkey-register`) |
| `src/middleware.ts` | javne putanje, CSRF (Origin == origin na svakom ne-GET), redirect na `/admin/login?next=`, CSP s nonceom |
| `src/pages/admin/{sso.ts,login.astro,passkeys.astro,logout.ts,passkey/*}` | rute |
| `migrations/0001_admin.sql` | tablice `admin_sessions`, `admin_challenges`, `admin_passkeys` |

## Što napraviti u fiskalu (Hono, `backend/`)
1. `npm i jose @simplewebauthn/server`; provjeriti da bundle radi na Workers (`nodejs_compat` je uključen).
2. Migracija **`0010_admin_prijava.sql`** (tri tablice iz logomeda). ⚠️ Refactor plan
   (`2026-10-02-pregled-koda-i-plan-refactora.md` §6 korak 6) također planira `0010` —
   tko prvi stigne uzima 0010, drugi 0011.
3. `src/admin/auth/{access,sesija,passkey}.ts` — `env` dolazi iz Hono konteksta (`c.env`), ne iz `cloudflare:workers`.
4. Zamijeniti Basic Auth middleware u `admin/app.ts`; postojeća CSRF provjera Origina (`app.ts:78-…`) ostaje/uskladiti s logomedom.
5. Rute: `GET /admin/login`, `GET /admin/sso`, `POST /admin/passkey/{login,register}/{options,verify}`,
   `GET /admin/passkeys` (popis + brisanje + dodavanje), `POST /admin/logout`. Gumb „Odjava” i „Ključevi” u layoutu (`admin/views.ts:89`).
6. Klijentski JS servirati inline s nonceom (admin je server-rendered string HTML) ili kao statičnu rutu.
7. **Skripte bez preglednika:** `backend/scripts/dodaj-tenant.sh` i testovi koriste Basic Auth kroz curl.
   Po uzoru na logomedo `RUNNER_TOKEN`: secret `ADMIN_SKRIPTA_TOKEN`, `Authorization: Bearer …` vrijedi
   za `/admin/*` (bez kolačića → bez CSRF rizika; usporedba u konstantnom vremenu). Skriptu i testove
   (`test/admin.test.ts`, `test/robusnost.test.ts`) prebaciti na to. Nakon prelaska ukloniti `ADMIN_USER/ADMIN_PASS`.
8. Secreti po okolini (`--env test` i prod): `ADMIN_EMAILS` (bez razmaka, „a@x,b@y”; e-mailovi NISU u repou),
   `ADMIN_SKRIPTA_TOKEN`; varijable `ACCESS_TEAM_DOMAIN = "domovina.cloudflareaccess.com"` i `ACCESS_AUD` u `wrangler.toml`.
9. Cloudflare (D.O.M. račun, tim `domovina.cloudflareaccess.com` — isti kao omm/logomedo): jedna self-hosted
   Access aplikacija „Fiskal admin (sso)” s destinacijama `fiskal-test.domovina.ai/admin/sso` i
   `fiskal.domovina.ai/admin/sso`, IdP One-time PIN, vlastita politika „Fiskal admini”. Access štiti
   **samo** `/admin/sso`; sve ostalo štiti Worker sesijom. Browser: Brave `ms@ff.hr` (globalni CLAUDE.md).
10. Testovi: sesija (istek, idle, micanje iz ADMIN_EMAILS), CSRF, `safeNext` (otvoreni redirect),
    Access JWT s krivim AUD-om → odbijen, bearer skripta. Lokalno: sesija se upisuje u D1 kao u `logomedo/docs/admin.md` §Lokalno.
11. Dokumentirati u `docs/` (po uzoru na `logomedo/docs/admin.md`) i u `HANDOFF.md`.

## Ne dirati
- Tenant dashboard SSO (GoTrue, `src/auth/gotrue.ts`, `fiskal-app*.domovina.ai`) — to je drugi sustav, za korisnike tenanata.
- Bearer API (`/api/v1/*`, ključevi `dfk_…`).

## Redoslijed deploya
TEST prvo, prijava Accessom → dodati passkey → odjava → prijava passkeyem → `dodaj-tenant.sh` s bearer tokenom.
Tek onda PROD, uz izričito odobrenje vlasnika. Do tada Basic Auth ostaje kao fallback (ne brisati secrete prije
nego što PROD prijava provjereno radi).

# PROMPT — Samoposlužna kupnja licence (onboarding bez admina)

> Preduvjet: dashboard + SSO (faza `16-*`) implementiran i deployan
> (fiskal.domovina.ai v0.4.0, dashboard na domovina-fiskal-app.pages.dev).
> **Prvo pročitaj `docs/knowledge/17-licenca-onboarding.md` u cijelosti** — tamo su
> sve odluke, činjenice o railu, model podataka, endpointi, sigurnost i DoD.
> Konvencije: `CLAUDE.md` (SVE hrvatski — kod, komentari, UI, commiti).

## Cilj
Korisnik prijavljen u dashboard (GoTrue SSO) koji **nema nijedan tenant** može
**sam kupiti godišnju licencu**: unese podatke firme → plati SEPA/EPC QR-om preko
**pay.domovina.ai raila** (`mpt.domovina.ai`) → backend mu **automatski kreira
tenant** + `korisnik_tenant` (vlasnik) → platformin tenant (**ITalk d.o.o.**)
mu kroz domovina-fiskal izda račun za licencu (dogfooding, AKD obrazac).

## Nepromjenjive odluke (potvrđene 2026-07-06, NE preispituj)
- Naplata: **pay.domovina.ai rail** (`POST /api/intents/` server-side iz fiskal
  Workera; potvrda **pollingom** `GET /api/intents/:sid` — webhook je zauzet
  pinkom, NE diraj rail).
- Model: **godišnja fiksna** licenca (`LICENCA_CIJENA_EUR` env; obnova = nova
  kupnja koja produži `vrijedi_do`).
- Kupnja **auto-kreira tenant** — bez admin odobrenja.
- Dogfood račun — **grana po vrsti kupca** (`17-*` §1 + `01-*` §3.1; wizard pita
  "kupujem kao firma / kao građanin"): **B2B** → `RACUN` (PDF) kao pomoćni
  dokument + ⚠️ ITalk ručno izda eRačun svojim kanalom (stablecoin/SEPA =
  transakcijski → čl. 39 ne vrijedi → eRačun obveza; automatizacija = faza 3);
  **B2C** → `FISKALNI_B2C` (svi B2C računi od 2026. se fiskaliziraju neovisno
  o plaćanju; traži ITalk certifikat u prod tenantu).
- Enforcement isteka v1 = samo banner u dashboardu, bez blokiranja (§4).

## Zadaci — BACKEND (ovaj repo, `backend/`)
1. **Migracija `0006_licence.sql`** — tablica `licenca` (DDL u `17-*` §4).
2. **Rail klijent** `src/pay/rail.ts` — `kreirajIntent()` + `dohvatiIntent()`
   (fetch na `RAIL_URL`; tipovi odgovora u `17-*` §2).
3. **Onboarding endpointi** (`17-*` §5): `GET /onboarding/ponuda`,
   `POST /onboarding/kupnja`, `POST /onboarding/potvrdi` — dodaj u
   `RUTE_BEZ_TENANTA` u `src/api/racuni.ts`. Aktivacija atomarno (D1 batch),
   idempotentno, sigurnosne provjere iz `17-*` §8 (sid vlasništvo, puni iznos,
   OIB duplikat → 409).
4. **Dogfood račun**: nakon aktivacije `kreirajDokument()` s
   `PLATFORM_TENANT_ID` kontekstom (tip RACUN, status izdano) + best-effort
   `posaljiRacunEmailom`. `racun_id` na licencu.
5. **`GET /moji-tenanti`**: uz svaki tenant vrati i `licenca: {status, vrijediDo}`
   (NULL za grandfathered/platformin tenant).
6. **Env/tipovi**: `RAIL_URL`, `LICENCA_SAFE_ADDRESS`, `LICENCA_CIJENA_EUR`,
   `PLATFORM_TENANT_ID` (wrangler.toml vars + `src/types.ts`).
7. **/admin**: na detalju tenanta prikaži licencu (status, vrijedi do, račun link);
   globalni popis licenci nije nužan u v1.

## Zadaci — FRONTEND (repo `../domovina-fiskal-app`)
8. `TenantStraza` (components/ljuska.tsx): 0 tenanata → kartica s cijenom
   (`GET /onboarding/ponuda`) + gumb "Kupi godišnju licencu" → `/dashboard/kupnja`.
9. **`/dashboard/kupnja`** wizard: forma firme → `kupnja` → otvori `checkoutUrl`
   (nova kartica) + EPC QR inline + polling `potvrdi` (3 s) → uspjeh →
   `osvjezi()` tenant context → `/dashboard`.
10. **Banner isteka licence** (iz `moji-tenanti` podataka) s CTA "Obnovi".

## Testiranje (bez stvarne uplate)
- Rail intent kreiraj s malim `expires_in_seconds` za expired-put.
- Za paid-put lokalno: mock `RAIL_URL` (npr. lokalni stub Worker/route koji vrne
  `state:'paid'` i točan `amount_received_cents`) ILI wrangler dev s
  `--var RAIL_URL:http://localhost:9999`. E2E s pravom uplatom radi Matija ručno.
- GoTrue test JWT: obrazac iz `16-*` verifikacije — service key u
  `~/git/domovinatv/domovina-api/.coolify-current.env`
  (`SERVICE_SUPABASESERVICE_KEY`) → admin API kreira potvrđenog korisnika
  (na kraju ga OBRIŠI).

## Blokatori koje traži od Matije PRIJE produkcije (smiju ostati placeholder u kodu)
- `LICENCA_CIJENA_EUR` (cijena), `LICENCA_SAFE_ADDRESS` (ITalk Gnosis Safe),
  KPD šifra usluge; kreiranje ITalk tenanta u prod /admin (naziv, OIB
  54872935051, prostor WEB, uređaj 1) → `PLATFORM_TENANT_ID`.

## Redoslijed
Backend 1→7 (testabilno curl-om + mock rail), pa frontend 8→10, pa
`.claude/skills/verify` + regresija `16-*` DoD-a, pa commit + push (oba repoa).
Deploy backenda i frontenda na kraju (isti postupak kao u `16-*` §13).

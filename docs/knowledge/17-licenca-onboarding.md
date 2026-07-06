# 17 — Samoposlužna kupnja licence (onboarding bez admina)

> SPOT za tok "korisnik bez tenanta → kupi godišnju licencu → dobije SVOJ tenant".
> Odluke donesene 2026-07-06 (Matija): naplata preko **pay.domovina.ai raila**,
> **godišnja fiksna** licenca, **auto-kreiranje tenanta** nakon plaćanja.
> Implementacijski prompt: `../handoff/licenca-onboarding.md`.
> Uzor (dogfooding): AKD/Certilia webshop — `../reference/akd-certilia-webshop-fiskalizacija.md`.

## 1. Ideja (dogfooding)

Vlasnik platforme (**ITalk d.o.o.**) je i sam tenant na domovina-fiskal. Prodaja
licence se **fakturira kroz domovina-fiskal sam** — kupac (i kad je firma) dobije
račun izdan ovim servisom, kao živi demo proizvoda kojeg kupuje (AKD obrazac:
oni fiskaliziraju prodaju fiskalizacijskih certifikata vlastitim certifikatom).

⚠️ **Vrsta dogfood računa u v1: obični `RACUN` (transakcijski), NE `FISKALNI_B2C`.**
Rail naplaćuje **SEPA credit transferom** (EPC QR), a izravna transakcija na račun
nije okidač fiskalizacije 1.0 (vidi `01-pravni-okvir.md` §2). AKD-ov čl.-39 obrazac
(JIR/ZKI + „nije izdan kao eRačun") vrijedi tek ako/kad dodamo kartičnu naplatu
(Stripe/Corvus — v2 kandidat). ⚠️ Otvoreno pravno pitanje za knjigovođu: tretman
uplate koja ide preko Monerium IBAN-a (EE…) pa se forwarda — smatramo je izravnom
transakcijom na račun (bez fiskalizacije), ali potvrditi.

## 2. Rail — činjenice (istraženo 2026-07-06, repo `pay.domovina.ai`)

Rail = CF Worker (Hono + D1) na **`https://mpt.domovina.ai`**; kod u
`pay.domovina.ai/backend/src/`. Bitno za nas:

- **`POST /api/intents/`** (`intents/api.ts`) — jednokratni payment intent:
  payload `{ target_address: "0x…" (Safe primatelja), amount_eur, label,
  metadata: {...}, expires_in_seconds }` (min 60 s, default 900, max 86400;
  max iznos 10 000 €). Odgovor: `sid`, `state`, `checkout_url`
  (`https://mpt.domovina.ai/checkout/<sid>`), `epc_qr_data`, `iban`, `memo`
  (`mpt:0x<addr>?sid=<sid>`), `status_url`, `amount_received_cents`, …
- **Bez autentikacije** (samo CORS origin-lista za browser pozive) → intent
  kreiramo **server-side iz fiskal Workera** (iznos i target pod našom
  kontrolom); tada NE treba dirati railov `ALLOWED_ORIGINS`.
- **Potvrda uplate:** `GET /api/intents/:sid` → `state: pending|paid|expired`,
  `paid_at`, `amount_received_cents`, `sender_iban/sender_name`. SSE ne postoji;
  railov checkout sam polla svake 2 s. Outbound webhook postoji
  (`intent.paid`, Standard-Webhooks potpis), ali je **jedan jedini
  `INTENT_WEBHOOK_URL` i zauzet je pinkom** → v1 fiskal koristi **polling**
  (server-side), webhook fan-out je v2 kandidat u railu.
- **UX kupca:** otvori `checkout_url` — brandirana stranica s EPC QR-om
  (skenira bankovnom aplikacijom), countdown, auto-flip na "plaćeno".
- **Provjere pri aktivaciji (server-side, obavezno):** `state === 'paid'` **i**
  `amount_received_cents === amount_cents` (rail bilježi stvarno sjeli iznos).

## 3. Tok (v1)

```
korisnik (GoTrue prijava, 0 tenanata)
  → /dashboard: umjesto "nemaš pristup" → gumb "Kupi licencu" → /dashboard/kupnja
  → korak 1: podaci firme (naziv, OIB [mod-11], ulica, mjesto, pošt. broj,
             u sustavu PDV-a?, email za račun [default = login email])
  → POST /api/v1/onboarding/kupnja  (fiskal Worker):
      * validira podatke, odbije ako OIB već ima aktivan tenant/licencu
      * rail POST /api/intents/ { target: LICENCA_SAFE_ADDRESS,
        amount_eur: LICENCA_CIJENA_EUR, label: "domovina-fiskal godišnja licenca — <naziv>",
        metadata: { sub, email, oib }, expires_in_seconds: 3600 }
      * INSERT licenca (status 'ceka_uplatu', payment_ref = sid, firma_json, kupac_sub/email)
      * → { sid, checkoutUrl, iznosEur }
  → korak 2: frontend otvori checkout_url (nova kartica) + polla
      POST /api/v1/onboarding/potvrdi { sid } svakih ~3 s
  → potvrdi (fiskal Worker, idempotentno):
      * rail GET /api/intents/:sid → paid? iznos sjeo u cijelosti?
      * transakcijski (D1 batch): tenant iz firma_json → korisnik_tenant
        (vlasnik, user_id = sub, bound_at odmah) → licenca 'aktivna'
        (vrijedi_od danas, vrijedi_do +12 mj, tenant_id)
      * dogfood račun: kreirajDokument(env, PLATFORM_TENANT, { tip:'RACUN',
        nacinPlacanja:'TRANSAKCIJSKI', kupac:{naziv,oib,email}, stavka
        "Godišnja licenca …" (KPD 62.01/63.11 — odabrati), status:'izdano' })
        + zabilježi racun_id na licenci + pošalji e-mailom (best-effort)
      * → { status:'aktivna', tenantId }
  → frontend: osvjezi() tenant context → dashboard otključan
```

Novi tenant NEMA certifikat ni prijavljen prostor — dashboard ga vodi kroz
postavke (self-service prostor/uređaj/operater već postoji od `16-*`; upload
certifikata je zasad u /admin → v1.1 kandidat za self-service).

## 4. Model podataka — migracija `0006_licence.sql` (skica)

```sql
CREATE TABLE licenca (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenant(id),   -- NULL dok uplata ne sjedne
  kupac_sub     TEXT NOT NULL,                   -- GoTrue sub kupca
  kupac_email   TEXT NOT NULL,
  firma_json    TEXT NOT NULL,                   -- podaci firme do kreiranja tenanta
  plan          TEXT NOT NULL DEFAULT 'godisnja',
  iznos_eur     TEXT NOT NULL,                   -- cijena u trenutku kupnje
  payment_ref   TEXT NOT NULL,                   -- rail sid (idempotencija)
  racun_id      INTEGER REFERENCES racun(id),    -- dogfood račun (platformin tenant)
  vrijedi_od    TEXT,
  vrijedi_do    TEXT,                            -- +12 mjeseci
  status        TEXT NOT NULL DEFAULT 'ceka_uplatu'
                  CHECK (status IN ('ceka_uplatu','aktivna','istekla','odustao')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_licenca_payment_ref ON licenca(payment_ref);
CREATE INDEX ix_licenca_kupac ON licenca(kupac_sub);
CREATE INDEX ix_licenca_tenant ON licenca(tenant_id);
```

- Platformin tenant: env var **`PLATFORM_TENANT_ID`** — izuzet od licence,
  njegov kontekst izdaje licencne račune (treba mu prostor `WEB` + uređaj `1`).
- **Enforcement isteka (v1 minimalno):** ništa se ne blokira automatski;
  `GET /moji-tenanti` uz svaki tenant vraća i `licenca: {vrijediDo, status}` pa
  dashboard prikaže banner "licenca istječe/istekla". Tvrdo gašenje (402 na
  POST rute nakon grace perioda) = svjesna odluka za kasnije, NE u v1.
  Iznimke: tenanti postojeći PRIJE ove migracije i `PLATFORM_TENANT_ID`
  nemaju licencu i tretiraju se kao trajno aktivni (grandfathered).

## 5. Novi endpointi (fiskal Worker)

| Metoda | Put | Auth | Opis |
|---|---|---|---|
| `GET` | `/api/v1/onboarding/ponuda` | JWT (bez tenanta) | `{ iznosEur, plan:'godisnja' }` — za prikaz cijene u wizardu. |
| `POST` | `/api/v1/onboarding/kupnja` | JWT (bez tenanta) | Validira firmu → rail intent → licenca `ceka_uplatu` → `{ sid, checkoutUrl, iznosEur }`. Rate-limit: max 3 otvorena intenta po `sub`. |
| `POST` | `/api/v1/onboarding/potvrdi` | JWT (bez tenanta) | Polling + aktivacija (idempotentno; `sid` mora pripadati pozivateljevu `sub`). `{ status, tenantId? }`. |

Sva tri idu u `RUTE_BEZ_TENANTA` skup u auth middlewareu (`16-*` §5) — JWT
obavezan, `X-Tenant-Id` ne postoji jer korisnik još nema tenant.

## 6. Frontend (repo `domovina-fiskal-app`)

- `TenantStraza` (components/ljuska.tsx): kad je `tenanti.length === 0` →
  umjesto poruke "javi se administratoru" prikaži karticu s cijenom i gumbom
  **"Kupi godišnju licencu"** → `/dashboard/kupnja`. (Poruka o adminu ostaje
  kao sekundarna opcija — npr. knjigovođa kojeg dodaje postojeći vlasnik.)
- `/dashboard/kupnja`: 2 koraka — (1) forma firme; (2) "Plati" → otvori
  `checkoutUrl` u novoj kartici + prikaži i EPC QR inline (rail vraća
  `epc_qr_data`) + status polling (`potvrdi` svake 3 s, max ~1 h) → na
  `aktivna` → `osvjezi()` iz TenantProvidera → redirect `/dashboard`.
- Banner isteka: ako `moji-tenanti` vrati licencu koja istječe < 30 dana ili
  je istekla → žuta/crvena traka s CTA "Obnovi" (obnova = ista kupnja, samo
  preskače kreiranje tenanta — `potvrdi` produži `vrijedi_do` +12 mj).

## 7. Konfiguracija / env

**Fiskal Worker (`wrangler.toml` vars):**
- `RAIL_URL` = `https://mpt.domovina.ai`
- `LICENCA_SAFE_ADDRESS` = Gnosis Safe ITalk-a (0x…) — ⚠️ Matija dostavlja
- `LICENCA_CIJENA_EUR` = npr. `"120.00"` — ⚠️ Matija odlučuje prije produkcije
- `PLATFORM_TENANT_ID` = id ITalk tenanta u prod D1 (kreirati kroz /admin:
  naziv "ITalk d.o.o.", OIB 54872935051, u sustavu PDV-a, prostor `WEB`,
  uređaj `1`, proizvod "Godišnja licenca" s KPD šifrom)

**Rail:** ništa se ne mijenja u v1 (server-side pozivi zaobilaze CORS; webhook
se ne koristi). V2: webhook fan-out u railu (`INTENT_WEBHOOK_URL` lista).

## 8. Sigurnost

- Intent kreira ISKLJUČIVO fiskal Worker (iznos/target server-side); frontend
  nikad ne zove rail API direktno (samo otvara checkout stranicu).
- `potvrdi` provjerava: `sid` pripada pozivatelju (`kupac_sub`), rail kaže
  `paid`, `amount_received_cents === amount_cents`, licenca još nije aktivirana
  (UNIQUE `payment_ref` + status guard) — sve u D1 batchu.
- OIB duplikat: ako OIB već ima tenant → 409 s porukom (spriječi dvostruke
  firme); korisnik s postojećim membershipom ne vidi wizard.
- Iznosi/cijena se NE primaju od klijenta ni na jednom koraku.

## 9. Definicija gotovog (verify)

1. Migracija 0006; `licenca` postoji.
2. `kupnja` kreira rail intent (mock/live) + `ceka_uplatu` red; `checkoutUrl` valjan.
3. `potvrdi` prije uplate → `{status:'ceka_uplatu'}`; nakon uplate (ili mocka)
   → atomarno tenant + korisnik_tenant(vlasnik, vezan) + licenca aktivna +
   dogfood `RACUN` izdan kroz PLATFORM_TENANT (vidljiv u /admin) + email poslan.
4. Idempotencija: ponovni `potvrdi` → isti `tenantId`, bez dupliciranja.
5. Kupnja s OIB-om postojećeg tenanta → 409. Tuđi `sid` → 403/404.
6. Frontend: 0 tenanata → wizard → (test)uplata → dashboard otključan bez
   ikakve admin intervencije; banner isteka renderira.
7. `dfk_` i dashboard regresija (16-* DoD) prolaze; `.claude/skills/verify`.

## 10. Otvoreno / odluke koje čekaju Matiju

- ⚠️ Cijena (`LICENCA_CIJENA_EUR`) i KPD šifra usluge (62.01 vs 63.11 — provjeriti).
- ⚠️ `LICENCA_SAFE_ADDRESS` (ITalk Gnosis Safe za primanje EURe).
- ⚠️ Knjigovodstveni tretman rail uplate (vidi §1) — prije produkcije.
- V2 kandidati: kartična naplata (→ FISKALNI_B2C + čl. 39 napomena, puni AKD
  dogfood), webhook umjesto pollinga, self-service upload certifikata,
  automatska deaktivacija nakon isteka + grace period.

# Handoff: eRačun 2.0 u customer dashboardu (domovina-fiskal-app)

> **Prompt za novu sesiju u repou `/Users/ms/git/domovinatv/domovina-fiskal-app`.**
> Backend dio je GOTOV i E2E potvrđen na doku TEST okolini 2026-07-15 (račun
> `IMPORTED → DELIVERED → FISCALIZED` na PU test). Ovaj dokument opisuje što
> treba izgraditi u dashboardu. Backend referenca:
> `../domovina-fiskal/docs/handoff/eracun-doku-integracija.md`.

## Kontekst

- **Frontend:** Next.js 14 static export (`output: "export"`) → Cloudflare Pages
  (`fiskal-app.domovina.ai` / `domovina-fiskal-app.pages.dev`). Sve client-side,
  bez SSR-a; detalj računa ide preko `?id=` query parametra.
- **Auth:** GoTrue SSO (dijeljeni Domovina račun) → Bearer JWT + `X-Tenant-Id`
  header. Sav API promet ide kroz `lib/fiskal.ts` (JEDINO mjesto koje zove API).
- **API base:** `NEXT_PUBLIC_FISKAL_API_URL` (build-time env; default
  `https://fiskal.domovina.ai/api/v1`, lokalno `http://localhost:8787/api/v1`).
- **Jezik:** hrvatski (UI, komentari, poruke) — kao cijeli ekosustav.
- Dashboard već ima: popis dokumenata, novi dokument (PONUDA/PREDRACUN/RACUN/
  FISKALNI_B2C), detalj računa (PDF, slanje emailom), proizvodi, postavke
  (prostori/uređaji/operateri).

## Backend API — što je dostupno (sve Bearer + X-Tenant-Id)

Kreiranje eRačuna ide POSTOJEĆIM `POST /racun` uz `tip: "ERACUN_B2B" | "ERACUN_B2G"`.
Novi/relevantni endpointi:

| Endpoint | Zahtjev | Odgovor (200) |
|---|---|---|
| `POST /racun/:id/posalji-eracun` | — | `{ok, dokuId, eracunStatus, deliveryBlock, napomena?}` |
| `GET /racun/:id/eracun-status` | — | `{ok, dokuId, eracunStatus}` (`IMPORTED\|DELIVERED\|FISCALIZED`) |
| `POST /eracun/provjeri-primatelja` | `{oib}` | `{ok, oib, registriran, mpsEndpoint?}` (AMS lookup) |
| `GET /kpd?q=…&limit=…` | q ≥ 2 znaka | `{rezultati: [{code?, name?…}]}` (KPD 2025 šifrarnik) |

Greške dolaze kao `{greska: "…"}` (400/502) — backend sada vraća PUNE doku
detalje (schematron poruke), prikazati ih korisniku doslovno.

`GET /racun/:id` odgovor ima blok
`eracun: {dokuId, status, deliveryBlock, zadnjaProvjera, greska}` i
`status` računa prelazi u `fiskaliziran` kad je doku status DELIVERED/FISCALIZED.

## Obavezna polja za eRačun (backend guardovi — UI ih treba spriječiti unaprijed)

Potvrđeno schematron probama na doku TEST-u (HR CIUS 2025):

1. **Kupac s OIB-om** (11 znamenki) + naziv + adresa (ulica/grad/pošt. broj; drzava HR).
2. **KPD šifra po SVAKOJ stavci** (`kpd: "NN.NN.NN"`) — MORA biti stvarna KPD
   2025 šifra → autocomplete iz `GET /kpd?q=`. (Krivu šifru doku tiho ispusti
   pa validacija padne.)
3. **`operaterOib`** obavezan pri kreiranju (HR-BR-37/9) — isti odabir operatera
   kakav već postoji za FISKALNI_B2C.
4. **`datumDospijeca`** preporučen (bez njega backend šalje fallback uvjete
   plaćanja — "Plativo odmah po primitku računa.").
5. **Tenant mora imati IBAN** za transakcijsko plaćanje (BR-61) — IBAN se za
   sada unosi u NAŠEM adminu (`/admin`), ne u dashboardu; ako backend vrati tu
   grešku, prikazati uputu "kontaktiraj podršku / postavi IBAN".
6. **Kupac ≠ tenant** — doku odbija `EndpointID prodavatelja i kupca je identičan`.

## Što izgraditi

### 1. `lib/fiskal.ts` — 4 nove funkcije
`posaljiEracun(tenantId, id)`, `eracunStatus(tenantId, id)`,
`provjeriPrimatelja(tenantId, oib)`, `kpdTrazi(tenantId, q)` — po uzoru na
postojeći `posalji`.

### 2. Novi dokument (`app/dashboard/novi/page.tsx`)
- Dodati tipove **eRačun (B2B)** i **eRačun (B2G)** u odabir tipa.
- Kad je tip eRačun: kupac OIB obavezan + inline **AMS provjera** (ikona/status
  "primatelj registriran za eDelivery" preko `provjeri-primatelja`; ako nije
  registriran, upozorenje da dostava neće proći — `deliveryBlock: "AMS"`).
- **KPD autocomplete** po stavci (obavezno za eRačun, opcionalno inače) —
  pretraga po nazivu/šifri preko `GET /kpd`.
- Operater select obavezan (kao za B2C), polje datum dospijeća.

### 3. Detalj računa (`app/dashboard/racun/page.tsx`)
- Za tipove `eracun_b2b`/`eracun_b2g`: gumb **"Pošalji eRačun"** (vidljiv kad
  `eracun.dokuId == null` i status `izdano`), spinner tijekom slanja (~2-5 s).
- **Status razmjene**: badge IMPORTED/DELIVERED/FISCALIZED + `dokuId` +
  "zadnja provjera" + gumb za ručno osvježavanje (poll `eracun-status`).
  FISCALIZED = zeleno ("Fiskaliziran na Poreznoj upravi").
- Prikaz `eracun.greska` (crveni blok, puni tekst — poruke su dijagnostičke).

### 4. Bez novih backend ruta
Sve postoji. NE dirati backend. Doku API-TOKEN tenanta i IBAN se unose u
admin sučelju backenda (BYO-key onboarding) — izvan opsega dashboarda.

## Testiranje

- Lokalni backend: `cd ../domovina-fiskal/backend && npx wrangler dev --port 8787`
  (ima doku TEST software token u `.dev.vars`; tenant 3 = ITalk ima doku token
  u lokalnoj D1 bazi i API ključ).
- Testni primatelj: **monoform d.o.o., OIB 32234297847** (registriran na doku
  test AMS-u). NE slati "samom sebi" (ITalk → ITalk ne prolazi).
- Provjereni scenarij: novi eRačun (kupac monoform, stavka s KPD `62.20.20`,
  operater, dospijeće) → pošalji → status FISCALIZED u ~3 s.

## Okruženja (test/prod) — plan

Trenutno stanje: JEDAN worker (`fiskal.domovina.ai`) s `OKOLINA="test"` u
wrangler.toml → "produkcijska" domena zapravo gađa PU/doku TEST. JEDAN Pages
projekt s build-time API URL-om.

Ciljno stanje (2 potpuno odvojena okruženja):

| | TEST | PROD |
|---|---|---|
| Worker | `[env.test]` u wrangler.toml: `fiskal-domovina-backend-test`, domena `fiskal-test.domovina.ai`, **zasebna D1** (`fiskal_domovina_test`), `OKOLINA="test"`, secrets `--env test` (TEST doku software token) | postojeći worker, `OKOLINA="prod"`, PROD doku software token (čeka se od doku-a) |
| Frontend | `domovina-fiskal-app-test` → **fiskal-app-test.domovina.ai** (`npm run deploy:test`) | postojeći (`fiskal-app.domovina.ai`), API URL `https://fiskal.domovina.ai/api/v1` |

Redoslijed: (1) izgraditi `[env.test]` + test Pages odmah (današnje test stanje
se preseli tamo), (2) glavni worker prebaciti na `OKOLINA="prod"` TEK kad stigne
produkcijski SOFTWARE-API-TOKEN. Frontend kod je env-agnostičan — okruženje
bira isključivo build env var, nema koda ovisnog o okolini.

> AŽURIRANO 2026-07-17: oba okruženja su DEPLOYANA (worker fiskal-test.domovina.ai + Pages fiskal-app-test.domovina.ai; glavni worker je OKOLINA=prod). E2E kroz cloud test potvrđen (doku id 1223, FISCALIZED). Preostalo ručno: test origin u GoTrue ADDITIONAL_REDIRECT_URLS; prod doku software token kad stigne.

# HANDOFF — nastavak nakon `/clear`

Ovaj dokument je **ulazna točka za novu Claude sesiju**. Research/planning faza je gotova;
slijedi implementacija. Pročitaj ovo, pa relevantni prompt iz `docs/handoff/`.

## Gdje je znanje (single point of truth)
- **`docs/knowledge/00-INDEX.md`** — glavni indeks + destilat. Dokumenti 01–15 + 99.
- **`docs/reference/`** — Fira API (`fira-custom-webshop-api.md`), Fira UI obilazak
  (`fira-ui-walkthrough.md`), lokalni artefakti.
- **`PLAN.md`** — fazni plan. **`docs/knowledge/99-gap-analiza.md`** — nepotvrđeno prije koda.

## Što je projekt
Open-source multi-tenant SaaS za **izdavanje hrvatskih računa** (alternativa fira.finance):
- **B2C fiskalizacija 1.0** (ZKI/JIR/QR preko CIS SOAP-a) — vidi `02-*`.
- **eRačun 2.0** (UBL 2.1 / HR CIUS preko AS4/**posrednika**) — vidi `03-*`, `12-*`, `13-*`.
- Nefiskalne **ponude/računi** (PDF/email/QR) — vidi `09-*`.

## Fiksirane arhitektonske odluke (NE re-litigirati bez razloga)
1. **Stack:** Cloudflare Worker + **Hono** + **D1**, server-rendered admin (Basic Auth),
   Bearer API, **hrvatski jezik svugdje**. Uzor: `../pipeline.domovina.ai`. (`CLAUDE.md`)
2. **Multi-tenant lanac** (potvrđen na Firi): `Webshop(apiKey/tajni ključ)` → `Slijed računa`
   → `Poslovni prostor` + `Naplatni uređaj` + `Operater(OIB)` → `Račun`. Payload = kupac +
   stavke + tip; sve o izdavatelju server-side. Shema: `05-*`.
3. **Kripto NIJE razlog za sidecar** — MD5 i pun `node:crypto` rade na Workers (`nodejs_compat`).
   ZKI/XML-DSIG izvedivi na edge-u. Sidecar samo ako: (a) CIS traži per-tenant transportni mTLS,
   ili (b) sigurnosno ne želimo dešifrirati ključ na edge-u. (`11-*`)
4. **eRačun 2.0 = preko posrednika (faza 1)** — doku / ePoslovanje(Pondi) / FINA API; posrednik
   potpisuje svojim certom preko punomoći → tenant bez vlastitog 2.0 certa. Vlastita PT (Domibus)
   tek faza 2. Ekonomija/break-even: `15-*`. Postupak posrednika: `14-*`.

## Redoslijed implementacije → promptovi
Izvedi fazu po fazu. Svaki prompt je samostalan; pokreni ga u novoj sesiji.
1. [`docs/handoff/faza-0-skela.md`](docs/handoff/faza-0-skela.md) — Worker+Hono+D1 skela, multi-tenant, migracije, admin, validacija.
2. [`docs/handoff/faza-1-dokumenti-pdf.md`](docs/handoff/faza-1-dokumenti-pdf.md) — ponude/računi (nefiskalni) + PDF + QR + email.
3. [`docs/handoff/faza-2-fiskalizacija-b2c.md`](docs/handoff/faza-2-fiskalizacija-b2c.md) — B2C fiskalizacija 1.0 (ZKI/JIR/CIS TEST, DEMO cert).
4. [`docs/handoff/faza-3-eracun-2.0.md`](docs/handoff/faza-3-eracun-2.0.md) — eRačun 2.0 preko posrednika + eIzvještavanje.
5. [`docs/handoff/faza-4-produkcija-b2c-webshop.md`](docs/handoff/faza-4-produkcija-b2c-webshop.md) — produkcijska B2C za webshopove (tablica stanja na vrhu).

## Pravila rada
- Prije koda provjeri ⚠️ stavke iz `99-gap-analiza.md` i „Razrješenje otvorenih ⚠️" sekcije u `12-15`.
- **Secrets NIKAD u repo** (javan!). Certifikati/tajni ključevi enkriptirani at-rest (`04-*`, `05-*`).
- Commit poruke i sve na hrvatskom. Push na `origin/main` (`domovinatv/domovina-fiskal`).
- Nakon svake faze: `/verify` (pokreni app i dokaži da radi), pa commit.

## Pregled koda i plan refactora (2026-10-02)
- 📋 **Neovisni review backenda** (Fable 5.1, kod nije diran):
  [`docs/handoff/2026-10-02-pregled-koda-i-plan-refactora.md`](docs/handoff/2026-10-02-pregled-koda-i-plan-refactora.md)
  — 24 nalaza s `datoteka:redak`, plan u 9 koraka (§6), što ne dirati (§5),
  popis testova koji nedostaju (§4). **Izvedba refactora je sljedeća sesija.**
  Kritično prije svega: **K1** — `backend/src/fiskal/ca/*.pem` nisu u gitu
  (ignorira ih `*.pem`), svježi clone se ne builda; nema CI-ja.

## Stanje Faze 4 (ažurirano 2026-10-01)
- 🟡 **Faza 4 (produkcijska B2C za webshopove)**: kod gotov (4.1–4.7), TEST
  deployan (migracije 0007–0009, crons `*/15` + `0 6`) i E2E prošao na CIS TEST-u.
  **PROD deployan 01.10.2026.** (migracije 0007–0009, verzija `6fd7122a`, echo na
  PROD CIS radi). Preostali PROD koraci (čišćenje 2 probna računa → prvi pravi
  račun, rotacija `ENC_MASTER_KEY`, doku token, `ALARM_EMAIL`) traže izričito odobrenje.
  Stanje po koracima: tablica na vrhu plana; nalazi u
  `docs/research/faza-4-dnevnik-implementacije.md`.
- **Testovi:** `cd backend && npm test` (vitest u workerd-u, lokalni D1, CIS je
  mockan i pravi CIS je u testovima zabranjen). `npm run deploy:test` =
  typecheck + testovi + deploy TEST. ⚠️ `npm run deploy` je **PROD** (predeploy
  sad traži typecheck + testove).
- **TEST admin** lozinka je rotirana → `secrets/fiskal-test-admin.env`
  (gitignored). PROD admin je u `backend/.tajne/lozinke.env` (`*_PROD`).
- **API za webshop:** `Idempotency-Key`/`vanjskaReferenca`, `GET
  /api/v1/racun?vanjskaReferenca=`, `POST /api/v1/racun/:id/storno`,
  `GET /api/v1/zdravlje` — ugovor u §3 plana Faze 4.
- **Onboarding tenanta:** `backend/scripts/dodaj-tenant.sh --okolina test|prod …`
  (PROD traži upis OIB-a kao potvrdu). MARCIDEA (tenant 5 na TEST-u) i dalje
  nema demo cert (v. dnevnik §6).

## Stanje repoa (ažurirano 2026-07-05)
- ✅ **Faza 0 gotova i deployana** — `backend/` (Worker+Hono+D1) živi na
  **fiskal.domovina.ai** (D.O.M. account); D1 `fiskal_domovina` (EEUR), secreti
  postavljeni (`ADMIN_*`, `ENC_MASTER_KEY`, `RESEND_API_KEY`).
- ✅ **Faza 1 gotova i deployana** — nefiskalni dokumenti (PONUDA/PREDRAČUN/RAČUN,
  odvojene sekvence po tipu, skice), PDV po skupini + klauzula čl. 90. st. 1.,
  proizvodi + **službeni KPD 2025** šifrarnik (migracija 0003), PDF (pdf-lib +
  DejaVu subset, čl. 79 elementi, HUB3 PDF417 za plaćanje), email dual-channel
  (CF Email Service binding → Resend fallback; E2E potvrđen kanal cloudflare).
- ✅ **Faza 2 gotova** — B2C fiskalizacija 1.0 (v0.3.0): ZKI na Workeru
  (RSA-SHA1+MD5), `RacunZahtjev` s XML-DSIG (exc-C14N kanonski-po-konstrukciji,
  **RSA-SHA256/SHA-256** — SHA1 iz spec. v2.6 vraća `s004`, v. `02-*` §6.1/§12!),
  transport `cloudflare:sockets`+`subtls` (CIS cert = privatni Fina CA; mTLS NIJE
  obavezan → **bez sidecara**), naknadna dostava (cron */15, `NakDost=true`,
  novi `IdPoruke`), fiskalni QR na PDF-u, P12 parsiranje pri uploadu (node-forge,
  ključ enkriptiran at-rest). E2E na CIS TEST: **JIR dobiven** (ITalk d.o.o.,
  FINA DEMO cert). Lokalne tajne (certovi/lozinke): `backend/.tajne/` (gitignored).
  **Podržani su i FINA i AKD/Certilia certifikati** — AKD demo E2E potvrđen
  (JIR s CIS TEST-a); AKD specifičnosti (organizationIdentifier/VATHR-, ECDSA
  potpisan leaf) u `04-*` §5.1. Kronologija/debugging s dijagramima:
  `docs/research/faza-2-dnevnik-implementacije.md`. ⚠️ Prije PRVOG pravog
  prod računa: obrisati probne račune iz D1 (troše slijed fiskalni/PP1/2026)
  ili krenuti s novim poslovnim prostorom.
- ⚠️ Napomene za sljedeće faze: KPD 2025 je restrukturiran vs. stara CPA
  (v. dopunu u `06-*`); R16 (čl. 90 st. 1) razriješen u `99-*`; verify recept
  u `.claude/skills/verify/SKILL.md`; prije prelaska na PROD CIS: min. 2 dana
  stabilnog TEST rada, `OKOLINA=prod`, prod cert (uploadan, okolina 'prod').
- ⏭️ **Sljedeće: faza 3** — `docs/handoff/faza-3-eracun-2.0.md` (nova sesija).

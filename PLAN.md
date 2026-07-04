# PLAN implementacije — domovina-fiskal

> Nacrt plana. Detaljna, pedantna implementacija radi se u zasebnom prolazu (po dogovoru).
> Ovaj plan je uzemljen u `docs/knowledge/*` (single point of truth). Prije faze 3+
> potvrditi ⚠️ stavke iz [`docs/knowledge/99-gap-analiza.md`](./docs/knowledge/99-gap-analiza.md).

## Načela

- **Stack:** Cloudflare Worker + Hono + D1 + server-rendered admin (Basic Auth), kao
  `../pipeline.domovina.ai`. Hrvatski jezik svugdje. Secrets izvan repoa.
- **Hibrid runtime:** Worker (edge) + Node **fiskal-sidecar** za kripto/mTLS/AS4 (vidi
  `docs/knowledge/11-arhitektura-runtime.md`).
- **Multi-tenant:** API ključ = tenant; izdavatelj server-side; payload = kupac+stavke+tip
  (dizajn: `docs/reference/fira-custom-webshop-api.md`, stroži).
- **Dvije staze:** B2C (fiskalizacija 1.0, ZKI/JIR/QR) i B2B/B2G (eRačun 2.0) — odvojeno.

## Odluke koje čekaju potvrdu (blokiraju faze 3+) → `99-gap-analiza.md §4`

MVP opseg (B2C 1.0 vs eRačun-preko-posrednika vs oboje) · vlastita PT vs posrednik ·
hosting sidecara (Mac Mini vs VPS) · izbor CA (FINA/AKD) · D1 vs Postgres.

---

## Faza 0 — Temelji (bez ijednog certifikata)
- Worker+Hono+D1 skela; `.dev.vars`, `wrangler.toml` (custom_domain), migracije.
- Multi-tenant: tablice iz `docs/knowledge/05-*` (`tenant, api_kljuc, certifikat,
  poslovni_prostor, naplatni_uredaj, operater, kupac, sekvenca, racun, stavka,
  pdv_raspodjela, naplata, poruka_log`).
- Auth: Bearer API ključ (`/api/*`), Basic Auth (`/admin/*`).
- Validacija JSON API-ja (zod): naš `RacunModel` (kupac + stavke + tip), pun Unicode (utf8mb4-ekvivalent).
- Admin skela: popis tenanta/računa, unos poslovnog prostora/operatera.

## Faza 1 — Ne-fiskalni računi/ponude (vrijednost bez CIS-a)
- Izdavanje `PONUDA` / `RAČUN` (nefiskalni): numeriranje (`sekvenca`), PDV raščlamba.
- **PDF** (`pdf-lib` na Workers) po obveznim elementima čl. 79 Zakona o PDV-u (`docs/knowledge/09-*`).
- **QR** (JS) + **e-mail** (deliverability). Obavezni elementi računa, ne-PDV napomene.
- Ovo pokriva tvoj `fira-forms-connector` use-case (registracije/ponude) bez certifikata.

## Faza 2 — fiskal-sidecar + B2C fiskalizacija 1.0 (CIS TEST)
- Node sidecar: onboarding **FINA DEMO** certa (P12→PEM, enkripcija at-rest).
- **ZKI** (RSA-SHA1 + MD5) + **XML-DSIG** (exc-C14N/SHA1) + **mTLS SOAP** → `cistest.apis-it.hr:8449`.
- Tok: `EchoRequest` → `RacunZahtjev` → JIR; parsiranje `Greske` (`s001`–`s013`).
- **Async queue + sinkroni ZKI** (Worker enqueue → sidecar claim → PATCH JIR); QR s JIR/ZKI.
- Prijava **poslovnog prostora** u CIS prije prvog računa.
- Min. 2 dana stabilnog TEST rada prije razmišljanja o produkciji.

## Faza 3 — Edge-caseovi i robusnost (`docs/knowledge/10-*`)
- OIB validacija (MOD 11,10); storno/ispravak (veza na originalni JIR); **offline/naknadna
  dostava** (`NakDost=true`, novi `IdPoruke`, retry); zaokruživanje PDV (formula `166`);
  ne-PDV obveznici; reverse charge; strana valuta; prijelaz godine/kontinuitet numeriranja.

## Faza 4 — Produkcija B2C
- FINA **produkcijski** aplikacijski cert; prod endpoint; monitoring/alerting; audit (`poruka_log`).

## Faza 5 — eRačun 2.0 (preko posrednika)
- **UBL 2.1 (HR CIUS)** generiranje (`docs/knowledge/03-*`, `06-*`); validacija **Validatorom eRačuna**.
- Integracija posrednika (FINA / Moj-eRačun API) za izdavanje/zaprimanje + **fiskalizacijska poruka**.
- **eIzvještavanje** o naplati (do 20. u mjesecu).

## Faza 6 — (opcionalno) Vlastita Pristupna točka
- AS4/ebMS3 + MPS/AMS; **Završno testiranje na PTS-u** (`pts.porezna-uprava.hr`) → potvrda o
  sukladnosti → upis na Popis informacijskih posrednika.

---

## Odmah sljedeći korak (kad se resetira session-limit u 04:50 Europe/Zagreb)
Dovršiti web-istraživanje za `arhitektura-runtime` + `gap-critic` **resume-om istog
workflowa** (`resumeFromRunId`), čime se preskaču 9 gotovih agenata i verificiraju
CF Workers ograničenja (WebCrypto/mTLS) i cross-doc rupe. Zatim krenuti u Fazu 0.

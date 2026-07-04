# 13 — Krajolik providera eRačuna / Fiskalizacije 2.0 u RH (doku, posrednici, aplikacije)

> Analiza konkurentskog krajolika informacijskih posrednika i aplikacija za eRačun/F2.0.
> Fokus: **doku.hr** (monoform d.o.o.) kao primjer DIREKTNOG posrednika + white-label API.
> Datum istraživanja: **2026-07-04**. Dopunjuje `07-fira-analiza.md` i `docs/reference/fira-ui-walkthrough.md` §5.

## 1. Ključni pojmovi (regulatorni okvir)

- **Informacijski posrednik** — pravna/fizička osoba s OIB-om koja *drugima* pruža uslugu
  izdavanja/zaprimanja eRačuna, **fiskalizacije eRačuna**, eIzvještavanja i metapodatkovnih
  servisa. Mora proći test sukladnosti na Testnom portalu PU i dobiti **potvrdu o sukladnosti**
  (uz **ISO/IEC 27001**, obnova certifikata svake 3 god.). Tek tada radi u produkciji.
- **Pristupna točka (PT)** — ulaz/izlaz eRačuna u sustav; može biti informacijski posrednik
  ili sam obveznik koji je vlastitim IT rješenjem ispunio sve uvjete.
- **Popis informacijskih posrednika** — javni popis PU s posrednicima kojima je izdana potvrda
  o sukladnosti. **Na dan siječanj 2026. = 34 ovlaštena posrednika.**
- **Ovlaštenje/punomoć** — u ePorezna → **FiskAplikacija → Ovlaštenja za fiskalizaciju** obveznik
  daje posredniku pravo da **njegovim certifikatom** potpisuje fiskalizacijske poruke u ime obveznika.
  Za primanje: **Adrese za zaprimanje eRačuna** (odabir PT-a za zaprimanje).

## 2. doku.hr (monoform d.o.o.) — profil

**Tko:** `monoform d.o.o.`, brend **doku**. OIB posrednika: **32234297847**.
Osnivači: **Matija Matečić** (CEO), **Marko Jakšić** (CTO). ~25 god. iskustva u web servisima;
navode **>28.000 korisnika**. (Jedan osnivač sudjelovao u ranom razvoju eRačuna u RH, drugi vodi
veći domaći servis za fakturiranje.) Vlastita infrastruktura/serveri.

**Regulatorni status:** **DIREKTAN, certificirani informacijski posrednik.**
Nalaze se na službenom **Popisu informacijskih posrednika PU pod rednim brojem 29 —
„monoform d.o.o. (doku)"**. **NE koriste posrednika** — sami su pristupna točka s
**potvrdom o sukladnosti**, **ISO 27001:2022**, GDPR, SSL.

**Što nude (proizvod):**
- **eRačun slanje** (B2B/B2G) — pregled, validacija, potpis, vizualizacija, prijenos, status dostave;
  3 načina slanja (web, uvoz, API), ostalo automatski.
- **eRačun primanje** — centralni inbox za ulazne račune.
- **eArhiviranje** — zakonski ispravna pohrana (rok čuvanja 6 god… navedeni „6-year retention").
- **B2C fiskalizacija** — fiskalna poruka prije ispisa, PU vraća **JIR** (blagajnički scenarij).
- **Fiskalizacija 2.0** — puna kompatibilnost.
- **Web aplikacija** `su.doku.hr` („Sudoku") — izrada računa u pregledniku.
- **REST API** — `api.doku.hr/docs`, sekcije: **Uvod · Računi · B2C · Webhook**; `api-status`, `api-changelog`.

**Model potpisa/onboarding (KLJUČNO):**
- **doku potpisuje sve e-dokumente VLASTITIM certifikatom** u ime korisnika → korisnik **ne treba
  vlastiti certifikat** (opcionalno može uploadati svoj i sam potpisivati).
- Korisnik u **ePorezna → FiskAplikacija → Administracija → „Ovlaštenja za fiskalizaciju"** dodaje
  novo ovlaštenje unosom **doku OIB-a 32234297847** + datum, spremi. Za primanje isto preko
  **„Adrese za zaprimanje eRačuna"**.
- **→ Isti obrazac kao FIRA/Pondi:** posrednik potpisuje svojim certom preko punomoći; tenant bez
  vlastitog 2.0 certifikata. Potvrđuje „faza 1 preko posrednika" iz `03-*` §11 i `11-*` §3.

**Cjenik (PDV uključen, bez ugovorne obveze):**
- **Besplatno:** 3 eRačuna / mjesec.
- **~5 €/mj:** 50 eRačuna + **0,10 €** po dodatnom.
- **>2000 eRačuna/mj:** custom paket na upit.

## 3. doku: white-label building-block ILI direktan provider? — ODGOVOR

**Oboje, i za nas relevantno kao white-label podloga.**
- doku eksplicitno cilja **razvojne tvrtke / SaaS / ERP**: „šalji i zaprimaj eRačun u svom
  knjigovodstvenom/poslovnom sustavu", „malim i velikim sustavima", „rješenja potpuno prilagođena
  tvojoj organizaciji", selektivna integracija značajki. API pokriva slanje/primanje, **B2C
  fiskalizaciju (JIR)**, **webhookove**, arhiviranje.
- Znači: netko poput nas (`domovina-fiskal`) **može graditi vlastiti proizvod NAD doku API-jem**,
  gdje je doku **pristupna točka / potpisnik**, a mi radimo UI, katalog, numeriranje, KPD itd.
- Istovremeno je doku i **primjer kako izgleda direktan provider** (vlastita PT + potvrda + cert).

> **Za odluku „build vs. buy the Access Point":** doku je konkretna, jeftina, dokumentirana
> **kandidat-podloga** (kao alternativa Pondi/ePoslovanje ili FINA API-ju) ako NE želimo sami
> ishoditi potvrdu o sukladnosti u fazi 1. U fazi 2 možemo migrirati na vlastitu PT.

## 4. Usporedba modela: doku vs FIRA vs FINA vs Moj-eRačun

| | **Uloga** | **Vlastita PT/potvrda?** | **Kako fiskalizira** | **API za integratore** |
|---|---|---|---|---|
| **doku** (monoform) | **Direktan posrednik** (#29 popis) | **DA** (potvrda, ISO27001) | svojim certom, punomoć u ePorezna | **DA** (send/recv, B2C, webhook) |
| **FIRA** (fira.finance) | **Aplikacija/nadgradnja** | **NE** | **preko Pondi/ePoslovanje** (#6) | webshop/forms konektor (nad Pondijem) |
| **Pondi** (ePoslovanje) | **Direktan posrednik** (#6 popis) | **DA** | svojim certom, punomoć | **DA** („za developere") |
| **FINA** | **Direktan posrednik** (#2) + **Peppol PT** | **DA** | svojim certom / Peppol | **DA** (Fina e-Račun API) |
| **Moj-eRačun** (Elektronički računi d.o.o.) | **Direktan posrednik** (#3) | **DA** | svojim certom | **DA** (ERP/white-label) |

**Poanta:** **FIRA je jedina od navedenih koja NIJE posrednik** — ona je aplikacijski sloj
(fakturiranje, klijenti, KPD, ponude) koji za 2.0 kanal koristi **Pondi/ePoslovanje** kao PT.
**doku, Pondi, FINA, Moj-eRačun su sami PT s potvrdom.** Naš planirani model = **kao FIRA**
(aplikacija) NAD posrednikom — samo biramo posrednika (Pondi, doku, FINA…).

## 5. Mapiranje krajolika RH

### A) DIREKTNI informacijski posrednici / pristupne točke (na popisu PU, izbor od 34)
Imaju potvrdu o sukladnosti — mogu biti podloga (API) za nadgradnje:
- **Financijska agencija — FINA** (#2) — ujedno **Peppol pristupna točka**.
- **ELEKTRONIČKI RAČUNI d.o.o. — Moj-eRačun / „mer"** (#3).
- **Pondi d.o.o. — ePoslovanje** (#6) — podloga za FIRA-u i dr.
- **monoform d.o.o. — doku** (#29) — jeftin, developer-friendly API.
- **PostLink — Sveračun** (#4), **E-RAČUNI d.o.o. — e-racuni.com** (#14), **ZZI — bizBox** (#9),
  **Omnizon Systems** (#7), **EDITEL** (#11), **Comarch** (#18), **Seyfor Hrvatska** (#22),
  **DB informatika — SUPER** (#8), **mStart plus — mEDI** (#20), **OmniSight — Tvoj e-račun** (#21),
  **HREFS — factura.hr** (#27), **MAXKO — eRacun.eu** (#33), **GrowIT — Nexium** (#34),
  **NEOINFO — Adeo POS** (#19), **KUPUJ ONLINE — BillKO** (#17), **OptimIT — EDInet** (#26),
  **Fonoa** (#31), i međunarodni (EDICOM, ECOSIO, Unimaze, OpusCapita/GEP, Markant, Comarch).

### B) NADGRADNJE / aplikacije (nisu na popisu — grade NAD posrednikom)
Fakturiranje/ERP/POS aplikacije koje 2.0 kanal dobivaju preko posrednika iz (A):
- **FIRA / fira.finance** (ITfinance) → preko **Pondi/ePoslovanje**.
- **FiskAI**, **HrFiskalizator** (plugin, npr. za ePoslovanje), razni ERP/knjigovodstveni paketi.
- **FiskalAPI** (`fiskalapi.hr`) — developer API sloj (uvod/eRačun/fiskalizacija dokumentacija).
- **← Ovdje sjeda i `domovina-fiskal`** (aplikacijski sloj + admin), s izborom posrednika ispod.

> Napomena: granica zna biti mutna — dio tvrtki iz (A) nudi i vlastitu aplikaciju (npr. Moj-eRačun,
> e-racuni.com, doku/Sudoku), tj. istovremeno su i posrednik i aplikacija.

## 6. Zaključci za `domovina-fiskal`

1. **Arhitektura potvrđena (2x):** i FIRA i doku rade „aplikacija/servis + posrednik potpisuje
   svojim certom preko punomoći u ePorezna". Tenant bez vlastitog 2.0 certifikata u fazi 1.
2. **doku = konkretan kandidat za white-label podlogu** (uz Pondi/ePoslovanje i FINA API).
   Jeftin (5 €/mj / 50 rač.), dokumentiran API (send/recv, **B2C JIR**, webhook, arhiva), developer-first.
   Ako ne želimo sami ishoditi potvrdu o sukladnosti — gradimo NAD njim.
3. **Diferencijacija:** posrednici su komoditet (razmjena+potpis+arhiva). Vrijednost je u
   **aplikacijskom sloju** (UI/IA, KPD 2025 picker, numeriranje `{br}-{pp}-{nu}`+operater,
   ponude/skice, višejezični uvjeti, Excel uvoz) — točno ono što FIRA radi, a posrednik ne.
4. **Odluka za dokumentirati:** izbor posrednika (Pondi vs doku vs FINA) po: cijeni po računu,
   kvaliteti API-ja (webhookovi, B2C JIR), Peppol dosegu (FINA), SLA/statusnoj stranici (doku ima
   `api-status`/`changelog`).

## Izvori

- doku.hr — naslovnica, `/o-nama`, `/usluge`, `/api-integracija`, `/pitanja-i-odgovori`,
  `api.doku.hr/docs`. Pristupljeno **2026-07-04**.
- Porezna uprava — Popis informacijskih posrednika: `porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019`
  (34 posrednika, siječanj 2026). Pristupljeno **2026-07-04**.
- Porezna uprava — Pristupna točka: `porezna-uprava.gov.hr/hr/pristupna-tocka/8053`. Pristupljeno **2026-07-04**.
- fiskalizacija2.hr — „Pristupna točka i informacijski posrednik" (rječnik). Pristupljeno **2026-07-04**.
- Moj-eRačun — `portal.moj-eracun.hr/blog/pristupna-tocka/`. Pristupljeno **2026-07-04**.
- ePoslovanje — `eposlovanje.hr/za-developere/`, `/fiskalizacija-2-0/`. Pristupljeno **2026-07-04**.
- FINA — `fina.hr/digitalizacija-poslovanja/e-racun/*`. Pristupljeno **2026-07-04**.
- Interni: `docs/reference/fira-ui-walkthrough.md` §5, `docs/knowledge/07-fira-analiza.md`.

## Razrješenje otvorenih ⚠️ (krug 2 — 2026-07-04)

> Ključni proboj: `api.doku.hr/docs` je Scalar (ASP.NET Core) SPA, ali **sirovi OpenAPI 3.1.1
> spec je javno dostupan** na `https://api.doku.hr/openapi/v1.json` (~179 KB). Iz njega su
> izvučeni auth, base URL, endpointi, webhook i rate-limit detalji. `/ping` (prod) vraća
> `{"message":"Hello PRODUCTION @ ..."}`.

- ✅ **doku API autentikacija (format ključa, base URL)** → Dva zaglavlja: (1) `Authorization: API-TOKEN <token>`
  — apiKey u headeru, token izdan **po doku računu** (literalni prefiks `API-TOKEN` + razmak + token);
  (2) `SOFTWARE-API-TOKEN` — GUID koji identificira **integraciju/software** (ne pozivatelja), obavezan na
  svakom ne-anonimnom endpointu. Base URL PROD: `https://api.doku.hr` (portal `https://portal.doku.hr`);
  TEST: `https://api-test.doku.hr` (portal `https://portal-test.doku.hr`). Pristupne podatke tražiš mailom
  na `hello@doku.hr`. Izvor: `https://api.doku.hr/openapi/v1.json` (`info.description`, `components.securitySchemes.ApiToken`).
- ⚠️ **doku rate limiti** → **Nema javno dokumentiranog globalnog rate-limita/kvote** (nema `X-RateLimit`
  zaglavlja ni quota tablice u specu). Jedini throttling u specu je na `POST /accounts/me/ams`
  (registracija sudionika na AMS) → HTTP **429** sa `retryAfterSeconds` (shema `MeAMSCreateRateLimited`).
  Ostali endpointi bez deklariranog limita — realni limiti vjerojatno postoje server-side ali nisu objavljeni.
  Izvor: `openapi/v1.json` paths + `components.schemas.MeAMSCreateRateLimited`.
- ⚠️/✅ **White-label / partner / sub-tenant** → **Tehnički building-block POSTOJI, formalni reseller ugovor NIJE javan.**
  `POST /accounts` („Registration") programatski kreira novi račun, dodjeljuje mu API token, **automatski
  registrira tvrtku na AMS za eDelivery** i vraća aktivacijski e-mail + generiranu lozinku + API token —
  poziva se s `SOFTWARE-API-TOKEN` (identifikator tvoje integracije). Tj. integrator može **programatski
  provisionirati račun po svom kupcu ispod svog software-tokena** → de-facto multi-tenant onboarding.
  ALI: **javno nema formalnog white-label/reseller/agencijskog ugovora ni konsolidirane sub-tenant naplate**
  (spomen „partner" na `/usluge` i `/o-nama` je marketinški, ne cjenik); komercijalni uvjeti idu preko
  `hello@doku.hr`. Zaključak: sub-account API = ✅ potvrđeno; formalni reseller model = ⚠️ iza kontakta.
  Izvor: `openapi/v1.json` `paths./accounts.post` + `RegistrationDTO`.
- ✅ **Podržava li doku Peppol?** → **NE (nije Peppol).** doku radi na **hrvatskoj nacionalnoj eDelivery mreži
  preko AMS-a** (Adresar metapodatkovnih servisa): `POST /ams` = „Check the Adresar metapodatkovnih servisa
  (AMS)... provide OIB or GLN... returns the **MPS endpoint URL** if recipient found". **Nigdje u specu ni na
  webu nema spomena Peppola.** Znači razlika prema FINA-i stoji: **FINA = Peppol pristupna točka**, dok je
  **doku AMS/MPS (RH F2.0) pristupna točka** (`ap.doku.hr (Porezna uprava)` naveden na status-boardu).
  Izvor: `openapi/v1.json` `paths./ams`, `/accounts` opis, `tags` (AMS: „Check AMS by participant identifier").
- ✅ **Webhook garancije** → Događaj **`document.status_change`**: okida se na *document imported / delivered /
  fiscalized* (ulazni i izlazni). **Auth: HTTP Basic** (ako je konfiguriran na računu). **Retry: do 3 pokušaja
  s eksponencijalnim backoffom.** **Timeout: 2 sekunde** (obradi asinkrono). Vrati **2xx** za ack. URL se
  konfigurira u **Portal → Settings → API**. Izvor: `openapi/v1.json` `webhooks."document.status_change"`.
- ⚠️ **doku SLA / uptime brojke** → **Nema objavljene numeričke SLA/uptime garancije.** `doku.hr/api-status`
  je **live status-board** (servisi: Web servis, Notifikacije, `api.doku.hr`, `api-test.doku.hr`,
  `portal.doku.hr`, `portal-test.doku.hr`, **`ap.doku.hr (Porezna uprava)`**, **Webhooks**) koji trenutno
  pokazuje „**Svi servici funkcionalni**", ali **uptime trake se renderiraju klijentski bez objavljenog % ni
  SLA obveze**. `api-changelog` ima samo 2 unosa (2025-11-01 prva verzija API docs; 2026-04-01 dorađeni OpenAPI)
  — bez SLA/uptime brojki. Izvori: `https://doku.hr/api-status`, `https://doku.hr/api-changelog`.
- ✅ **Usporedni cjenik po eRačunu (doku vs Pondi/ePoslovanje vs FINA)** →
  - **doku** (`doku.hr/`): besplatno **3 eRačuna/mj** (poslani+primljeni); **5 €/mj** (PDV uključen) za
    **50 eRačuna** + **0,10 €** po dodatnom nakon 50; **>2000/mj** paket po mjeri. **Bez ugovorne obveze.**
  - **Pondi / ePoslovanje** (`eposlovanje.hr/cjenik/`): **0,08 € + PDV po eRačunu**, min. naplata **4,00 € + PDV**
    (prepaid: iznos se troši 6 mj / postpaid: 4 €/mj uključuje 50 računa, iznad 50 → 0,08 €). Primanje i arhiva
    **besplatni**. Fiskalizacijski certifikat preko njih **10 € + PDV**.
  - **FINA e-Račun** (`fina.hr/.../cjenik-fina-e-racuna`): **0,30 € po poslanom eRačunu** (bez PDV-a) + **0,93 €/certifikat**
    mjesečno; PLUS paketi po volumenu (XS 15 = 8,20 €, S 30 = 12,20 €, S 55 = 20,75 €, M 200 = 63,70 €, L 500 = 137,00 €,
    XL 650+ na upit); +0,93 € po dodatnom subjektu za opunomoćenike; **ugovorna obveza 24 mjeseca**. Primanje se ne naplaćuje.
  - **Poanta:** doku najjeftiniji na malom volumenu i **bez ugovora** (PDV već uključen ~5 € ≈ 4 € + PDV);
    **Pondi najniža jedinična cijena na skali (0,08 €)**; **FINA najskuplja jedinično (0,30 €) + 24-mj lock-in**,
    ali je jedina **Peppol AP**. Izvori: `doku.hr/`, `eposlovanje.hr/cjenik/`, `fina.hr/digitalizacija-poslovanja/e-racun/cjenik-fina-e-racuna`.

### Napomena o zabuni imena
`DOKU.com` / `api.doku.com` / `dashboard.doku.com` je **indonezijski payment gateway** — nije povezan s
hrvatskim **doku.hr (monoform d.o.o.)**. Sav gornji nalaz odnosi se isključivo na `doku.hr` / `api.doku.hr`.

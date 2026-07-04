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

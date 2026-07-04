# Gap-analiza i kontrola potpunosti

> Konsolidacija otvorenih pitanja, proturječja i rizičnih tvrdnji iz baze znanja
> (`01`–`11`). Stanje **2026-07-04**. Ovaj dokument je ručno sastavljen (gap-critic
> agent nije dovršen zbog session-limita) iz strukturiranih sažetaka svih istraživača.
> **Prije implementacije svaku ⚠️ stavku potvrditi na primarnom izvoru.**

---

## 1. Rizične / nepotvrđene tvrdnje — VERIFICIRATI PRIJE KODA

Ovo su činjenice koje kod izravno ovisi o njima; ne hardkodirati bez provjere.

| # | Tvrdnja | Dok. | Kako provjeriti |
|---|---|---|---|
| R1 | **CIS endpointi/portovi** `cistest.apis-it.hr:8449/FiskalizacijaServiceTest`, `cis.porezna-uprava.hr:8449/FiskalizacijaService` | 02, 04 | Aktualni **WSDL** iz PU tehničke spec. (portovi se mijenjaju po verziji) |
| R2 | **ZKI algoritam** = `md5(rsa_sha1(OIB+datVrij+bor+opp+onu+iznos))`, hex lowercase, **SHA1** ne SHA256, datum u ZKI ima **razmak** a u XML **`T`** | 02 | Visoka pouzdanost (spec. v2.6 verbatim). Potvrditi na DEMO certu kroz `ProvjeraZahtjev` |
| R3 | **XML-DSIG:** Exclusive C14N + RSA-SHA1 + SHA1 digest; CIS **odgovor** koristi *inkluzivni* C14N | 02 | Spec. v2.6 §7; testirati verifikaciju odgovora |
| R4 | **Poslužiteljski certifikat CIS-a zamijenjen 12.01.2026.** — klijent treba novi javni ključ | 02 | PU obavijest; dohvatiti aktualni CIS cert prije prod |
| R5 | **Rokovi 2.0:** PDV-obveznici izdaju+zaprimaju od **01.01.2026.**; ne-PDV **zaprimaju 2026., izdaju 2027.** | 01, 03 | Visoka pouzdanost (PU); potvrditi članke NN 89/2025 |
| R6 | **MIKROeRAČUN** u 2026. samo **zaprimanje**, izdavanje od 2027.; **FiskAplikacija** = upravljanje/uvid (dvije različite aplikacije) | 01, 03 | ⚠️ izvori se razilaze oko datuma zaprimanja — potvrditi aktualnom PU objavom |
| R7 | **eIzvještavanje** o naplati **do 20. u mjesecu**; fiskalizacija primljenog eRačuna **≤5 radnih dana** | 01, 03 | Tehnička spec. „Fiskalizacija eRačuna i eIzvještavanje" / Pravilnik |
| R8 | **KPD kod** format u UBL-u (`52.10.00` s točkama vs `521000`), `listID`, broj znamenki | 03, 06 | **HR CIUS** (`porezna.gov.hr/fiskalizacija/api/dokumenti/99`) + Validator |
| R9 | **AS4/ebMS3 profil** i **XAdES razina** potpisa eRačuna | 03 | PU „Pristupna točka i AS4 profil" |
| R10 | **Odnos domaći MPS/AMS ↔ Peppol SMP/SML** (je li domaći promet obavezno preko Peppol-a) | 03 | PU „Adresar (AMS)" + „MPS" dokumenti |
| R11 | **Cloudflare Workers:** nema MD5 u WebCrypto; nema per-tenant mTLS na `fetch()`; Browser Rendering za PDF | 11 | **developers.cloudflare.com** (WebCrypto alg., mTLS, nodejs_compat) — nije dovršeno |
| R12 | **QR `izn` polje** = iznos u centima, cijeli broj, bez separatora/vodećih nula, `-` za storno; host `porezna.gov.hr/rn` | 02, 09 | PU tehnička spec., aktualna verzija |
| R13 | **Način plaćanja `C` (ček) ukinut 01.09.2025.** → dozvoljeni `G/K/T/O` | 02 | Spec. v2.6 / HOK; potvrditi |
| R14 | **Prag ulaska u sustav PDV-a** (spominje se 100.000 EUR) i tekst oslobođenja malog obveznika | 06, 10 | Važeći Zakon o PDV-u |
| R15 | **Rok naknadne dostave** (offline) — povijesno 2 dana/48h; točan rok po NN 89/2025 | 02, 10 | NN 89/2025 + pravilnik |

---

## 2. Proturječja / nekonzistentnosti između dokumenata

- **Datumska logika 1.0 vs 2.0 (usklađeno, ali paziti):** B2C zadržava **ZKI/JIR/QR**
  (02, 03 §9), dok eRačun B2B/B2G **nema** ZKI/JIR/QR. Kod mora imati **dvije odvojene
  staze** izdavanja — ne miješati. (Konzistentno kroz 02/03/05/11, ali je najveći izvor
  konceptualne zabune.)
- **mTLS obaveznost:** 02 §7.3 kaže spec. spominje **1-way TLS** (auth je u potpisu
  poruke), ali praktične implementacije šalju i klijentski cert. 11 gradi arhitekturu
  na pretpostavci da mTLS *može* biti potreban → sidecar. Nije proturječje, ali **treba
  empirijska potvrda** (DEMO cert) da se ne pregradi arhitektura bespotrebno.
- **KPD broj znamenki:** 03 spominje „6-znamenkasti", 06 raspravlja format s/bez točaka.
  Uskladiti nakon čitanja CIUS-a; trenutno **nije fiksirano** (dobro označeno u oba).
- **Popust FIRA godišnja pretplata:** 07 bilježi 10% (EN marketing) vs 17% (HR cjenik).
  Nebitno za našu implementaciju; ostaje kao napomena o konkurentu.
- **`f73` verzija sheme namespace-a:** 02 koristi `.../types/f73`; napominje da se sufiks
  mijenja po verziji (`f33`/`f73`). **Ne hardkodirati** — čitati iz aktualnog WSDL/XSD.

---

## 3. Nedostaci / preplitko pokriveno (za dubinski drugi prolaz)

| Dok. | Što nedostaje |
|---|---|
| 01 | Točni **brojevi članaka** NN 89/2025 (obveznik, iznimke, kazne, obavijest kupcu); precizni **iznosi kazni** |
| 02 | **Element-po-element XSD** za `PromijeniNacPlac*` i prijavu **poslovnog prostora** (root element u aktualnom `f73`); točna **min. TLS verzija** |
| 03 | **Stvarna XML shema fiskalizacijske poruke 2.0** (nazivi elemenata, potpis) — samo opisno; konkretni **PTS/prod endpointi** (dostupni tek u PTS aplikaciji nakon prijave) |
| 04 | Postoji li **„fiskalcistest"** kao naziv proizvoda (vjerojatno naziv test servisa, ne certifikata); točan **produkcijski CA** (Fina RDC 2015 vs 2020) ovisi o datumu izdavanja; **trajanje demo certa** |
| 05 | Validacija **stranih valuta/tečaja** u shemi; potpuni **eRačun (UBL) → naš model** mapping za sve EN 16931 obvezne BT elemente |
| 06 | Normativno mapiranje **HR PDV oslobođenja → VATEX-EU kodovi**; točan skup **VAT category** kodova koje HR CIUS dopušta; **jedinica H87 vs C62** za „komad" |
| 07 | DE/AT cjenik FIRA-e; verifikacija cijena konkurenata (FISCO/Solo/Parra/Kasica); negativne recenzije |
| 08 | Zreo **.NET klijent za 2.0** (ne postoji na 2026-07-04); doseg **shunkica/fiskalizacija2-js**; javni OSS klijent za **FINA/MeR eRačun API**; licenca **kodmasin/fiskpy** (NOASSERTION) |
| 09 | Točan prag **pojednostavljenog računa** (čl. 79. st. 5–7., mijenjano uvođenjem eura); je li **SMS provjera** još aktivna; točni CIUS zahtjevi za **vizualizaciju eRačuna** |
| 11 | **Web-verifikacija** CF Workers ograničenja (agent nije dovršio) |

---

## 4. PRIORITETNA PITANJA ZA MATIJU (odluke koje mijenjaju plan)

1. **Opseg MVP-a — što prvo?**
   - (a) samo **B2C fiskalizacija 1.0** (CIS SOAP, ZKI/JIR/QR) — najbliže „starom" fiskalu,
     jasna spec., ali B2C tržište traži i POS/blagajnu; ili
   - (b) **eRačun preko posrednika** (FINA/Moj-eRačun API) — bliže FIRA modelu i tvom
     `fira-forms-connector` slučaju (izdavanje računa/ponuda), brže do vrijednosti; ili
   - (c) oboje odmah.
   *Preporuka: (b) preko posrednika za izdavanje + (a) B2C kad zatreba blagajna.*
2. **Vlastita Pristupna točka ili posrednik?** Želiš li proći **certifikaciju PT-a na
   PTS-u** (veći trud, puna kontrola, ti si posrednik) ili se osloniti na postojećeg
   posrednika (brže)? Ovo određuje treba li nam AS4 stack.
3. **Hosting fiskal-sidecara:** Mac Mini (kao pipeline bridge) ili **VPS 24/7**? Async
   naknadna dostava traži da sidecar bude gore i noću → VPS je robusniji.
4. **Izbor CA:** FINA (uobičajeno, „fiskal" aplikacijski cert) ili AKD/Certilia? Za demo
   krećemo s **FINA DEMO** certom besplatno.
5. **Baza:** OK D1/SQLite za MVP, ili odmah Postgres (osjetljivi podaci, izvještaji)?
6. **Multi-tenant onboarding certifikata:** kako tenant uploada P12 + lozinku (admin UI,
   enkripcija at-rest) — potvrditi UX i sigurnosni model iz `05`/`04`/`11`.

---

## 5. Preporučeni redoslijed implementacije (skica za `PLAN.md`)

1. **Temelji:** Worker+Hono+D1 skela (po `pipeline.domovina.ai`), multi-tenant API ključ,
   podatkovni model iz `05` (migracije), admin skela, validacija (zod) našeg JSON API-ja
   (dizajn iz `docs/reference/fira-custom-webshop-api.md`, ali stroži).
2. **Ne-fiskalni računi/ponude:** izdavanje `PONUDA`/`RAČUN` → PDF (`09`) + e-mail + QR.
   Vrijednost bez ijednog certifikata (kao FIRA `PONUDA` za setup).
3. **fiskal-sidecar (B2C 1.0):** ZKI + XML-DSIG + mTLS SOAP na **CIS TEST** s DEMO certom;
   `EchoRequest` → `RacunZahtjev` → JIR; async queue + naknadna dostava (`02`, `11`).
4. **Edge-caseovi (`10`):** OIB validacija, storno, offline/retry, zaokruživanje, ne-PDV.
5. **eRačun 2.0 preko posrednika:** UBL 2.1 (HR CIUS) generiranje + poziv posrednika +
   fiskalizacijska poruka + eIzvještavanje (`03`, `06`).
6. **(Opcionalno) vlastita PT:** AS4 + MPS/AMS + Završno testiranje na PTS-u.

---

## 6. Napomena o kvaliteti istraživanja

- Dokumenti **02, 03** su visoke pouzdanosti i gusto citirani iz **primarnih PU izvora**.
- **7/11** istraživačkih agenata vratilo je strukturirani sažetak; **02, 05, 10** su
  **napisani u datoteku** (agent pao tek na završnom koraku — sadržaj je potpun).
- **11** i ovaj **99** napisani su ručno nakon session-limita; njihove ⚠️ web-tvrdnje
  (osobito o Cloudflare platformi) treba dovršiti u sljedećem prolazu (kad se limit resetira
  u 04:50 Europe/Zagreb) — može se **resume-ati isti workflow** (`resumeFromRunId`), čime
  se preskaču već gotovi agenti i pokreću samo `arhitektura-runtime` + `gap-critic` s pravom
  web-provjerom.

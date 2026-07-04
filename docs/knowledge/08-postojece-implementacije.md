# 08 — Postojeće implementacije fiskalizacije (open-source i komercijalne)

> Stanje na dan **2026-07-04**. Cilj dokumenta: mapirati što već postoji (da ne
> izmišljamo toplu vodu), procijeniti održavanost i licencnu kompatibilnost, te
> preporučiti 2-3 referentne implementacije za učenje. Metapodaci (zvjezdice,
> `pushed_at`, licenca) dohvaćeni izravno s GitHub API-ja 2026-07-04.

## 0. Kratki zaključak (TL;DR)

- **Za fiskalizaciju 1.0** (ZKI + JIR preko SOAP/CIS-a) postoji zreo, dokazan kod u
  svakom bitnom jeziku. Najkorisniji uzori: **tgrospic/Cis.Fiscalization** (.NET,
  čist WSDL-wrapper), **senko/fiskal-hr** (Python, 100% test coverage, čisto pisan),
  **nticaric/fiskalizacija** (PHP, najpopularniji, aktivno održavan).
- **Za fiskalizaciju 2.0 / eRačun** (novi režim od **2026-01-01**) postoji vrlo malo
  koda. Referentni open-source je **shunkica/fiskalizacija2-js** (TypeScript, WIP,
  jedini ozbiljan javni klijent za novi CIS SOAP API) + prateći **shunkica/fiskalizacija2**
  (službene sheme/dokumenti) i **dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata**
  (matrica vrsta dokumenata za HR CIUS 2025).
- **eRačun/Peppol/UBL** dio: nema HR-specifičnog open-source access pointa; za Peppol
  komponente referenca je **phax/peppol-commons** (Java, Apache-2.0). U praksi većina
  poduzeća ide preko **informacijskog posrednika** (FINA, MeR/moj-eRačun, ePoslovanje…),
  ne gradi vlastiti AP.
- **Licencno**: gotovo sve relevantne biblioteke su **MIT** ili **Apache-2.0** →
  kompatibilne s našim open-source (MIT) projektom. Iznimka: `kodmasin/fiskpy` ima
  nestandardnu/nejasnu licencu (GitHub je klasificira kao `NOASSERTION`) — **ne
  posuđivati kod izravno** bez provjere.

---

## 1. Kontekst: 1.0 vs 2.0 — što biblioteke uopće pokrivaju

Bitno za procjenu "koristljivosti": većina postojećih biblioteka pokriva **fiskalizaciju
1.0** (gotovinski računi → CIS SOAP servis Porezne uprave, generiranje **ZKI**-ja,
dohvat **JIR**-a, XML-DSIG potpis, QR kod). To je stabilan, godinama nepromijenjen
protokol.

**Fiskalizacija 2.0** (obveza slanja/primanja **eRačuna** za B2B domaće transakcije
od **2026-01-01** za obveznike PDV-a) uvodi dva NOVA, odvojena procesa:

1. **Razmjena eRačuna** — UBL 2.1 / CII (EN 16931 + **HR CIUS**), transport preko
   **Peppol** mreže / preko informacijskog posrednika (AS4). eRačun **NE sadrži**
   JIR, ZKI ni QR kod.
2. **Fiskalizacija eRačuna + eIzvještavanje** — novi CIS SOAP API (`evidentiraj*`
   poruke) na koji se prijavljuje izdavanje/naplata/odbijanje.

Izvori: [Porezna — eRačun](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun),
[Tehnička specifikacija eRačuna — fiskalizacija2.hr](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/),
[EC — eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia).

> ⚠️ **Ključna posljedica za nas:** postojeće 1.0 biblioteke daju nam algoritam ZKI,
> XML-DSIG obrazac i strukturu SOAP poziva, ali **NE** pokrivaju 2.0 eRačun/eIzvještavanje.
> Za 2.0 dio praktički postoji samo `shunkica/fiskalizacija2-js` + službene sheme.

---

## 2. Open-source biblioteke po jezicima

Tablica (metapodaci s GitHub API-ja, 2026-07-04). `pushed_at` = zadnji push na repo.

| Repo | Jezik | ★ | Zadnji push | Licenca | 1.0 | 2.0/eRačun | Status |
|---|---|---|---|---|---|---|---|
| [shunkica/fiskalizacija2-js](https://github.com/shunkica/fiskalizacija2-js) | TypeScript | 12 | 2026-06-02 | MIT | ne | **da** (WIP) | aktivan |
| [shunkica/fiskalizacija2](https://github.com/shunkica/fiskalizacija2) | XSLT (sheme/doc) | 16 | 2026-06-01 | — | — | **da** (dokumenti) | aktivan |
| [dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata](https://github.com/dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata) | (podaci) | — | — | — | — | **da** (HR CIUS matrica) | referenca |
| [nticaric/fiskalizacija](https://github.com/nticaric/fiskalizacija) | PHP | 56 | 2026-07-02 | MIT | **da** | ne | vrlo aktivan |
| [senko/fiskal-hr](https://github.com/senko/fiskal-hr) | Python | 17 | 2023-12-15 | MIT | **da** | ne | mirovanje (stabilan) |
| [kodmasin/fiskpy](https://github.com/kodmasin/fiskpy) | Python | 12 | 2022-06-13 | ⚠️ NOASSERTION | **da** | ne | mirovanje |
| [l-d-t/fiskalhrgo](https://github.com/l-d-t/fiskalhrgo) | Go | 1 | 2025-08-19 | MIT | **da** | ne | noviji, aktivan |
| [tgrospic/Cis.Fiscalization](https://github.com/tgrospic/Cis.Fiscalization) | C# / .NET | 22 | 2020-08-28 | MIT | **da** | ne | mirovanje (stabilan) |
| [trive-digital/fiskalapi](https://github.com/trive-digital/fiskalapi) | PHP | 9 | 2021-10-26 | MIT | **da** | ne | mirovanje |
| [infinum/fiscalizer](https://github.com/infinum/fiscalizer) | Ruby | 10 | 2023-07-26 | MIT | **da** | ne | **arhiviran** |
| [aradovanJava/Fiskalizacija](https://github.com/aradovanJava/Fiskalizacija) | Java | 4 | 2013-05-28 | — (nema) | **da** | ne | napušten (2013) |
| [phax/peppol-commons](https://github.com/phax/peppol-commons) | Java | 47 | 2026-07-02 | Apache-2.0 | — | Peppol infra | vrlo aktivan |

### 2.1 Node / TypeScript

**shunkica/fiskalizacija2-js** — *jedini ozbiljan open-source klijent za fiskalizaciju 2.0.*
- Opseg: novi CIS SOAP API — metode `evidentirajERacun()`, `evidentirajIsporukuZaKojuNijeIzdanERacun()`,
  `evidentirajNaplatu()`, `evidentirajOdbijanje()`. Podržava UBL Invoice/CreditNote →
  generiranje objekata koji zadovoljavaju `IERacun`/`IRacun` sučelja, SOAP potpisivanje,
  SSL/TLS s ugrađenim CA bundleom Porezne. Moderno tooling (ESLint, Prettier, Vitest, TS).
- Ograničenje: eksplicitno navodi da **B2C fiskalizacija u krajnjoj potrošnji trenutno
  NIJE podržana** (fokus B2B). WIP status, 81 commit.
- Licenca MIT → **kompatibilno**. Ovo je naša najbliža referenca po stacku (mi smo
  TS/Cloudflare Worker + Hono).
- **Što posuditi:** strukturu `evidentiraj*` poruka, UBL→interni model mapiranje,
  SOAP potpisni sloj, CA bundle. Vidi i njegov docs repo **shunkica/fiskalizacija2**
  (XSLT + službene sheme/primjeri).

### 2.2 PHP

**nticaric/fiskalizacija** — najpopularniji HR fiskalizacijski repo (56★, 40 forkova),
i dalje vrlo aktivan (zadnji push 2026-07-02, v2.1 rujan 2025 s Laravel 12 kompatibilnošću).
- Opseg: **1.0** — generiranje ZKI (`generirajZastKod`), QR kod (`QRGenerator`), SOAP CIS
  (`SoapClient`), obrada računa/PDV. Ovisi o `nesbot/carbon`, `endroid/qr-code`,
  `goetas-webservices/xsd2php-runtime`. PHP ≥ 7.3.
- **Ne pokriva 2.0 / eRačun / UBL / eIzvještavanje** (potvrđeno u READMEju, 2026-07-04).
- Licenca MIT → **kompatibilno**.
- **Što posuditi:** referentna implementacija ZKI algoritma i QR sadržaja; XSD→PHP
  generirane klase kao uzor strukture zahtjeva.

**trive-digital/fiskalapi** — stariji PHP wrapper prema FINA-i (1.0), MIT, u mirovanju
(2021). Manje relevantan od nticaric.

### 2.3 .NET / C#

**tgrospic/Cis.Fiscalization** — čist .NET (C#) wrapper: proxy klase generirane iz WSDL
sheme Porezne, kompletna implementacija u `Fiscalization` klasi (sync + async).
- Opseg: **1.0** — `CheckInvoice`/`SubmitInvoice`, ZKI, XML-DSIG potpis, CIS SOAP.
- Zadnji push 2020, ali protokol 1.0 se nije mijenjao → **i dalje koristan uzor**. MIT.
- **Što posuditi:** kako se WSDL Porezne pretvara u tipizirane klase, XML-DSIG detalji,
  primjeri test/prod poziva. Vrlo čitljiv kod za razumijevanje SOAP strukture.

> Napomena: nismo pronašli zreo, javan **.NET klijent specifično za fiskalizaciju 2.0**
> na dan 2026-07-04 (osim komercijalnih/POS middleware rješenja). Ako netko treba .NET
> 2.0, najbrži put je vlastiti klijent po službenim shemama + uzor iz `fiskalizacija2-js`.

### 2.4 Python

**senko/fiskal-hr** — Python 3 klijent za CIS (1.0). Autor Senko Rašić. MIT.
- Opseg: `check_invoice()` (DEMO), `submit_invoice()`, `submit_document()`,
  `change_payment_method()`. XML potpisivanje preko `libxmlsec1`. **100% unit-test
  coverage**, testovi self-contained (ne diraju vanjske servise ni certifikate).
- Zadnji push 2023-12-15 (mirovanje, ali stabilno; protokol 1.0 nepromijenjen).
- **Ne pokriva 2.0.** Licenca MIT → **kompatibilno**.
- **Što posuditi:** izvrsna referenca za *čisto strukturiranu* biblioteku i za
  **strategiju testiranja bez pravih certifikata** (self-contained testovi) — to
  želimo replicirati.

**kodmasin/fiskpy** — jednostavan Python klijent (1.0), 12★.
- ⚠️ **Licenca `NOASSERTION`** (GitHub ne prepoznaje standardnu licencu) → **ne
  posuđivati kod izravno**; koristiti samo kao konceptualnu referencu dok se licenca
  ne razjasni s autorom.

### 2.5 Go

**l-d-t/fiskalhrgo** — noviji "pure Go" klijent (1.0), tvrdi da je rađen po
"Fiskalizacija" specifikaciji v2.5 (misli se na verziju *tehničke specifikacije 1.0*,
ne "fiskalizacija 2.0"!). MIT.
- Opseg: slanje računa u CIS, provjera odgovora, parsiranje/provjera P12 klijentskog
  certifikata i ugrađenih certifikata, multitenant. Zadnji push 2025-08-19, 1★ (nov).
- **Ne pokriva 2.0 eRačun.** Licenca MIT → **kompatibilno**.
- **Što posuditi:** rukovanje P12 certifikatom i ugrađeni CA/provjera potpisa u Go-u
  (relevantno ako signing sidecar ikad bude Go).

### 2.6 Ruby

**infinum/fiscalizer** — gem za 1.0, MIT, ali **arhiviran** (read-only, zadnji push
2023). Solidna referenca za algoritam, ali bez podrške; ne graditi na njemu.

### 2.7 Java

**aradovanJava/Fiskalizacija** — vrlo star (2013), bez licence, praktički napušten.
Nekoristljivo osim povijesno. Za Java svijet, za **Peppol/eRačun** dio bolje gledati
`phax/*` ekosustav (vidi §3).

---

## 3. eRačun / Peppol / UBL biblioteke

Za sam **eRačun (UBL 2.1 + EN 16931 + HR CIUS)** i **Peppol** transport nema HR-specifičnog
open-source access pointa. Referentni ekosustav je **Philip Helger (phax)** — de-facto
standard za Peppol u Javi, Apache-2.0 (poslovno prijateljski):

- **[phax/peppol-commons](https://github.com/phax/peppol-commons)** (47★, Apache-2.0,
  vrlo aktivan) — dijeljene Peppol komponente: identifikatori, codelists, SBDH,
  SMP/SML klijent, MLR/MLS. 
- Prateći projekti istog autora: **phoss-smp** (SMP server), **phoss-ap** (kompletan
  Peppol AP), **ph-ubl** (UBL 2.1 JAXB modeli), **phive** (EN 16931 / CIUS validacija).
  Referenca: [Peppol Practical — peppol.helger.com](https://peppol.helger.com/public).
- **Što posuditi:** UBL 2.1 modele, EN 16931 + CIUS validacijska pravila (Schematron).
  Apache-2.0 je kompatibilan s MIT (možemo koristiti/linkati, uz zadržavanje obavijesti).

**HR CIUS specifično:**
- **[dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata](https://github.com/dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata)**
  — matrica vrsta dokumenata × poslovnih procesa × PDV kategorija po **HR CIUS 2025**.
  Nije kod, ali je zlata vrijedna referenca za pravila popunjavanja eRačuna.
- **[shunkica/fiskalizacija2](https://github.com/shunkica/fiskalizacija2)** — službeni
  dokumenti + XSLT/sheme fiskalizacije 2.0.

> ⚠️ Za transport (AS4/Peppol) u praksi ne gradimo vlastiti AP — spajamo se preko
> **informacijskog posrednika** (vidi §4). Vlastiti AP zahtijeva Peppol certifikaciju
> i operativni angažman koji za SME servis nema smisla.

---

## 4. Komercijalna rješenja / informacijski posrednici u HR

Od **2026-01-01** obveznici PDV-a moraju slati/primati eRačune za domaće B2B transakcije.
Razmjena ide preko **informacijskog posrednika** (pravna/fizička osoba s OIB-om koja
pruža usluge izdavanja/primanja eRačuna, fiskalizacije eRačuna i/ili eIzvještavanja).
Korisnik u **FiskAplikaciji** (ePorezna) potvrđuje svoju **pristupnu točku**
(informacijskog posrednika) u dijelu "Adrese za primanje eRačuna".

Službeni popis: **[Porezna — Popis informacijskih posrednika](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019)**
— na dan zadnjeg ažuriranja (12.03.2026.) navodi **~34 posrednika**. Ključni:

| Posrednik | Brand / usluga | Napomena |
|---|---|---|
| FINA (Financijska agencija) | Fina e-Račun **B2B** i **B2G** | Državni servis "Servis eRačun za državu"; ujedno **Peppol AP** |
| MeR (bivši **Moj eRačun**) | "mer" / ELEKTRONIČKI RAČUNI | Najveći komercijalni posrednik; [portal.moj-eracun.hr](https://portal.moj-eracun.hr/) |
| Pondi d.o.o. | **ePoslovanje** ([eposlovanje.hr](https://eposlovanje.hr/faq/)) | |
| HITRA | "eDokumenti" | |
| PostLink | "Sveračun" | |
| Megatrend Redok | "Redok eInvoice" | |
| DB informatika | "SUPER" | |
| ZZI | "bizBox" | |
| Editel | "eXite" | EDI/eInvoicing |

Ostali brandovi s popisa: Vizibit eRačun, eDoc, "Tvoj e-račun" itd. (puni popis na
Porezninoj stranici). "RiTUAM" nije potvrđen kao zaseban posrednik na tom popisu na
dan pristupa — ⚠️ ne tvrdim; provjeriti izravno na popisu ako je relevantan.

**Implikacija za naš servis:** naš proizvod ne mora biti registrirani posrednik da bi
bio koristan — možemo:
1. biti **klijent** prema posredniku (npr. FINA/MeR API) za razmjenu eRačuna, i/ili
2. sami raditi **fiskalizaciju eRačuna + eIzvještavanje** izravno prema CIS-u (kao
   `fiskalizacija2-js`), a razmjenu prepustiti posredniku.
Odluku vidi u `docs/knowledge/11-arhitektura-runtime.md`.

Referenca za registracijske rokove: svi obveznici trebali su biti upisani u **AMS**
(Adresar metapodataka servisa) do **31.12.2025.**; potvrda pristupne točke u
ePorezna/FiskAplikaciji.
([Fina — potvrda posrednika](https://www.fina.hr/digitalizacija-poslovanja/e-racun/upute-za-potvrdu-informacijskog-posrednika-u-sustavu-eporezna-fiskaplikacija)).

---

## 5. Licencna kompatibilnost (sažetak za MIT projekt)

| Licenca | Repos | Smijemo posuditi kod? |
|---|---|---|
| **MIT** | senko/fiskal-hr, nticaric, tgrospic, l-d-t/fiskalhrgo, trive-digital, shunkica/*, infinum (arhiviran) | **Da** — uz zadržavanje copyright/permission obavijesti |
| **Apache-2.0** | phax/peppol-commons + ekosustav | **Da** — uz NOTICE/atribuciju; kompatibilno s MIT |
| **Nema licence** | aradovanJava/Fiskalizacija | **Ne** — bez licence = sva prava pridržana; samo čitati radi razumijevanja, ne kopirati |
| **NOASSERTION** ⚠️ | kodmasin/fiskpy | **Ne bez provjere** — nejasna licenca; tražiti pojašnjenje autora |

> Pravilo: algoritmi (ZKI = konkatenacija polja → RSA-SHA1 potpis → MD5 hex) i javne
> XSD/WSDL sheme Porezne **nisu** predmet autorskog prava biblioteka — njih smijemo
> implementirati iz službenih izvora neovisno. Licenca je bitna samo ako doslovno
> kopiramo *njihov* izvorni kod.

---

## 6. Preporuka: 2-3 referentne implementacije za učenje

1. **shunkica/fiskalizacija2-js** (TypeScript, MIT) — **primarna referenca za 2.0**.
   Isti jezik/ekosustav kao naš servis; jedini javni klijent za `evidentiraj*` poruke,
   UBL mapiranje i SOAP potpis novog CIS-a. Uz njega obavezno njegov docs repo
   **shunkica/fiskalizacija2** i **dageci/…-vrste-dokumenata** za HR CIUS pravila.

2. **senko/fiskal-hr** (Python, MIT) — **referenca za dizajn biblioteke i testiranje**.
   Čist API, 100% coverage, self-contained testovi bez pravih certifikata — točno
   model kvalitete i test-strategije koji želimo. Ujedno jasan prikaz 1.0 XML-DSIG/CIS toka.

3. **tgrospic/Cis.Fiscalization** (.NET, MIT) — **referenca za SOAP/WSDL i XML-DSIG detalje**.
   Najčitljiviji prikaz kako WSDL Porezne postaje tipizirani zahtjev i kako se potpisuje;
   za razumijevanje 1.0 strukture i ZKI-ja. (Za sam ZKI algoritam sekundarno pogledati
   **nticaric/fiskalizacija** kao najpopularniji HR primjer.)

Za **Peppol/UBL** dio (ako ikad gradimo vlastiti AP ili validaciju): **phax/peppol-commons**
+ `phive` (EN 16931/CIUS validacija), Apache-2.0.

---

## Izvori

- [github.com/senko/fiskal-hr](https://github.com/senko/fiskal-hr) — Python 1.0 klijent, MIT, 100% test coverage (pristup 2026-07-04)
- [pypi.org/project/fiskal-hr](https://pypi.org/project/fiskal-hr/) — PyPI paket fiskal-hr (pristup 2026-07-04)
- [github.com/shunkica/fiskalizacija2-js](https://github.com/shunkica/fiskalizacija2-js) — TS klijent za fiskalizaciju 2.0 (eRačun/eIzvještavanje), MIT, WIP (pristup 2026-07-04)
- [github.com/shunkica/fiskalizacija2](https://github.com/shunkica/fiskalizacija2) — službeni dokumenti/sheme fiskalizacije 2.0 (pristup 2026-07-04)
- [github.com/dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata](https://github.com/dageci/hr-fiskalizacija-2.0-eracun-vrste-dokumenata) — matrica vrsta dokumenata HR CIUS 2025 (pristup 2026-07-04)
- [github.com/nticaric/fiskalizacija](https://github.com/nticaric/fiskalizacija) — PHP 1.0 API (ZKI/QR/CIS), MIT, najpopularniji (pristup 2026-07-04)
- [github.com/trive-digital/fiskalapi](https://github.com/trive-digital/fiskalapi) — PHP FINA wrapper, MIT (pristup 2026-07-04)
- [github.com/kodmasin/fiskpy](https://github.com/kodmasin/fiskpy) — Python 1.0, licenca NOASSERTION (pristup 2026-07-04)
- [github.com/l-d-t/fiskalhrgo](https://github.com/l-d-t/fiskalhrgo) — Go 1.0 klijent, MIT (pristup 2026-07-04)
- [fiskalgo.ldt.hr](https://fiskalgo.ldt.hr/) — landing FiskalHR Go (pristup 2026-07-04)
- [github.com/tgrospic/Cis.Fiscalization](https://github.com/tgrospic/Cis.Fiscalization) — .NET/C# 1.0 WSDL wrapper, MIT (pristup 2026-07-04)
- [github.com/infinum/fiscalizer](https://github.com/infinum/fiscalizer) — Ruby gem 1.0, MIT, arhiviran (pristup 2026-07-04)
- [github.com/aradovanJava/Fiskalizacija](https://github.com/aradovanJava/Fiskalizacija) — Java 1.0, bez licence, napušten 2013 (pristup 2026-07-04)
- [github.com/phax/peppol-commons](https://github.com/phax/peppol-commons) — Peppol Java komponente, Apache-2.0 (pristup 2026-07-04)
- [peppol.helger.com/public](https://peppol.helger.com/public) — Peppol Practical (phax ekosustav) (pristup 2026-07-04)
- [github.com/topics/fiskalizacija](https://github.com/topics/fiskalizacija) — GitHub topic (pristup 2026-07-04)
- [porezna.gov.hr — eRačun](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun) — službeno o eRačunu (pristup 2026-07-04)
- [fiskalizacija2.hr — Tehnička specifikacija eRačuna](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/) (pristup 2026-07-04)
- [fiskalizacija2.hr — Identifikatori (ZKI/JIR)](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/identifikatori/) (pristup 2026-07-04)
- [porezna-uprava.gov.hr — Popis informacijskih posrednika](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019) — ~34 posrednika, ažur. 12.03.2026. (pristup 2026-07-04)
- [fina.hr — potvrda informacijskog posrednika u ePorezna/FiskAplikacija](https://www.fina.hr/digitalizacija-poslovanja/e-racun/upute-za-potvrdu-informacijskog-posrednika-u-sustavu-eporezna-fiskaplikacija) (pristup 2026-07-04)
- [fina.hr — eRačun FAQ](https://www.fina.hr/digitalizacija-poslovanja/e-racun/odgovori-na-najcesca-pitanja) (pristup 2026-07-04)
- [portal.moj-eracun.hr/blog — Fiskalizacija nove generacije](https://portal.moj-eracun.hr/blog/fiskalizacija-nove-generacije/) — MeR/moj-eRačun (pristup 2026-07-04)
- [eposlovanje.hr/faq](https://eposlovanje.hr/faq/) — Pondi ePoslovanje posrednik (pristup 2026-07-04)
- [ec.europa.eu — eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia) — EU pregled (UBL 2.1/CII, HR CIUS, Peppol, FINA AP) (pristup 2026-07-04)

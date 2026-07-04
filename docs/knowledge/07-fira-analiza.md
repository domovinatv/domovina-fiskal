# 07 — Dubinska analiza konkurenta: FIRA (fira.finance)

> Stanje na dan **2026-07-04**. Dokument je konkurentska analiza (competitive
> intelligence) izrađena za potrebe pozicioniranja našeg open-source / self-host
> servisa za hrvatsku fiskalizaciju 2.0 i eRačun.
> Komplementaran je s `docs/reference/fira-custom-webshop-api.md` (API iz prve ruke).

---

## 0. TL;DR — što trebate znati u 60 sekundi

- **FIRA** je hrvatska SaaS aplikacija za male poduzetnike (obrti, paušalci,
  d.o.o., freelanceri, webshopovi) za izradu i slanje računa, fiskalizaciju,
  eRačun (Fiskalizacija 2.0), praćenje troškova (AI OCR) i integrirano bankarstvo
  (PSD2 open banking). Web: <https://fira.finance>, app: <https://app.fira.finance>.
- **Tvrtka:** FIRA Solutions d.o.o., Zagreb (Trg J. J. Strossmayera 8), OIB
  21233832319, osnovana **05.10.2021.**, **samofinancirana i profitabilna**,
  mikro-poduzeće (službeno **1 zaposlenik** u 2025., prihod ≈ **186.533 EUR**).
- **Tržišta:** Hrvatska (primarno) + **Njemačka i Austrija** (DE/AT), višejezično
  (HR/EN/DE + austrijski njemački).
- **Cjenik (HR, na 2026-07-04):** 4 paketa — LIGHT **4,80 €**, LIGHT+ **8,00 €**,
  BASIC **14,40 €**, PRO **24,00 €** (sve mjesečno + PDV); godišnje uz ~**17%**
  popusta; 30 dana besplatnog probnog razdoblja bez kartice.
- **Naša prilika:** oni su zatvoren, vlasnički SaaS s pretplatom po broju eRačuna;
  mi ciljamo **open-source, self-host, transparentan i bolji API** bez naplate po
  računu i bez vendor lock-ina. Njihove tehničke slabosti (npr. `utf8` umjesto
  `utf8mb4` rušenje na emojijima, `webshopModel` kao query param) su naša
  diferencijacija u kvaliteti implementacije.

---

## 1. Tko su — tvrtka, tim, sjedište, financije

| Podatak | Vrijednost | Izvor |
|---|---|---|
| Pravni subjekt | **FIRA Solutions d.o.o.** | Fina Info.BIZ |
| OIB | 21233832319 | Fina Info.BIZ |
| MB | 05481724 | Fina Info.BIZ |
| Sjedište | Trg Josipa Jurja Strossmayera 8, 10000 Zagreb | Fina Info.BIZ |
| Osnovana | 05.10.2021. | web pretraga (Fina/CompanyWall) |
| Pravni oblik | d.o.o. (mikro-poduzeće) | Fina Info.BIZ |
| Temeljni kapital | 4.000 EUR | Fina Info.BIZ |
| Status | Aktivan, bez blokade | Fina Info.BIZ |
| Djelatnost (NKD) | "Ostale djelatnosti distribucije sadržaja" | Fina Info.BIZ |
| Prihod 2025. | ≈ **186.533 EUR** (+198,8% g/g) | Fina Info.BIZ |
| Neto dobit 2025. | ≈ **65.955 EUR** (+423,3% g/g) | Fina Info.BIZ |
| EBIT/EBITDA 2025. | ≈ 72.850 EUR | Fina Info.BIZ |
| Zaposleni (2025.) | **1** (službeno) | Fina Info.BIZ |

**Osnivači / vlasnici / uprava:**
- **Marko Jurjević** — bivši bankar, bio član Uprave za financije jedne od
  vodećih HR banaka.
- **Zvonimir Relja** — IT inženjer i poduzetnik (naveden i kao **direktor**).
- **Damir Kovačević** — IT inženjer i poduzetnik.

Tim se okupio krajem 2021. Prema `about-us`, riječ je o multidisciplinarnom timu
financijskih stručnjaka i inženjera koji su prije FIRA-e izgradili i skalirali
vlastitu SaaS tvrtku. Tvrtka se predstavlja kao **samofinancirana i profitabilna**
(bez vanjskih investitora), s dugoročnom vizijom.

> ⚠️ **Napomena o brojkama:** Fina prikazuje 1 službenog zaposlenika, no javne
> metrike (4.000+ korisnika, 30.000+ računa/mj) i tri aktivna osnivača sugeriraju
> da rade i vlasnici/vanjski suradnici izvan formalnog radnog odnosa. Prihod
> 186k EUR uz 4.000 korisnika implicira nisku prosječnu ARPU (≈ 3–4 €/korisnik/mj),
> što upućuje na veliki udio besplatnih/probnih ili LIGHT korisnika. Brojke tretirati
> kao indikativne.

**Partneri / ekosustav:**
- **Erste Bank** — istaknuto partnerstvo (banka ih promovira u svojim novinama).
- **Microsoft for Startups Founders Hub** — infrastruktura na **Microsoft Azure**.
- **ePoslovanje.hr** — posrednik (information intermediary) za slanje/primanje
  eRačuna kod nižih paketa (nisu direktna FINA/Peppol integracija na LIGHT razini).
- Spominju "Everest Accounting" i druge računovodstvene suradnike.

**Javne metrike (marketinške, self-reported):** 4.000+ korisnika, 30.000+
računa/mjesečno, 500+ registracija/mjesečno, ~5.000 ušteđenih sati, ocjene
4,9/5 Google i 4,7/5 Trustpilot.

---

## 2. Proizvod — moduli i funkcionalnosti

FIRA je "sve-u-jednom" alat za financije malog poduzetnika. Moduli:

### 2.1 Dokumenti / izlazni računi
- Vrste dokumenata: **Ponuda, Predračun, Račun za predujam (avans), Račun,
  Storno račun, Otpremnica**.
- **Fiskalizacija 2.0 / eRačun** za sve pakete.
- **Fiskalizacija u krajnjoj potrošnji (F1)** i izrada fiskalnih računa (od LIGHT+ naviše).
- **FIRA POS App** — mobilna aplikacija za fakturiranje/fiskalizaciju u pokretu
  (gotovina i kartice), A4 ili POS printer.
- PDF generator, **QR kod za plaćanje**, **ponavljajući (recurring) računi**,
  slanje dokumenata na e-mail, izvoz računa, EUR + druge valute.
- Upravljanje klijentima (status računa po klijentu) i proizvodima
  (**KPD šifra proizvoda** za eRačun).

### 2.2 Bankarstvo (open banking / PSD2)
- Povezivanje s **2.300+ europskih banaka**, pregled stanja i transakcija.
- **Automatsko prepoznavanje uplata** (AI uparivanje uplata s izlaznim računima).
- Novčani tok po bankovnom prometu.
- Dostupno od paketa BASIC naviše (LIGHT/LIGHT+ nemaju bankarstvo).

### 2.3 Troškovi / ulazni računi
- Unos ulaznih računa, **AI OCR skeniranje** (slikaj račun mobitelom → auto-ekstrakcija).
- **Automatsko zaprimanje eRačuna** (direktno u FIRA-i na BASIC/PRO, ili preko
  portala ePoslovanje.hr na LIGHT).
- AI automatsko učitavanje iz PDF/slike (limitirano: 50 na BASIC, 100 na PRO).

### 2.4 Izvještaji
- Dashboard prihoda/rashoda, PDV, top klijenti.
- **PO-SD i KPR** za paušalne obrte.
- Excel izvještaji, eIzvještavanje, besplatna eArhiva.

### 2.5 Napredno (samo PRO)
- **Skladište** — upravljanje zalihama / robna knjiga.
- **Upravljanje vremenom** — radno vrijeme po korisniku, unos sati po
  klijentu/proizvodu/projektu, generiranje računa po satnici.

### 2.6 Integracije / API
- **WooCommerce** (webhook), **Shopify** (2 eventa: order created / order fulfilled),
  **Custom API** (bilo koji webshop/ERP/CRM).
- Podržava sve načine plaćanja: bankovni transfer, **PayPal, Stripe** itd. Nepoznati
  payment gateway → generira ponudu i obavijesti korisnika.
- Swagger/OpenAPI dokumentacija:
  <https://app.swaggerhub.com/apis-docs/FIRAFinance/Custom_webshop/v1.0.0>.
- **Webshop/API integracija je isključivo na BASIC (1 integracija, do 1000
  računa/mj) i PRO (više integracija, do 3000 računa/mj)** — LIGHT i LIGHT+ NEMAJU API.

### 2.7 Administracija / višejezičnost
- Web + tablet + mobitel, različite korisničke role (korisnik + knjigovodstvo).
- Jezici: **HR / EN / DE / austrijski njemački** (dokumenti termsHR/termsEN/termsDE).
- Multi-country cjenik (HR / DE / AT).

---

## 3. Cjenik (HRVATSKA) — puni, s ekstrakcije 2026-07-04

> Izvor: <https://fira.finance/hr/cjenik/> (renderirano u pregledniku, HR paketi).
> Sve cijene **+ PDV**. **30 dana besplatno, bez kartice.** Godišnje = ~**17%**
> jeftinije (efektivno ~2 mjeseca gratis).

| Paket | Mjesečno | Godišnje (bruto→akcija) | eRačuni uklj./mj | Korisnici | Bankarstvo | Webshop/API |
|---|---|---|---|---|---|---|
| **LIGHT** | 4,80 € | 57,60 → **48,00 €** | 10 (+20 po 0,08 €) | 1 + knjigovodstvo | ✗ | ✗ |
| **LIGHT+** | 8,00 € | 96,00 → **80,00 €** | 10 (+20 po 0,08 €) | 1 + knjigovodstvo | ✗ | ✗ |
| **BASIC** | 14,40 € | 172,80 → **144,00 €** | 40 (+20 po 0,08 €) | 5 | ✓ (1 račun) | ✓ 1 integ., do 1000/mj |
| **PRO** | 24,00 € | 288,00 → **240,00 €** | 70 (+dodatni 0,08 €) | neograničeno | ✓ (neograničeno) | ✓ više integ., do 3000/mj |

**Ključne razlike među paketima:**
- **LIGHT → LIGHT+**: LIGHT+ dodaje **fiskalizaciju u krajnjoj potrošnji (F1)**,
  izradu fiskalnih računa, A4/POS printer i **FIRA POS App**. (LIGHT je čisti
  eRačun/B2B-B2G paket bez maloprodajne fiskalizacije.)
- **LIGHT+ → BASIC**: BASIC dodaje **bankarstvo, ulazne račune/troškove, AI OCR
  (50), Webshop/API, novčani tok, 5 korisnika**, i podiže eRačune na 40/mj.
- **BASIC → PRO**: PRO dodaje **skladište, upravljanje vremenom/satnice,
  neograničeno korisnika i bankovnih računa, više API integracija (do 3000/mj),
  AI OCR 100**, eRačuni 70/mj.

**Model naplate — pouke:**
- **Metered po eRačunu**: preko uključene kvote naplaćuju **0,08 € + PDV po eRačunu**.
  To je klasičan usage-based lock-in koji nas otvara da ponudimo **bez naplate po računu**.
- **Multi-company popust**: 50% na svaku sljedeću pretplatu (samo isto vlasništvo,
  samo godišnje, ne vrijedi za LIGHT/LIGHT+).

> ⚠️ **Proturječje koje treba označiti:** Marketinške stranice (`/news/pretplata/`,
> engleski `/pricing/`) navode **"10%"** godišnjeg popusta, dok HR cjenik nakon
> odabira države eksplicitno kaže **"17% jeftinije"** i naslov stranice glasi
> "…uz 17% popusta". Izračun (4,80×12=57,60 → 48,00) potvrđuje **~16,7% ≈ 17%**.
> Vjerojatno zastarjeli marketinški tekst na engleskim stranicama. Za DE/AT cjenik
> nismo verificirali iznose (drukčije tržište/PDV).

---

## 4. Custom Webshop API — sažetak (detalji u reference dokumentu)

Ne ponavljamo cijelu shemu — vidi `docs/reference/fira-custom-webshop-api.md`.
Najvažnije za konkurentsku poziciju:

```
POST https://app.fira.finance/api/v1/webshop/order/custom
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

- **API ključ = tenant identitet.** Sve o izdavatelju (tvrtka, certifikat, fiskalne
  postavke, poslovni prostor) je server-side; payload nosi samo *kupac + stavke + tip*.
  Dobra arhitektura koju i mi slijedimo.
- `invoiceType`: `PONUDA` | `RAČUN` | `FISKALNI_RAČUN`.
- `webshopType`: `WOO_COMMERCE` | `SHOPIFY` | `CUSTOM`.
- `taxRate` po stavci je **decimalni** (0,25 / 0,13 / 0,05 / 0); `kpdCode` na stavci.
- Odgovori: `ErrorDetails { timestamp, message, details, validationErrors[] }`.

**Uočene slabosti API-ja (naša prilika za paritet+):**
1. `webshopModel` deklariran kao **query** parametar tipa objekt, a u praksi se
   šalje kao JSON **body** — nekonzistentan OpenAPI dizajn.
2. **Emoji u `internalNote` ruše backend** (`org.hibernate.exception.DataException`)
   — signal `utf8` (ne `utf8mb4`) kolacije u njihovoj bazi. → **Mi: pun Unicode
   (`utf8mb4`) svugdje + stroga validacija/sanitizacija.**
3. Nejasna obaveznost polja (`shippingAddress`, `validTo`, `termsHR`). → **Mi:
   stroga, dokumentirana shema (zod/valibot) s jasnim porukama grešaka.**
4. `note` i `taxRate` na razini narudžbe su **deprecated** — tehnički dug u njihovom API-ju.

---

## 5. Recenzije, reputacija, prisutnost

- **Trustpilot** (<https://www.trustpilot.com/review/fira.finance>) i Google
  ocjene su pretežno pozitivne: naglašavaju **jednostavnost, intuitivnost i
  izvrsnu, brzu podršku**. Self-reported: 4,9/5 Google, 4,7/5 Trustpilot.
- **Društvene mreže:** Facebook (`fira.finance`), Instagram, LinkedIn, YouTube
  (video upute). X/Twitter nije istaknut.
- **Mediji/spomeni:** Bug.hr (biznis), eCommerce Hrvatska (priča iza FIRA-e),
  Erste Bank novine, Women in Adria (promo: 3 mjeseca besplatno za članice),
  FISCO usporedba programa za izdavanje računa.
- **Slabe točke iz recenzija:** nismo pronašli sustavno negativne recenzije u
  javnom pretraživanju (uzorak pristran prema pozitivnom); FISCO usporedba navodi
  da (u nekim starijim/nižim planovima) **nedostaju webshop i skladište** te da
  eRačun ide **preko posrednika, a ne direktnom FINA integracijom** na nižim razinama.

> ⚠️ Ocjene i "4.000+ korisnika" su self-reported marketinške brojke; tretirati
> kao indikativne, ne kao neovisno revidirane.

---

## 6. Konkurentski krajolik (HR) — kontekst

Iz FISCO usporedbe "Programi za izdavanje računa u Hrvatskoj (2026.)"
(<https://www.fisco.hr/programi-za-izdavanje-racuna/>), okvirne početne cijene:

| Program | Početna cijena | Besplatno |
|---|---|---|
| FISCO | ~9 €/mj | 30 dana |
| Solo | ~10 €/mj | do 3 računa/mj |
| Parra | ~4,99 €/mj + PDV | do 10 računa/mj |
| **FIRA** | **~4,80 €/mj + PDV** | 30 dana |
| Kasica | ~70 €/god | 1 mjesec |

> ⚠️ Cijene konkurenata iz sekundarnog izvora (FISCO blog); nisu verificirane na
> primarnim stranicama tih proizvoda i mogu se mijenjati. FIRA se pozicionira kao
> **cjenovno agresivan ulazni paket** (najniži LIGHT), a monetizira kroz upsell na
> BASIC/PRO i naplatu po eRačunu.

---

## 7. Analiza za NAS — paritet, slabosti, prilike

### 7.1 Što MORAMO imati za paritet (must-have)
Da bismo bili ozbiljna alternativa FIRA-i, minimalno pokrivamo:

1. **Fiskalizacija 2.0 / eRačun** (UBL 2.1 / EN 16931, HR CIUS, KPD šifre po stavci).
2. **Izlazne dokumente**: ponuda, predračun, avansni račun, račun, storno, otpremnica.
3. **Fiskalni račun (F1) u krajnjoj potrošnji** + POS scenarij (gotovina/kartica).
4. **PDF generator + QR kod za plaćanje** (HUB-3 / PayByQR).
5. **Ponavljajući računi**, slanje na e-mail, izvoz.
6. **Multi-currency** (EUR + ostale), **višejezičnost** (HR/EN/DE) na dokumentima.
7. **Webshop/API integracija**: WooCommerce, Shopify + generički REST (paritet s
   njihovim `POST /webshop/order/custom`), webhook-driven automatizacija.
8. **Zaprimanje eRačuna** (Peppol/FINA/ePoslovanje ruta) + eArhiva.
9. **Upravljanje klijentima i proizvodima** (s KPD šiframa).
10. **Izvještaji**: prihodi/PDV, PO-SD i KPR za paušalce, Excel izvoz.
11. (Poželjno za viši paritet) **Open banking / PSD2** uparivanje uplata,
    **AI OCR** ulaznih računa, **skladište**, **satnice** — ovo su njihovi
    diferencijatori na BASIC/PRO; ne moramo sve odmah, ali su na mapi.

### 7.2 Gdje su im slabosti (naše prilike)

| Njihova slabost | Naša prilika |
|---|---|
| **Zatvoreni vlasnički SaaS**, vendor lock-in | **Open-source + self-host** — podaci i certifikat ostaju kod korisnika |
| **Naplata po eRačunu** (0,08 €/kom preko kvote) | **Bez naplate po računu**; predvidljiv trošak / self-host = 0 marginalno |
| **API iza pretplate** (samo BASIC/PRO), i to metered do 1000/3000 računa/mj | **API-first, bez umjetnih limita**, dostupan svima |
| Tehnički dug: `webshopModel` kao query, `utf8` rušenje na emoji, deprecated polja | **Čist, dokumentiran API**, `utf8mb4`, stroga shema (zod), jasne greške |
| Netransparentna arhitektura (Azure, closed) | **Transparentnost** — javni kod, auditabilna fiskalna logika, reproducibilni potpisi |
| eRačun preko **posrednika** (ePoslovanje.hr) na LIGHT | **Direktna FINA/Peppol** ruta kao opcija, bez trećih strana |
| 1 formalni zaposlenik → **ograničen support/razvoj bandwidth** | Zajednica + doprinosi; brže krpanje rubnih slučajeva |
| **Freemium samo 30 dana** pa plaćanje | **Trajno besplatan self-host / open-core** za developere i tech-savvy SME |
| Fokus na "no-code" SME; developeri su drugorazredni | **Developer-first** DX: SDK-ovi, primjeri, CI, jasan OpenAPI |

### 7.3 Gdje su JAKI (ne podcjenjivati)
- **Bankarstvo/PSD2 + AI OCR + AI uparivanje uplata** — ozbiljan moat za
  ne-tehničke korisnike; teško i skupo replicirati.
- **POS mobilna app** i end-to-end maloprodajni scenarij.
- **Brend, partnerstvo s Erste**, 4.000+ korisnika, poliran UX i podrška.
- **Multi-country (HR/DE/AT)** već izgrađen.
- **Profitabilni i samofinancirani** — nisu pod pritiskom runwaya, mogu čekati.

### 7.4 Strateška preporuka (pozicioniranje)
- Ne natjecati se frontalno na "sve-u-jednom SME app"; **pobijediti na osi
  developer/webshop/automatizacija + transparentnost + trošak**.
- Poruka: *"FIRA-kompatibilan API, ali open-source, self-host, bez naplate po
  eRačunu i bez lock-ina."* Ponuditi **migracijski/kompat sloj** za njihov
  `webshop/order/custom` payload (isti pojmovi: invoiceType, KPD, taxRate po stavci).
- Ciljati korisnike koje njihov model **kažnjava**: webshopovi s velikim brojem
  računa (metered 0,08 €/kom preko limita), tvrtke koje trebaju API na jeftinom
  planu (kod FIRA-e API tek od 14,40 €/mj).

---

## Izvori

- <https://fira.finance/> — početna, opis proizvoda, metrike, moduli (pristup 2026-07-04)
- <https://fira.finance/hr/cjenik/> — **puni HR cjenik, 4 paketa, limiti** (renderirano u pregledniku; pristup 2026-07-04)
- <https://fira.finance/pricing/> — engleska cjenovna stranica, "10%" popust, multi-country (pristup 2026-07-04)
- <https://fira.finance/hr/funkcionalnosti/> — popis funkcionalnosti (pristup 2026-07-04)
- <https://fira.finance/about-us/> — misija, tim, partneri, metrike (pristup 2026-07-04)
- <https://fira.finance/webshop-integration/> — webshop integracija, webhooks, API (pristup 2026-07-04)
- <https://fira.finance/webshop/shopify/> i <https://fira.finance/webshop/woocommerce/> — pojedine integracije (pristup 2026-07-04)
- <https://fira.finance/news/pretplata/> — godišnja pretplata, "10%" popust (pristup 2026-07-04)
- <https://fira.finance/faq/> — pitanja i odgovori (pristup 2026-07-04)
- <https://app.swaggerhub.com/apis-docs/FIRAFinance/Custom_webshop/v1.0.0> — službeni OpenAPI Custom Webshop API (pristup 2026-07-04)
- <https://infobiz.fina.hr/tvrtka/fira-solutions-d-o-o/OIB-21233832319> — **Fina Info.BIZ: financije, OIB, sjedište, uprava, zaposleni** (pristup 2026-07-04)
- <https://www.companywall.hr/tvrtka/fira-solutions-doo/MMPudH9R> — registarski podaci tvrtke (pristup 2026-07-04)
- <https://reputacija.hr/tvrtka/fira-solutions> — financijski rezultati (pristup 2026-07-04)
- <https://www.erstebank.hr/hr/erste-novine/fira-za-pametan-pristup-poslovanju> — Erste partnerstvo/portret (pristup 2026-07-04)
- <https://www.bug.hr/biznis/fira-aplikacija-za-pracenje-financija-obrtnika-i-malih-poduzetnika-s-racunima-26646> — Bug.hr članak (pristup 2026-07-04)
- <https://ecommerce.hr/od-ideje-do-uspjeha-prica-iza-fira-e/> — priča/intervju o FIRA-i (pristup 2026-07-04)
- <https://www.fisco.hr/programi-za-izdavanje-racuna/> — usporedba HR programa i okvirne cijene konkurenata (sekundarni izvor; pristup 2026-07-04)
- <https://www.trustpilot.com/review/fira.finance> — Trustpilot recenzije (pristup 2026-07-04)
- `docs/reference/fira-custom-webshop-api.md` — API iz prve ruke (interni izvor)

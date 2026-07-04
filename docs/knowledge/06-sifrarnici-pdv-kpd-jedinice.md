# 06 — Šifrarnici: PDV, KPD, jedinice mjere, načini plaćanja

> Stanje na dan **2026-07-04**. Fiskalizacija 2.0 (obveza eRačuna B2B/B2G + eIzvještavanje)
> na snazi je od **1. siječnja 2026.** za obveznike PDV-a. Ovaj dokument pokriva
> šifrarnike (kodne liste) koje naš servis mora poznavati i validirati po stavci računa:
> **PDV stope i kategorije oslobođenja**, **KPD 2025**, **jedinice mjere (UN/ECE Rec 20)**,
> **načini plaćanja** (fiskalizacija 1.0 vs. eRačun) i **valute**.
>
> ⚠️ Pravilo dokumenta: svaki šifrarnik ima *dva svijeta* — **fiskalizacija 1.0** (gotovinski
> B2C račun, CIS/SOAP, jednostavne domaće oznake) i **eRačun / EN 16931** (bezgotovinski
> B2B/B2G, UBL 2.1 / UN/CEFACT CII, standardizirane UNTDID/UNECE kodne liste). Ne miješati!

---

## 0. Kratki pregled — koji šifrarnik gdje

| Domena | Fiskalizacija 1.0 (gotovinski račun) | eRačun / Fiskalizacija 2.0 (EN 16931) |
|---|---|---|
| PDV stopa | postotak + porezna osnovica u XML-u | postotak + **VAT category code** (UNTDID 5305) |
| Oslobođenje / prijenos obveze | tekstualno / porezna oznaka | **VAT category = E/AE/Z/G/K/O** + **VATEX** razlog (BT-121) |
| Klasifikacija proizvoda | — (nije bilo obvezno) | **KPD 2025** (min. 6 znamenki) — obvezno po stavci |
| Jedinica mjere | slobodan tekst / interno | **UN/ECE Rec 20** kod (H87, HUR, KGM…) |
| Način plaćanja | **G / K / C / T / O** (domaća oznaka) | **UNTDID 4461** payment means (10, 30, 48, 58…) |
| Valuta | HRK → **EUR** (od 2023-01-01) | ISO 4217 (**EUR**) |

---

## 1. PDV stope u Hrvatskoj (aktualno 2026)

Pravni izvor: **Zakon o porezu na dodanu vrijednost**, čl. 38.
([zakon.hr](https://www.zakon.hr/z/1455/zakon-o-porezu-na-dodanu-vrijednost)).
U primjeni su četiri razine: **25 %** (opća), **13 %**, **5 %** (snižene) te **0 % / oslobođeno**.

| Stopa | Uloga | Tipične kategorije (nepotpuno — uvijek provjeriti čl. 38.) |
|---|---|---|
| **25 %** | Opća stopa | Sve isporuke dobara i usluga koje nisu izrijekom navedene pod nižom stopom |
| **13 %** | Snižena | Smještaj (hoteli, kampovi, nautika) i usluge doručka/pansiona; ugostiteljstvo (priprema i usluživanje jela i slastica); voda iz javne vodoopskrbe; električna energija, prirodni plin i grijanje (uz iznimke); ogrjevno drvo, pelet, briket; javna usluga sakupljanja komunalnog otpada; periodični tisak (časopisi, tjednici — osim dnevnih novina); dječje autosjedalice i pelene; menstrualne potrepštine; urne i ljesovi; autorske usluge pisaca, skladatelja, umjetnika |
| **5 %** | Snižena | Sve vrste kruha i mlijeka; nadomjesci za majčino mlijeko; dječja hrana; jestiva ulja i masti, maslac, margarin; meso, riba, morski plodovi; povrće, voće, orašasti plodovi; jaja; knjige (stručne, znanstvene, obrazovne, udžbenici); lijekovi s odobrenjem; medicinska oprema/pomagala za invalide; dnevne novine (medij, tiskane na papiru); znanstveni časopisi; ulaznice za kino, koncerte, sportske i kulturne događaje |
| **0 %** | Poseban slučaj | Npr. isporuka i ugradnja solarnih ploča na stambene/javne objekte. Nije isto kao „oslobođeno" — pravno je oporeziva isporuka sa stopom 0 %. |

> ⚠️ Napomena: točan opseg pojedinih stavki (npr. koja hrana je 5 % vs. 13 %, iznimke za
> energente) mijenja se izmjenama Zakona i može biti predmet mišljenja Porezne uprave.
> Za svaku netrivijalnu kvalifikaciju provjeriti **čl. 38. Zakona o PDV-u** i mišljenja PU.
> Servis ne smije „hardkodirati" mapiranje proizvod→stopa; to je odgovornost obveznika.

> ⚠️ **Prag ulaska u sustav PDV-a**: promijenjen je (100.000 EUR godišnjeg prometa od
> 2025.). To je relevantno jer nefiskalni/mali obveznici imaju drukčiji tretman PDV-a
> na računu (npr. „PDV nije obračunan" — oslobođenje malog poreznog obveznika). Provjeriti
> aktualni prag u Zakonu prije oslanjanja.

### 1.1. Kako se PDV prikazuje

- **Fiskalizacija 1.0 (CIS):** u XML-u računa šalje se razrada po poreznim stopama
  (osnovica + iznos poreza) unutar `Racun/Pdv/Porez` (naziv, stopa, osnovica, iznos).
  Postoje i posebni blokovi za PNP (porez na potrošnju), naknade i oslobođenja.
- **eRačun (EN 16931):** svaka stavka ima **VAT category code** (BT-151) i **stopu**
  (BT-152), a na razini računa postoji razrada po PDV-u (**VAT breakdown**, BG-23) s
  kategorijom, stopom, osnovicom, iznosom i — po potrebi — **razlogom oslobođenja**.

---

## 2. PDV kategorije i oznake oslobođenja (EN 16931)

Za eRačun se koriste **dvije razine kodiranja**:

1. **VAT category code** — UNTDID (EDIFACT) **5305**, BT-151 (stavka) / BT-118 (razrada).
2. **VAT exemption reason code** — **VATEX** kodna lista, BT-121 (+ tekst razloga BT-120).

### 2.1. VAT category codes (UNTDID 5305) — relevantni za HR

Izvor: [Peppol BIS Billing 3.0 — UNCL5305](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL5305/)

| Kod | Značenje (EN) | Hrvatski kontekst / primjena |
|---|---|---|
| **S** | Standard rate | Standardna ili snižena stopa PDV-a (25 %, 13 %, 5 %). Za stopu > 0. |
| **Z** | Zero rated goods | Nulta stopa (stopa = 0 %, oporeziva isporuka). Osnovica ulazi u PDV, iznos = 0. |
| **E** | Exempt from tax | Oslobođeno PDV-a (npr. financijske/osiguravateljske usluge, najam nekretnina, oslobođenje malog obveznika). Zahtijeva razlog (VATEX/tekst). |
| **AE** | VAT Reverse Charge | **Prijenos porezne obveze** — kupac obračunava PDV (npr. građevinske usluge iz čl. 75. st. 3., promet nekretninama, otpad). |
| **K** | VAT exempt — intra-community supply (EEA) | Oslobođena **intrakomunitarna isporuka** dobara unutar EU. |
| **G** | Free export item, VAT not charged | **Izvoz** izvan EU — oslobođeno. |
| **O** | Services outside scope of tax | Usluge/isporuke **izvan područja primjene** PDV-a. |
| **L** | Canary Islands general indirect tax (IGIC) | Španjolska (Kanari) — **nije za HR**. |
| **M** | Tax for production, services, import in Ceuta/Melilla (IPSI) | Španjolska — **nije za HR**. |

Pravila (EN 16931 business rules, izbor):
- Za **AE**, **K**, **G**, **O**, **E** stopa PDV-a (BT-152) mora biti **0**.
- Za **S** stopa mora biti **> 0**.
- Za **Z** stopa mora biti **0**.
- Ako je kategorija **AE** ili **E** (i sl.), razrada mora sadržavati **razlog oslobođenja**
  (VATEX kod BT-121 i/ili tekst BT-120). Kod **AE** obavezno je navesti i PDV ID kupca.
- U jednom računu, kod prijenosa obveze, **sve stavke** moraju biti tretirane kao AE
  (ne miješa se AE s oporezivim stavkama na istom računu).

### 2.2. VATEX kodovi (razlog oslobođenja, BT-121)

Službena kodna lista Europske komisije („VAT Exemption Reason Code list — VATEX"),
usklađena u Peppol BIS. Izbor najrelevantnijih za HR:

| VATEX kod | Značenje | Tipična HR primjena |
|---|---|---|
| **VATEX-EU-AE** | Reverse charge | Prijenos porezne obveze (uz kategoriju AE) |
| **VATEX-EU-IC** | Intra-Community supply | Intrakomunitarna isporuka dobara (uz K) |
| **VATEX-EU-G** | Export outside the EU | Izvoz izvan EU (uz G) |
| **VATEX-EU-O** | Not subject to VAT | Izvan opsega PDV-a (uz O) |
| **VATEX-EU-D** | Intra-Community acquisition (čl. 138) | Posebni slučajevi intrakomunitarnog stjecanja |
| **VATEX-EU-132** | Oslobođenja iz čl. 132 Direktive 2006/112/EZ | Djelatnosti od javnog interesa (općenito) |
| **VATEX-EU-132-1B** | Bolnička i medicinska zaštita | Zdravstvene ustanove |
| **VATEX-EU-132-1C** | Medicinska njega (liječnici, paramedicinari) | Liječničke usluge |
| **VATEX-EU-132-1G** | Socijalna skrb | Domovi, socijalne usluge |
| **VATEX-EU-132-1I** | Obrazovanje | Škole, obuke |
| **VATEX-EU-132-1J** | Privatna nastava | Poduka |
| **VATEX-EU-132-1N** | Kulturne usluge | Priznata kulturna tijela |
| **VATEX-EU-143** | Oslobođenja iz čl. 143 (uvoz) | Oslobođeni uvoz |
| **VATEX-EU-148** | Oslobođenja iz čl. 148 (plovila/zrakoplovi) | Međunarodni promet |
| **VATEX-EU-151** | Diplomatska/konzularna oslobođenja | Diplomacija |
| **VATEX-EU-309** | Oslobođenja iz čl. 309 (putničke agencije) | Posebni postupak za putn. agencije |
| **VATEX-EU-79-C** | Iznos primljen u ime treće strane | Prolazne stavke |

> Osim `VATEX-EU-*` postoje i nacionalni kodovi drugih država (npr. `VATEX-FR-*`,
> `VATEX-ES-*`) koji **nisu** za hrvatske obveznike. Ne postoji vlastiti set `VATEX-HR-*`
> kao dio EU liste — HR oslobođenja se mapiraju na EU (čl. 132/143/148…) ili se koristi
> slobodni tekst razloga (BT-120).
>
> ⚠️ Kombinacija kategorija ↔ VATEX ↔ tekst razloga je predmet **HR CIUS (HR-FISK 2.0)**
> pravila; prije produkcije provjeriti u službenoj *Specifikaciji osnovne uporabe eRačuna
> s proširenjima* Ministarstva financija (vidi Izvori) i kroz **Validator eRačuna** PU.

Izvori: [Peppol VATEX code list](https://docs.peppol.eu/poacc/billing/3.0/codelist/vatex/),
[EK Code lists / VATEX](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108957/Code+lists).

### 2.3. Primjer — razrada PDV-a s prijenosom obveze (UBL, skraćeno)

```xml
<cac:TaxTotal>
  <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
  <cac:TaxSubtotal>
    <cbc:TaxableAmount currencyID="EUR">1000.00</cbc:TaxableAmount>
    <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
    <cac:TaxCategory>
      <cbc:ID>AE</cbc:ID>                     <!-- BT-118: reverse charge -->
      <cbc:Percent>0</cbc:Percent>
      <cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode> <!-- BT-121 -->
      <cbc:TaxExemptionReason>Prijenos porezne obveze, čl. 75. st. 3. Zakona o PDV-u</cbc:TaxExemptionReason>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>
</cac:TaxTotal>
```

---

## 3. KPD 2025 — Klasifikacija proizvoda po djelatnostima

### 3.1. Što je KPD i zašto je obvezan

**KPD 2025.** (Klasifikacija proizvoda po djelatnostima Republike Hrvatske, verzija 2025.)
je nacionalna statistička klasifikacija **proizvoda i usluga**. Potpuno je usklađena s
europskom **CPA 2.2** (Classification of Products by Activity) i preko nje s međunarodnim
sustavima.

- **KPD** označava **proizvod ili uslugu** koju subjekt **isporučuje**.
- **NKD 2025.** (Nacionalna klasifikacija djelatnosti) označava **djelatnost** kojom se
  subjekt **bavi**. Jedan subjekt ima registrirane NKD djelatnosti, ali može koristiti
  **više KPD šifri** za razne proizvode/usluge. KPD je izveden iz/paralelan NKD-u
  (djelatnost → proizvodi te djelatnosti), analogno odnosu NACE ↔ CPA na razini EU.

**Zašto obvezno u Fiskalizaciji 2.0:** u eRačunu se **svaka stavka** robe/usluge mora
povezati s ispravnom KPD oznakom od **najmanje šest znamenki**. Bez KPD oznake eRačun
**ne prolazi fiskalizaciju** i smatra se neispravnim. Obveznici su imali pripremno
razdoblje **do kraja 2025.** za povezivanje svojih artikala s KPD 2025.

Izvor (službeno): [Porezna uprava — Klasifikacija roba i usluga u eRačunu](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/klasifikacija-roba-i-usluga-u-eracunu),
[PU — Klasifikacija proizvoda (KPD 2025.)](https://porezna-uprava.gov.hr/hr/klasifikacija-roba-i-usluga/7718).

### 3.2. Hijerarhijska struktura

KPD je hijerarhijska, od najšire prema najužoj razini. Na najnižoj razini ima
**3.359 potkategorija**, svaka označena **šesteroznamenkastom** oznakom.

| Razina | Naziv | Oznaka (znamenke) | Napomena |
|---|---|---|---|
| 1 | Područje (sektor) | slovo (A–…) | najviša razina |
| 2 | Odjeljak | 2 znamenke | |
| 3 | Skupina | 3 znamenke | |
| 4 | Razred | 4 znamenke | usklađen s NKD razredom |
| 5 | Kategorija | 5 znamenki | |
| 6 | **Potkategorija** | **6 znamenki** | **minimum za eRačun** |

Format oznake: `DD.G.KK` → npr. `52.10.00`, `96.21.11` (točke su prezentacijske;
u XML-u se obično šalje bez ili s točkama ovisno o CIUS pravilu — provjeriti spec.).

> ⚠️ Preširoke oznake (npr. 4-znamenkasti razred) **nisu dovoljne** — traži se najmanje
> 6 znamenki (potkategorija).

### 3.3. Primjeri KPD šifri

| KPD šifra | Opis (primjer) |
|---|---|
| `52.10.00` | Skladištenje i pohrana robe |
| `96.21.11` | Frizerske usluge za žene i djevojčice |
| `10.11.xx` | Prerada i konzerviranje mesa (ilustrativno — provjeriti egzaktnu potkategoriju) |

> ⚠️ Konkretne 6-znamenkaste oznake **uvijek** provjeriti u službenoj tražilici — ne
> pogađati. Servis treba čuvati lokalnu kopiju šifrarnika i redovito je osvježavati.

### 3.4. Gdje se dohvaća službeni šifrarnik (DZS)

- **KLASUS** — aplikacija/tražilica Državnog zavoda za statistiku:
  [https://web.dzs.hr/App/klasus/](https://web.dzs.hr/App/klasus/default.aspx?lang=hr)
- Tehnička podrška DZS-a: **KPD@dzs.hr**
- Porezna uprava održava informativnu stranicu i poveznice (vidi 3.1).

> ⚠️ „Puni" strojno-čitljivi šifrarnik (CSV/Excel) — primarni izvor je DZS/KLASUS.
> Postoje i neslužbeni pretraživači (npr. `kpd.informacija.hr`) korisni za brzu provjeru,
> ali **za produkciju koristiti DZS izvor** i verzioniranje (KPD **2025.**). Ne oslanjati
> se na vendor-liste kao autoritet.

---

## 4. Jedinice mjere (UN/ECE Recommendation 20)

eRačun (EN 16931, BT-130 „Invoiced quantity unit of measure code") koristi
**UN/ECE Recommendation 20** (uz proširenja Rec 21) kodove jedinica mjere — 3-znakovni
(ili slovno-brojčani) kodovi. Fiskalizacija 1.0 nije zahtijevala standardizirani kod
(jedinica je bila slobodan tekst / interna oznaka).

### 4.1. Najčešće jedinice za HR račune

| Kod | Engleski naziv | Hrvatski naziv | Napomena |
|---|---|---|---|
| **H87** | piece | komad | najčešća oznaka za „kom" |
| **C62** | one / unit | jedinica (komad) | alternativa H87; „one" |
| **KGM** | kilogram | kilogram | |
| **GRM** | gram | gram | |
| **TNE** | tonne (metric) | tona | |
| **LTR** | litre | litra | |
| **MLT** | millilitre | mililitar | |
| **MTR** | metre | metar | |
| **CMT** | centimetre | centimetar | |
| **MMT** | millimetre | milimetar | |
| **KMT** | kilometre | kilometar | |
| **MTK** | square metre | četvorni metar (m²) | |
| **MTQ** | cubic metre | prostorni metar (m³) | |
| **HUR** | hour | sat | usluge po satu |
| **DAY** | day | dan | najam po danu |
| **WEE** | week | tjedan | |
| **MON** | month | mjesec | pretplate/najam |
| **ANN** | year | godina | |
| **KWH** | kilowatt hour | kilovatsat (kWh) | struja |
| **MWH** | megawatt hour | megavatsat (MWh) | |
| **PR** | pair | par | |
| **SET** | set | set / komplet | |
| **NAR** | number of articles | broj artikala | |
| **XPP** | (packaging) piece / package | paket/pakiranje | UN/ECE Rec 21 (X-prefiks) |
| **XBX** | box | kutija | Rec 21 |

> ⚠️ Za „komad" u praksi se najčešće koristi **H87**; neki sustavi koriste **C62**.
> Uskladiti s HR CIUS preporukom i s onim što prima PU validator. Postotak/„paušal"
> nema jedinicu — koristi se odgovarajući kod ili se stavka modelira drukčije.

Izvori: [Peppol BIS — UN/ECE Rec 20 code list](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNECERec20/),
[UN/CEFACT Rec 20 vocabulary](https://service.unece.org/trade/uncefact/vocabulary/rec20/).

---

## 5. Načini plaćanja

### 5.1. Fiskalizacija 1.0 (gotovinski račun, CIS)

Tehnička specifikacija CIS-a propisuje **fiksni skup** oznaka načina plaćanja
(polje `NacinPlac` u XML-u računa). Oznake se **ne mogu mijenjati**:

| Oznaka | Značenje | Napomena |
|---|---|---|
| **G** | Gotovina | novčanice i kovanice |
| **K** | Kartice | debitne/kreditne kartice |
| **C** | Ček | (rijetko u praksi) |
| **T** | Transakcijski račun | virman / uplata na račun |
| **O** | Ostalo | sve ostalo **i** slučaj **više načina plaćanja** na jednom računu |

Pravilo: ako je jedan račun plaćen na **više načina**, prijavljuje se kao **O (Ostalo)**.
Na tiskanom računu smiju stajati opisniji izrazi (npr. „novčanice i kovanice"), ali u
XML poruci mora biti jedna od G/K/C/T/O.

> ⚠️ Postoji povijesna nedosljednost: neki stariji izvori spominju „P" i sl. — mjerodavna
> je aktualna **Tehnička specifikacija CIS-a** Porezne uprave. Koristi isključivo G/K/C/T/O.

Izvor: [Zakon o fiskalizaciji u prometu gotovinom](https://www.zakon.hr/c/zakon/672545/zakon-o-fiskalizaciji-u-prometu-gotovinom),
[Porezna uprava — fiskalizacija (dokumentacija)](https://porezna.gov.hr/fiskalizacija/).

### 5.2. eRačun (EN 16931 — UNTDID 4461, BT-81)

eRačun koristi kodnu listu **UNTDID 4461** („Payment means code"). Bezgotovinski B2B/B2G
promet je pretežno kreditni transfer. Izbor relevantnih kodova:

| Kod | Značenje (EN) | Hrvatski kontekst |
|---|---|---|
| **10** | In cash | gotovina |
| **20** | Cheque | ček |
| **30** | Credit transfer | kreditni transfer (opći) |
| **42** | Payment to bank account | uplata na bankovni račun |
| **48** | Bank card | bankovna kartica |
| **49** | Direct debit | izravno terećenje |
| **54** | Credit card | kreditna kartica |
| **55** | Debit card | debitna kartica |
| **57** | Standing agreement | trajni nalog / dogovor |
| **58** | SEPA credit transfer | **SEPA kreditni transfer** — najčešće za B2B virman |
| **59** | SEPA direct debit | SEPA izravno terećenje |
| **68** | Online payment service | internetsko plaćanje |
| **97** | Clearing between partners | prijeboj / kompenzacija |
| **ZZZ** | Mutually defined | dogovoreno između strana |

> Za klasični eRačun s uplatom na IBAN najčešće se koristi **58 (SEPA credit transfer)**
> ili **30 (credit transfer)**. Kod **58** obično se navode i podaci za plaćanje
> (IBAN primatelja BT-84, poziv na broj / PaymentID BT-83, model HR00/HR01…).

Izvor: [Peppol BIS — UNCL4461](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL4461/).

### 5.3. Mapiranje 1.0 ↔ eRačun (orijentacijski)

| Fiskalizacija 1.0 | eRačun (UNTDID 4461) |
|---|---|
| G (gotovina) | 10 |
| K (kartice) | 48 / 54 / 55 |
| C (ček) | 20 |
| T (transakcijski) | 58 (SEPA) ili 30 |
| O (ostalo) | 97 / ZZZ / prema stvarnom sredstvu |

> ⚠️ Ovo je pomoćno mapiranje — nije normativno. Fiskalizacija 1.0 i eRačun su **odvojeni
> tokovi**; ne pretpostavljati automatsku ekvivalenciju bez provjere HR CIUS-a.

---

## 6. Valute

- Od **2023-01-01** Hrvatska je u **eurozoni**; službena valuta je **EUR** (ISO 4217).
  HRK je povučen; iznosi na računima su u EUR.
- eRačun: valuta računa **BT-5** (Invoice currency code, ISO 4217 = `EUR`). Moguća je
  zasebna „valuta za PDV" (BT-6) ako se razlikuje — u HR praksi obično `EUR`.
- Fiskalizacija 1.0: iznosi u EUR, decimalni separator točka, 2 decimale u XML-u.
- Fira/webshop API (referenca iz prve ruke) podržava više valuta (`EUR, USD, AUD, BAM…`),
  ali za **fiskalni** HR račun relevantan je **EUR**.

---

## 7. Implikacije za naš servis (sažetak zahtjeva)

1. **Po stavci** validirati: KPD (≥6 znamenki, iz verzionirane DZS liste), jedinicu
   (UN/ECE Rec 20), PDV stopu **i** VAT category (UNTDID 5305), po potrebi VATEX + razlog.
2. Držati **lokalne, verzionirane kopije** šifrarnika (KPD 2025, UNCL5305, VATEX,
   UNECERec20, UNCL4461, ISO 4217) uz izvor i datum osvježavanja; ne pogađati kodove.
3. Razlikovati **fiskalizaciju 1.0** (G/K/C/T/O, domaći XML) od **eRačuna** (EN 16931
   kodne liste) — dva odvojena mapiranja.
4. Puni Unicode (`utf8mb4`) u opisima/nazivima (naučeno iz Fira integracije — emoji su
   rušili backend na starijoj kolaciji).
5. Prije produkcije proći kroz **službeni Validator eRačuna** PU i *Specifikaciju osnovne
   uporabe eRačuna s proširenjima (HR CIUS / HR-FISK 2.0)*.

---

## Izvori

- [Porezna uprava — Klasifikacija roba i usluga u eRačunu](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/klasifikacija-roba-i-usluga-u-eracunu) — službeno: KPD min. 6 znamenki, rok do kraja 2025., KLASUS, usklađenost s CPA 2.2 (pristup 2026-07-04)
- [Porezna uprava — Klasifikacija proizvoda (KPD 2025.)](https://porezna-uprava.gov.hr/hr/klasifikacija-roba-i-usluga/7718) — službena stranica o KPD 2025 (pristup 2026-07-04)
- [DZS — KLASUS tražilica klasifikacija](https://web.dzs.hr/App/klasus/default.aspx?lang=hr) — službeni izvor KPD 2025 (pristup 2026-07-04)
- [Zakon o porezu na dodanu vrijednost — zakon.hr](https://www.zakon.hr/z/1455/zakon-o-porezu-na-dodanu-vrijednost) — čl. 38. PDV stope 25/13/5 (pristup 2026-07-04)
- [Porezna uprava — FAQ stope PDV-a](https://porezna-uprava.gov.hr/hr/najcesce-postavljena-pitanja-faq-stope-pdv-a/4350) — tumačenja stopa (pristup 2026-07-04)
- [Peppol BIS Billing 3.0 — VAT category codes (UNCL5305)](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL5305/) — S/Z/E/AE/K/G/O/L/M (pristup 2026-07-04)
- [Peppol BIS Billing 3.0 — VATEX code list](https://docs.peppol.eu/poacc/billing/3.0/codelist/vatex/) — razlozi oslobođenja BT-121 (pristup 2026-07-04)
- [Europska komisija — eInvoicing Code lists (VATEX)](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108957/Code+lists) — službene EK kodne liste (pristup 2026-07-04)
- [Peppol BIS Billing 3.0 — Payment means (UNCL4461)](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNCL4461/) — 10/20/30/48/58/59… (pristup 2026-07-04)
- [Peppol BIS Billing 3.0 — UN/ECE Rec 20 jedinice mjere](https://docs.peppol.eu/poacc/billing/3.0/codelist/UNECERec20/) — H87/HUR/KGM… (pristup 2026-07-04)
- [UN/CEFACT — Recommendation 20 vocabulary](https://service.unece.org/trade/uncefact/vocabulary/rec20/) — izvor jedinica mjere (pristup 2026-07-04)
- [Zakon o fiskalizaciji u prometu gotovinom — zakon.hr](https://www.zakon.hr/c/zakon/672545/zakon-o-fiskalizaciji-u-prometu-gotovinom) — okvir fiskalizacije 1.0 (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija (portal/dokumentacija)](https://porezna.gov.hr/fiskalizacija/) — CIS tehnička specifikacija, načini plaćanja G/K/C/T/O (pristup 2026-07-04)
- [Porezna uprava — Validator eRačuna](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/validator-eracuna) — službena validacija eRačuna (pristup 2026-07-04)
- [MFIN/PU — Specifikacija osnovne uporabe eRačuna s proširenjima (HR CIUS)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/164) — HR pravila kategorija/oslobođenja (pristup 2026-07-04)
- [moj-eRačun — Klasifikacija proizvoda po djelatnostima (KPD)](https://portal.moj-eracun.hr/blog/klasifikacija-proizvoda-po-djelatnostima/) — NKD vs KPD, primjeri šifri (neslužbeno, pristup 2026-07-04)
</content>
</invoke>

---

## Dopuna (2026-07-04, faza 1 implementacije) — KPD 2025 preuzet i uočena promjena šifri

- **Službeni strojno čitljivi KPD 2025** postoji na [data.gov.hr, dataset `kpd-2025`](https://data.gov.hr/ckan/dataset/kpd-2025)
  (DZS/KLASUS, JSON, 5.828 zapisa; **3.359 potkategorija** razine 6). Uvezen u
  `backend/migrations/0003_kpd2025.sql` kao tablica `kpd_sifrarnik` — pretraga i validacija po stavci.
- ⚠️ **KPD 2025 je restrukturiran u odnosu na staru CPA 2.1 nomenklaturu:** primjeri poput
  `62.02.30` (korišteni u `05-*` §7 i FIRA referenci) **ne postoje** u KPD 2025 — IT savjetovanje
  je sada npr. `62.20.20` („Usluge savjetovanja o sustavima i softveru"). **Ne prenositi stare
  CPA šifre napamet** — uvijek validirati protiv službenog šifrarnika (naš servis to radi
  na unosu proizvoda).
- Format u šifrarniku: **s točkama** (`NN.NN.NN`), kako ga DZS objavljuje. Otvoreno pitanje
  formata u eRačun XML-u (s/bez točaka, v. R8 u `99-*`) ostaje za fazu 3.

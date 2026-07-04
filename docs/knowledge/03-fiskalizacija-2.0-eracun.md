# Fiskalizacija 2.0 / eRačun — obvezno e-fakturiranje (stanje na 2026-07-04)

> Domenski istraživački dokument za projekt `domovina-fiskal`.
> Datum izrade / provjere izvora: **2026-07-04**. Svi URL-ovi provjereni na taj dan.
> Prioritet izvora: Porezna uprava (porezna.gov.hr, porezna-uprava.gov.hr), FINA, Narodne novine,
> Ministarstvo financija/gospodarstva, EU. Blogovi/vendori korišteni samo za kontekst i eksplicitno označeni.

---

## 0. TL;DR — što je na snazi danas (2026-07-04)

- **Fiskalizacija 2.0** je već **u punoj primjeni prve faze**. Novi **Zakon o fiskalizaciji** objavljen je u **NN 89/2025 (13.06.2025.)**, na snazi od **01.09.2025.**, s dijelom odredbi od **01.01.2026.**
- Od **01.01.2026.**:
  - **Obveznici PDV-a** (sjedište u RH) **izdaju i zaprimaju** eRačune u B2B i B2G.
  - **Ne-PDV obveznici** (dohodak/dobit izvan sustava PDV-a) **obvezni su zaprimati** eRačune (izdavanje tek od 2027.).
  - Svaki izdani/primljeni eRačun podliježe **fiskalizaciji eRačuna** (izdvajanje propisanog seta podataka i slanje Poreznoj) — **odvojeno** od same razmjene dokumenta.
  - **B2C** (krajnja potrošnja) proširuje se: fiskaliziraju se svi računi **neovisno o načinu plaćanja** (gotovina, kartica, transakcijski). B2C i dalje ima **ZKI + JIR + QR kod** (to je i dalje "fiskalizacija 1.0 logika", proširena).
- Od **01.01.2027.** (druga faza): ne-PDV obveznici koji su 2026. samo zaprimali eRačune **počinju ih i izdavati**.
- **eIzvještavanje** (e-reporting) je u tijeku: podaci o naplati eRačuna dostavljaju se **do 20. u mjesecu** za prethodni mjesec.
- **34 informacijska posrednika** s potvrdom o sukladnosti (na popis PU, ažurirano tijekom 2026.).
- **Portal za testiranje sukladnosti** (`pts.porezna-uprava.hr`) radi; **Završno testiranje** za Pristupne točke obvezno **od 01.09.2025.**

> ⚠️ **Napomena o preciznosti datuma pojedinih "ažurirano" stranica**: naslovi stranica Porezne uprave nose datume ažuriranja (npr. "Ažurirano 5.6.2026."). Sadržaj se mijenja; za produkcijsku implementaciju uvijek povuci **najnoviju verziju tehničke specifikacije** iz service-kataloga PU (vidi §7 i Izvore).

---

## 1. Što je projekt "Fiskalizacija 2.0"

Fiskalizacija 2.0 je proširenje postojećeg sustava fiskalizacije (koji je do sada pokrivao samo gotovinske/B2C račune — "Fiskalizacija 1.0") na **cjelokupni promet računa** poreznih obveznika, uz uvođenje **obveznog strukturiranog eRačuna** i **e-izvještavanja u (blizu) realnom vremenu**.

Zakon uvodi **jedinstveni porezno-pravni okvir** za tri segmenta ([narodne-novine NN 89/2025](https://narodne-novine.nn.hr/eli/sluzbeni/2025/89/1233/pdf), [RRiF](https://www.rrif.hr/objavljen_je_novi_zakon_o_fiskalizaciji-2439-vijest/)):

| Segment | Opis | Što se događa u F2.0 |
|---|---|---|
| **B2C** (business-to-consumer) | računi krajnjim potrošačima (građanima) | fiskalizacija svih računa **neovisno o načinu plaćanja**; račun i dalje nosi **JIR, ZKI, QR** |
| **B2B** (business-to-business) | računi između poreznih obveznika | **obvezni eRačun** (EN 16931) + **fiskalizacija eRačuna** + **eIzvještavanje** |
| **B2G** (business-to-government) | računi prema javnim tijelima | eRačun (već obvezan od 2019. po Direktivi 2014/55/EU) + fiskalizacija |

Ključna razlika prema **Fiskalizaciji 1.0**: 1.0 je fiskalizirala **naplatni događaj na blagajni** (gotovina/kartica) uz ZKI/JIR na samom računu. 2.0 dodatno fiskalizira **strukturirani eRačun** kao **odvojeni proces izdvajanja podataka** — sam eRačun **NE sadrži JIR/ZKI/QR** (za razliku od B2C računa). Vidi §9.

**Definicija fiskalizacije eRačuna (PU):** "automatizirani proces (programsko rješenje) kojim se iz izdanog i zaprimljenog eRačuna izdvaja propisani set podataka" koji se dostavlja Poreznoj upravi. Porezna uprava **ne stavlja ovjeru** na sam eRačun ([porezna-uprava.gov.hr — Fiskalizacija eRačuna](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-azurirano-17-4-2026/8049)).

### Rokovi fiskalizacije eRačuna
- **Izdavatelj**: fiskalizira **prilikom izdavanja** eRačuna (kod samoizdavanja — najkasnije **5 radnih dana** nakon izdavanja).
- **Primatelj**: fiskalizira zaprimljeni eRačun najkasnije **5 radnih dana od primitka**.

---

## 2. Rokovi i faze (PROVJERENO)

| Datum | Događaj |
|---|---|
| **13.06.2025.** | Objava novog Zakona o fiskalizaciji — **NN 89/2025** |
| **01.09.2025.** | Zakon stupa na snagu; **obveza Završnog testiranja** za Pristupne točke |
| **31.12.2025.** | Rok: odabrati informacijskog posrednika i prijaviti ga u ePorezna/FiskAplikaciji; primatelji prijavljuju **adresu za zaprimanje** u Adresar (AMS) |
| **01.01.2026.** | **1. faza**: PDV-obveznici **izdaju + zaprimaju** eRačun; ne-PDV obveznici **zaprimaju**; fiskalizacija eRačuna; **B2C** proširena na sve načine plaćanja |
| **20. u mjesecu** | eIzvještavanje: podaci o naplati eRačuna iz prethodnog mjeseca |
| **01.01.2027.** | **2. faza**: ne-PDV obveznici (koji su 2026. samo zaprimali) **počinju izdavati** eRačune |

Izvori: [porezna.gov.hr — bezgotovinski računi](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni), [Vodič kroz Fiskalizaciju 2.0](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149), [expertise.hr](https://expertise.hr/fiskalizacija-2-0-kljucne-promjene-rokovi-i-obveze-za-eracune-od-2026/) (vendor, kontekst).

> ⚠️ **Ne miješati** dva različita "01.01.2027." tumačenja koja kruže po vendor-blogovima. Točno je: **PDV obveznici izdaju od 2026.**; **ne-PDV obveznici izdaju od 2027.** (a zaprimaju već od 2026.).

---

## 3. Model razmjene — 4-corner, Pristupne točke, AS4, MPS/Adresar

Hrvatska koristi **4-corner model** (kao Peppol), s domaćim **metapodatkovnim servisima** umjesto (ili uz) Peppol SML/SMP:

```
Kupac (A) ── Pristupna točka kupca (B) ══ AS4 ══ Pristupna točka prodavatelja (C) ── Prodavatelj (D)
   (D izdaje) → PT prodavatelja (C) → AS4 → PT kupca (B) → kupac (A)
                          │                         │
                    fiskalizacija             fiskalizacija
                    (izdvajanje)              (izdvajanje)
                          ▼                         ▼
                 ┌──────────────────────────────────────┐
                 │   Porezna uprava (Sustav fiskalizacije) │
                 └──────────────────────────────────────┘
```

Ključni pojmovi ([porezna-uprava.gov.hr — Fiskalizacija eRačuna](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-azurirano-17-4-2026/8049), [fiskalizacija2.hr — pristupna točka](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/pristupna-tocka-i-informacijski-posrednik/)):

- **Pristupna točka (PT / Access Point)** — tehnički čvor koji razmjenjuje eRačune preko **AS4 profila** (isti transportni sloj kao Peppol eDelivery AS4).
- **Informacijski posrednik** — pravna/fizička osoba s OIB-om koja **uslužno** pruža izdavanje/zaprimanje eRačuna, fiskalizaciju, te opcionalno **eIzvještavanje** i **metapodatkovne servise (MPS)**.
- **Metapodatkovni servis (MPS)** i **Adresar metapodatkovnih servisa (AMS)** — domaći "SMP/SML" ekvivalent: gdje se objavljuje **adresa za zaprimanje** primatelja (na temelju OIB-a), koje formate i profile podržava. Primatelj mora prijaviti adresu u AMS do 31.12.2025.
- **Peppol** — Hrvatska **integrira Peppol za prekograničnu** razmjenu ([EU eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia)). Za domaći promet koristi se domaći adresar/MPS.

> ⚠️ **Nesigurno / za dodatnu provjeru u tehničkoj specifikaciji**: točan odnos domaćeg MPS/AMS-a prema Peppol SMP-u i je li domaća razmjena obavezno preko Peppol-a ili preko domaćeg adresara. EU stranica navodi centralizirani model "Servis eRačun za državu" (FINA) + Peppol za prekogranično; PU dokumentacija govori o domaćem AMS/MPS-u. Ne izmišljaj — povuci **"Tehnički standardi – Adresar metapodatkovnih servisa (AMS)"** i **"Metapodatkovni servis (MPS)"** dokumente iz PU kataloga (§7).

---

## 4. Norme i sintakse — EN 16931, UBL 2.1 / CII, HR CIUS

- Semantička norma: **HRN EN 16931-1:2020** (Elektronički račun — semantički model osnovnih elemenata).
- Sintakse: **UBL 2.1** i **UN/CEFACT CII**. U praksi **prevladava UBL 2.1** (validacija Schematronom vezana je uz UBL) ([EU eInvoicing](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia)).
- **Hrvatski CIUS + ekstenzije**: "Specifikacija osnovne uporabe eRačuna s proširenjima" (nacionalni **CIUS** + **ext** za obveznu uporabu i fiskalizaciju).

**Customization ID (identifikator specifikacije)** za UBL dokumente po HR specifikaciji ([fiskalizacija2.hr — tehnička specifikacija](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/), potvrđeno preko PU dokumentacije):

```
urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0
```

Primjer UBL 2.1 zaglavlja (ilustrativno — točan sadržaj polja provjeriti u CIUS-u):

```xml
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0</cbc:CustomizationID>
  <cbc:ProfileID>...</cbc:ProfileID>
  <cbc:ID>2026-0001</cbc:ID>
  <cbc:IssueDate>2026-07-04</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <!-- ... AccountingSupplierParty (OIB izdavatelja), AccountingCustomerParty (OIB primatelja) ... -->
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity unitCode="H87">2</cbc:InvoicedQuantity> <!-- UN/ECE Rec 20 jedinica -->
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Usluga X</cbc:Name>
      <!-- KPD šifra (6-znamenkasta) kao klasifikacija stavke -->
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="...">62.01.11</cbc:ItemClassificationCode>
      </cac:CommodityClassification>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">50.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>
```

> ⚠️ Točan `listID` / mjesto **KPD** koda i sintaksa jedinica (`unitCode` po UN/ECE Rec 20) MORAJU se preuzeti iz aktualnog CIUS-a — gornje je ilustrativno. Ne kodirati protiv ovog primjera bez validacije Validatorom (§7).

### Obvezna polja fiskalizacijske poruke (izdvojeni set za PU)
Iz eRačuna se za fiskalizaciju izdvaja i šalje ([fiskalizacija2.hr](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/)):
- **OIB izdavatelja i primatelja**
- **Datum/vrijeme** i **broj računa**
- **Iznos** (i porezne osnovice)
- **Oznaka načina plaćanja**
- **KPD kod** (statistička klasifikacija proizvoda/usluge)

> Detaljna shema fiskalizacijske poruke (nazivi elemenata, potpis, format) je u **"Tehnička specifikacija Fiskalizacija eRačuna i eIzvještavanje"** (PU). Ne izmišljati imena elemenata.

### Potpisivanje i transport
- eRačun se **digitalno potpisuje** kvalificiranim certifikatom pružatelja usluga povjerenja (**FINA**, **AKD**).
- Transport: **AS4 profil** (eDelivery). Primjenjuju se **kvalificirani vremenski žigovi** za integritet i dokaz vremena (izvor: [fiskalizacija2.hr](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/) — vendor-glosar; potvrditi točan profil u PU "Pristupna točka i AS4 profil" dokumentu).

---

## 5. Besplatne aplikacije Porezne uprave

Postoje **dvije** različite besplatne aplikacije (često se brkaju):

### FiskAplikacija (upravljanje/uvid)
Besplatni alat PU dostupan kroz **ePorezna**. Služi za:
- **prijavu/upravljanje informacijskim posrednikom** i ovlaštenjima (dodjela ovlasti posredniku da zaprima eRačune u tvoje ime),
- **uvid u fiskalizirane podatke** (izdani/primljeni),
- praćenje **statusa** računa (naplata, odbijanje),
- pomoć pri obračunu/prijavi PDV-a.

Novije verzije (2026.) donose UX poboljšanja ([porezna-uprava.gov.hr](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-azurirano-17-4-2026/8049)).

### MIKROeRAČUN (besplatno izdavanje/zaprimanje za male)
Besplatna aplikacija PU za **male porezne obveznike** (primarno **izvan sustava PDV-a**). Dostupna kroz ePorezna.
- **U 2026.**: kroz nju se može **samo ZAPRIMATI** eRačune (i fiskalizirati primitak). Vizualizacija primljenih eRačuna uključuje i **2D barkod za plaćanje**.
- **Od 2027.**: omogućuje i **izdavanje** eRačuna.

Izvori: [Vodič kroz Fiskalizaciju 2.0](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149), [porezna.gov.hr — eRačun](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun).

> ⚠️ Naziv "FiskApplication" iz zadatka je engleska/kolokvijalna varijanta — **službeni naziv je "FiskAplikacija"**. "eRačun za male" nije službeni naziv; službeni je **MIKROeRAČUN**.

---

## 6. Registar informacijskih posrednika

- Službeni **Popis informacijskih posrednika kojima je izdana potvrda o sukladnosti** objavljuje PU na Javnom portalu:
  **https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019**
- Na dan provjere na popisu je **34 posrednika** (broj raste; provjeri aktualno).
- Poznati: **FINA** (Fina e-Račun B2B/B2G), **Moj-eRačun / mer** (Elektronički računi d.o.o.), te niz drugih (npr. Redok, PostLink/Sveračun, DB informatika).
- Usluge koje posrednik može pružati (naznačeno u popisu po posredniku):
  1. **eRačun + fiskalizacija** (izdavanje, zaprimanje, fiskalizacija),
  2. **eIzvještavanje**,
  3. **MPS** (metapodatkovni servisi).

Postoji i **paralelni popis Ministarstva gospodarstva** (posrednici povezani na centralnu platformu za B2G e-račun): [mingo.gov.hr](https://mingo.gov.hr/djelokrug/uprava-za-trgovinu-i-politiku-javne-nabave/digitalno-gospodarstvo/e-racun-7014/popis-informacijskih-posrednika-koji-su-povezani-na-centralnu-platformu-i-uskladjeni-s-normom-za-e-racun/7017).

Izvor: [porezna.gov.hr — objavljeni prvi posrednici](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/fiskalizacija-informacijski-posrednici).

---

## 7. Testno okruženje i certifikacija posrednika (KORACI za autora)

### Portal za testiranje sukladnosti (PTS)
- URL aplikacije: **https://pts.porezna-uprava.hr/**
- Pristup preko: **https://e-porezna.porezna-uprava.hr/** (ePorezna)
- Testira se: **razmjena eRačuna**, **fiskalizacija**, **MPS**.
- **Obveza Završnog testiranja** za sve buduće operatore **Pristupnih točaka** primjenjuje se **od 01.09.2025.** (po Zakonu o fiskalizaciji).

Izvor: [porezna.gov.hr — pokrenut Portal za testiranje](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/pokrenut-portal-za-testiranje).

### Koraci za pristup testiranju (kako je opisala PU)
1. **Administrator** tvrtke prijavi se na **ePorezna**.
2. U ePorezna upravlja korisnicima i dodijeli ulogu **Testera**.
3. **Tester** zaprimi **email s poveznicom** za prijavu na PTS.
4. Tester u PTS-u izvodi testne scenarije (razmjena / fiskalizacija / MPS). Tehnička dokumentacija svih metoda dostupna je unutar aplikacije te u **"Organizacija i operativne procedure – Portal za testiranje sukladnosti"**.
5. Za status **Pristupne točke / posrednika** potrebno je **uspješno proći Završno testiranje** → PU izdaje **potvrdu o sukladnosti** → upis na **Popis informacijskih posrednika**.

> Praktični put za autora (open-source servis): registrirati se kao obveznik/tester u ePorezna, dobiti FINA/AKD certifikat, dohvatiti tehničku dokumentaciju iz PU service-kataloga, implementirati AS4 + UBL 2.1 (HR CIUS) + fiskalizacijsku poruku, validirati **Validatorom eRačuna**, proći scenarije na PTS-u. Ako je cilj samo **izdavati/zaprimati preko postojećeg posrednika** (a ne biti PT), dovoljno je ugovoriti posrednika i koristiti njegov API (usp. FIRA/Moj-eRačun model) — bez vlastite certifikacije PT-a.

### Validator eRačuna
PU nudi **Validator eRačuna** za provjeru sukladnosti UBL dokumenta s HR CIUS-om (Schematron). Vidi [porezna.gov.hr — Validator eRačuna](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/validator-eracuna).

### Katalog tehničke dokumentacije (PU)
Glavni dokumenti (nazivi; ažurne verzije/URL-ovi u PU service-katalogu — dokumenti se povlače kao `porezna.gov.hr/fiskalizacija/api/dokumenti/{id}`):
1. **Tehnička specifikacija Fiskalizacija eRačuna i eIzvještavanje**
2. **Tehnički standardi – Adresar metapodatkovnih servisa (AMS)**
3. **Tehnički standardi – Metapodatkovni servis (MPS)**
4. **Tehnički standardi – Pristupna točka i AS4 profil**
5. **Organizacija i operativne procedure – Portal za testiranje sukladnosti** (`.../api/dokumenti/105`)
6. **Specifikacija osnovne uporabe eRačuna s proširenjima (CIUS)** (`.../api/dokumenti/99`)

Kontekstni PDF (fiskalizacija2.hr, vendor-mirror): [Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf).

Izvor liste: [porezna.gov.hr — tehničke specifikacije](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/tehnicke-specifikacije).

> ⚠️ **ID-jevi dokumenata** (99, 105, …) su stabilni pointeri, ali **verzije se mijenjaju**. Uvijek dohvati najnoviju. Ne izmišljati brojeve verzija; provjeriti u aplikaciji.

---

## 8. eIzvještavanje (e-reporting) — razlika prema 1.0

eIzvještavanje je **novi sloj** kojeg 1.0 nije imala. Uz fiskalizaciju svakog eRačuna, obveznik periodički izvještava o **poslovnim događajima** oko računa ([porezna-uprava.gov.hr — Izvještajni sustav](https://porezna-uprava.gov.hr/hr/izvjestajni-sustav/8051)):

**Tko i što:**
- **Izdavatelj** izvještava o:
  - **naplati** izdanih eRačuna (za sve naplaćene, neovisno o vremenu izdavanja; uključivo neoporezive usluge — radi praćenja rokova plaćanja),
  - računima gdje **nije bilo moguće izdati eRačun** jer adresa primatelja nije u sustavu.
- **Primatelj** izvještava o **odbijanju** zaprimljenog eRačuna (uz razlog). Dostavom podatka o odbijanju primatelj **ne koristi pravo na pretporez**.

**Sadržaj izvještaja:** datum izdavanja i broj eRačuna; OIB-i izdavatelja i primatelja; iznos i način plaćanja; datum naplate/odbijanja; razlog odbijanja (ako postoji).

**Rok:** podaci o naplati iz prethodnog mjeseca — **do 20. u tekućem mjesecu** (npr. naplate 1.–31.3. → do 20.4.).

**Kanali dostave:** web-servis, informacijski posrednik, ili **FiskAplikacija**.

> **Razlika 1.0 → 2.0**: 1.0 = jedan fiskalni zapis po računu na blagajni (ZKI/JIR). 2.0 = (a) fiskalizacija strukturiranog eRačuna kod izdavatelja i primatelja + (b) periodično **eIzvještavanje o naplati/odbijanju** → PU dobiva **potpuniju sliku** i cross-verifikaciju obiju strana u (blizu) realnom vremenu.

---

## 9. B2C i odnos prema Fiskalizaciji 1.0 (ZKI/JIR — ostaje!)

**B2C ostaje na "1.0 logici", ali proširenoj** ([porezna-uprava.gov.hr — B2C](https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje-azurirano-5-1-2026/8033)):

- Fiskalizacija B2C računa je **obvezna neovisno o načinu plaćanja** (gotovina, kartica, **transakcijski** — novo od 2026.; ranije samo gotovina/kartica).
- B2C račun i dalje mora sadržavati:
  - **JIR** (Jedinstveni identifikator računa — vraća PU),
  - **ZKI** (Zaštitni kod izdavatelja — generira izdavatelj),
  - **QR kod** (novi obvezni element),
  - vrijeme izdavanja (sat/minuta), oznaku operatera, način plaćanja.
- Iznimke iz **čl. 4. Zakona** (npr. komunalne, osiguranje, javne komunikacijske usluge) i dalje vrijede; OPG-ovi zadržavaju dio oslobođenja.

**Ključna razlika B2B vs B2C u pogledu ZKI/JIR:**

| | B2C (krajnja potrošnja) | B2B/B2G (eRačun) |
|---|---|---|
| Nositelj fiskalizacije | naplatni uređaj / blagajna | eRačun (izdvajanje podataka) |
| ZKI na dokumentu | **DA** | **NE** |
| JIR na dokumentu | **DA** | **NE** |
| QR kod na dokumentu | **DA** (novo) | **NE** |
| Fiskalizacija | u trenutku izdavanja/naplate | odvojen proces (izdavatelj + primatelj) |

> **Za implementaciju**: fiskalizacija eRačuna **NIJE** isto što i stara CIS SOAP fiskalizacija računa. eRačun se **NE** potpisuje ZKI-jem niti dobiva JIR. Stari **ZKI algoritam** (RSA-SHA1 potpis konkateniranih polja + MD5 hex) i **CIS SOAP** ostaju relevantni **samo za B2C** (fiskalizacija 1.0 dio). Vidi `docs/knowledge/02-*` za ZKI/JIR algoritam i `docs/reference/lokalni-artefakti.md`.

Izvori: [porezna-uprava.gov.hr — B2C](https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje-azurirano-5-1-2026/8033), [Pitanja i odgovori (PU)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/83).

---

## 10. KPD — Klasifikacija proizvoda po djelatnostima

- Obveznici moraju povezati robu/usluge s nacionalnom klasifikacijom **KPD 2025** (šifra na razini stavke eRačuna).
- Pretraga/uvid: aplikacija **KLASUS** (DZS). Vidi i internu bilješku o KPD-u u `docs/knowledge/06-*` (referencirano u `fira-custom-webshop-api.md`).

> ⚠️ Točan broj znamenki i `listID` za KPD u UBL-u provjeriti u CIUS-u. U vendor-izvorima spominje se "6-znamenkasti" kod; ne fiksirati bez potvrde iz CIUS-a.

---

## 11. Implikacije za `domovina-fiskal` (open-source servis)

- Naš API dizajn (payload = kupac + stavke + tip; sve o izdavatelju server-side, vezano uz API ključ/tenant) je **kompatibilan** s F2.0 modelom — mi smo "aplikacijski sloj" iznad posrednika/PT-a (usp. FIRA model, `docs/reference/fira-custom-webshop-api.md`).
- **Dvije integracijske opcije:**
  1. **Preko posrednika** (npr. FINA / Moj-eRačun API) — brže, bez vlastite PT certifikacije.
  2. **Vlastita Pristupna točka** — zahtijeva AS4, UBL 2.1 (HR CIUS), fiskalizacijsku poruku, MPS/AMS, i **Završno testiranje na PTS-u** + potvrdu o sukladnosti.
- **Runtime izazov** (Cloudflare Workers): AS4/XML-DSIG i mTLS. Za B2C (CIS SOAP, ZKI RSA-SHA1) vrijedi ista dilema kao u `docs/knowledge/11-*` (Worker vs Node signing sidecar). WebCrypto na Workers podržava RSA/SHA, ali AS4 (ebMS3) i XAdES potpis su netrivijalni — vjerojatno **Node sidecar** ili integracija preko posrednika.
- **KPD + jedinice**: naš model već nosi `kpdCode` po stavci (usp. FIRA) — dobro. Dodati validaciju KPD-a i UN/ECE Rec 20 `unitCode`.
- **Unicode**: koristiti `utf8mb4`/pun Unicode svugdje (naučena lekcija iz FIRA integracije).

---

## Izvori

- [porezna-uprava.gov.hr — Fiskalizacija eRačuna (Ažurirano 17.4.2026.)](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-azurirano-17-4-2026/8049) — definicija fiskalizacije eRačuna, rokovi (5 rad. dana), 4-corner, norme, testno okruženje (pristup 2026-07-04)
- [porezna.gov.hr — Fiskalizacija 2.0 / bezgotovinski računi](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni) — glavni PU rubrikat, dokumenti, KPD, FiskAplikacija (pristup 2026-07-04)
- [porezna.gov.hr — eRačun (koraci: KPD, posrednik, ovlaštenje, AMS)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun) — 5 koraka pripreme, KLASUS, AMS rok 31.12.2025. (pristup 2026-07-04)
- [porezna-uprava.gov.hr — Vodič kroz Fiskalizaciju 2.0 (8149)](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149) — faze 2026/2027, MIKROeRAČUN, FiskAplikacija, 4 koraka procesa (pristup 2026-07-04)
- [porezna-uprava.gov.hr — Fiskalizacija računa u krajnjoj potrošnji B2C (8033)](https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje-azurirano-5-1-2026/8033) — B2C: JIR/ZKI/QR, svi načini plaćanja, iznimke čl.4 (pristup 2026-07-04)
- [porezna-uprava.gov.hr — Izvještajni sustav / eIzvještavanje (8051)](https://porezna-uprava.gov.hr/hr/izvjestajni-sustav/8051) — tko/što/kada izvještava, rok do 20., naplata, odbijanje (pristup 2026-07-04)
- [porezna-uprava.gov.hr — Popis informacijskih posrednika (8019)](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019) — službeni registar (34 posrednika) (pristup 2026-07-04)
- [porezna.gov.hr — Objavljeni prvi informacijski posrednici](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/fiskalizacija-informacijski-posrednici) — definicija posrednika, usluge (pristup 2026-07-04)
- [porezna.gov.hr — Pokrenut Portal za testiranje sukladnosti](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/pokrenut-portal-za-testiranje) — PTS URL, tester uloga, Završno testiranje od 01.09.2025. (pristup 2026-07-04)
- [porezna.gov.hr — Tehničke specifikacije (lista 6 dokumenata)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/tehnicke-specifikacije) — CIUS, AMS, MPS, AS4, PTS (pristup 2026-07-04)
- [porezna.gov.hr — Validator eRačuna](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/validator-eracuna) — Schematron validacija HR CIUS (pristup 2026-07-04)
- [porezna.gov.hr/fiskalizacija/api/dokumenti/99](https://porezna.gov.hr/fiskalizacija/api/dokumenti/99) — Specifikacija osnovne uporabe eRačuna s proširenjima (CIUS) (pristup 2026-07-04)
- [porezna.gov.hr/fiskalizacija/api/dokumenti/105](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105) — Organizacija i operativne procedure – Portal za testiranje (pristup 2026-07-04)
- [porezna.gov.hr/fiskalizacija/api/dokumenti/83](https://porezna.gov.hr/fiskalizacija/api/dokumenti/83) — Pitanja i odgovori uz Zakon o fiskalizaciji (pristup 2026-07-04)
- [narodne-novine.nn.hr — NN 89/2025, str. 45 (Zakon o fiskalizaciji)](https://narodne-novine.nn.hr/eli/sluzbeni/2025/89/1233/pdf) — primarni pravni izvor (pristup 2026-07-04)
- [zakon.hr — Zakon o fiskalizaciji (pročišćeno)](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — konsolidirani tekst (pristup 2026-07-04)
- [ec.europa.eu — eInvoicing in Croatia (EU DIGITAL)](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia) — EU perspektiva, Peppol, UBL/CII, EN 16931 (pristup 2026-07-04)
- [mingo.gov.hr — Popis posrednika na centralnoj platformi (B2G)](https://mingo.gov.hr/djelokrug/uprava-za-trgovinu-i-politiku-javne-nabave/digitalno-gospodarstvo/e-racun-7014/popis-informacijskih-posrednika-koji-su-povezani-na-centralnu-platformu-i-uskladjeni-s-normom-za-e-racun/7017) — B2G popis (pristup 2026-07-04)
- [fina.hr — Fina rješenje za Fiskalizaciju 2.0](https://www.fina.hr/novosti/fina-spremna-poduzetnicima-ponuditi-sveobuhvatno-rjesenje-za-fiskalizaciju-2.0) — FINA kao posrednik/PT (pristup 2026-07-04)
- [fiskalizacija2.hr — Tehnička specifikacija eRačuna (glosar)](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/) — *vendor/edukativni izvor*: customization ID, sadržaj fiskalne poruke, AS4, potpis (pristup 2026-07-04)
- [fiskalizacija2.hr — Tehnička specifikacija (PDF mirror)](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf) — *vendor mirror* PU dokumenta (pristup 2026-07-04)
- [rrif.hr — Objavljen novi Zakon o fiskalizaciji](https://www.rrif.hr/objavljen_je_novi_zakon_o_fiskalizaciji-2439-vijest/) — *stručni portal*: NN 89/25, segmenti B2C/B2B/B2G (pristup 2026-07-04)
- [teb.hr — eIzvještavanje u Fiskalizaciji 2.0](https://www.teb.hr/novosti/2026/eizvjestavanje-u-fiskalizaciji-20-tko-sto-kada-i-kako/) — *stručni portal*: tko/što/kada/kako (pristup 2026-07-04)

> Napomena: `porezna.gov.hr` i `porezna-uprava.gov.hr` su oba službeni PU hostovi (novi portal + stariji/arhivski). Sadržaj se preslikava; za tehničke dokumente autoritativan je `porezna.gov.hr/fiskalizacija` service-katalog.

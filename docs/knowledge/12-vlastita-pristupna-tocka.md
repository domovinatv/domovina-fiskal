# 12 — Vlastita pristupna točka / informacijski posrednik (direktno spajanje na sustav ePorezna, Fiskalizacija 2.0)

> Stanje / provjera izvora: **2026-07-04**. Svi URL-ovi i tehnički navodi provjereni na taj dan.
> Prioritet izvora: **Porezna uprava** (porezna.gov.hr/fiskalizacija — tehnički katalog), **Narodne novine / zakon.hr**
> (Zakon o fiskalizaciji NN 89/2025), **EU DIGIT / CEF eDelivery**. Vendor/edukativni izvori označeni eksplicitno.
>
> Cilj dokumenta: precizno opisati ŠTO SVE treba da `domovina-fiskal` postane **vlastita pristupna točka (PT)**
> i/ili **registrirani informacijski posrednik (IP)** koji se DIREKTNO spaja na hrvatski sustav razmjene i
> fiskalizacije eRačuna — **bez** oslanjanja na trećeg posrednika (za razliku od FIRA-e koja ide preko
> ePoslovanje/Pondi). Vidi i `03-fiskalizacija-2.0-eracun.md` (opći okvir) i `08-postojece-implementacije.md`
> (open-source uzori).

---

## 0. TL;DR — što stvarno treba

Postoje **dvije razine ambicije**, pravno i tehnički različite:

1. **PT za vlastite potrebe** ("radim sam za sebe") — gradim AS4 pristupnu točku + MPS + fiskalizaciju SAMO
   za vlastiti promet (svoj OIB / svoje tenante ako sam ja izdavatelj). **NE** primjenjuju se pravila o
   informacijskom posredništvu, **NE** predaje se dokumentacija iz čl. 61, ali se **MORA** proći **Završno
   testiranje** na PTS-u za scenarije koje koristim. Nakon toga smijem objavljivati svoje podatke u AMS preko MPS-a.
2. **Informacijski posrednik (IP)** — pružam uslugu razmjene/fiskalizacije/MPS **drugima** (našim korisnicima).
   Ovdje na mene padaju **sve** obveze iz Zakona: dokumentacija čl. 61, status **ključnog subjekta** po Zakonu o
   kibernetičkoj sigurnosti, **ISO/IEC 27001**, Završno testiranje, **potvrda o sukladnosti**, upis na **Popis
   informacijskih posrednika**, trajne obveze (obnova ISO-a). Ovo je ono što FINA/MeR/Pondi jesu.

Tehnički stog je **isti** za obje razine; razlikuje se opseg testiranja i pravno-administrativni teret.
Ključni tehnički zaključci (iz službenih PU specifikacija):

- **Transport = CEF eDelivery AS4 v1.15**, profiliran u hrvatski profil **`eRačun-AS4`** (One-Way/Push, SOAP 1.2
  s privitcima, WS-Security 1.1, **XAdES potpis, BEZ enkripcije poruke**, RSA-SHA256, gzip, reception awareness).
- PU **eksplicitno preporučuje** i dokumentira **Domibus** (EU DIGIT) kao gotovu AS4 PT i **DomiSMP** kao MPS —
  s gotovim P-mode primjerima u samoj specifikaciji.
- **Otkrivanje adrese (discovery)** = domaći ekvivalent Peppol SML/SMP, ali na **eDelivery BDXL 1.6**:
  **AMS** = DNS **U-NAPTR** servis PU (`ams.porezna-uprava.hr`), **MPS** = REST **SMP** (OASIS BDXR SMP 2016/05)
  koji drži svaka PT/IP. **Peppol NIJE potreban za domaći promet** — Peppol samo za prekogranično (FINA je AP).
- **Certifikati**: kvalificirani **X.509** od izdavatelja s **hrvatske liste povjerenja** (FINA/AKD), s **OIB-om**
  PT/MPS-a u atributu. Isti tip za AS4 potpis, MPS/AMS klijentsku autentikaciju (two-way SSL) i MPS TLS (EV).
- **Fiskalizacija eRačuna + eIzvještavanje** je **odvojen** kanal prema CIS-u PU (poruke `evidentiraj*`), neovisan
  o samoj razmjeni — vidi §2.4 i `08-postojece-implementacije.md` (shunkica/fiskalizacija2-js kao uzor).

**Preporuka (detaljno u §9): fazni pristup.** Faza 1 = ostati aplikacijski sloj iznad postojećeg IP-a (brzo na
tržište). Faza 2 = vlastita PT "za sebe" (Domibus + DomiSMP + fiskalni klijent), tek onda razmisliti o punom
statusu IP-a ako poslovni model to traži.

---

## 1. PRAVNI / ADMINISTRATIVNI dio (Zakon o fiskalizaciji, NN 89/2025)

Djelatnost informacijskog posrednika uređena je **Zakonom o fiskalizaciji (NN 89/2025)**, čl. **59–62**
(informacijski posrednici, testiranje, dokumentacija, praćenje uvjeta).

### 1.1. Tko se može registrirati
Informacijski posrednik je **pravna ili fizička osoba (obrt) s OIB-om**. Zakon **ne propisuje** poseban temeljni
kapital, koncesiju ni članstvo u nekoj komori. Ključno je da subjekt **tehnički zadovolji** (Završno testiranje)
i **dokumentacijski zadovolji** (čl. 61) te da posluje sukladno sigurnosnim zahtjevima. Dakle: nema kapitalnog
praga, ali postoji **visok compliance-prag** (ISO 27001 + kibernetička sigurnost + testiranje).

### 1.2. Uvjeti za obavljanje poslova (čl. 59)
Osoba smije obavljati poslove IP-a ako kumulativno:
1. **dostavi propisanu dokumentaciju** (čl. 61),
2. **uspješno provede testiranje sukladnosti** (Završno testiranje na PTS-u, čl. 60),
3. **dobije potvrdu o sukladnosti** od Porezne uprave.

Tek nakon potvrde subjekt se **objavljuje na Popisu informacijskih posrednika** s naznakom **opsega usluga**
(razmjena eRačuna / fiskalizacija / eIzvještavanje / MPS).

### 1.3. Obavezna dokumentacija (čl. 61)
IP prilikom prijave (učitava se kroz PTS / administratorsko sučelje) predaje:
1. **Dokument o sigurnosti osobnih podataka** — detaljno navedena sredstva za osiguranje sigurnosti osobnih
   podataka sukladno **čl. 32. Uredbe (EU) 2016/679 (GDPR)**.
2. **Važeći certifikat ISO/IEC 27001** — najnovija verzija u trenutku podnošenja.
3. **Izjava o obradi podataka unutar EU** — da se sustavima upravlja bez prijenosa podataka izvan EU.
4. **Izjava o opsegu usluga** — koje vrste usluga posrednik pruža (razmjena / fiskalizacija / eIzvještavanje / MPS).

### 1.4. Kibernetička sigurnost — status "ključnog subjekta"
Radi najviših sigurnosnih standarda, informacijski posrednici se tretiraju kao **ključni subjekti** po
**Zakonu o kibernetičkoj sigurnosti** (hrvatska transpozicija **NIS2**). To povlači obveze upravljanja rizicima,
prijave incidenata i nadzora — netrivijalan trajni operativni i pravni teret (za `domovina-fiskal` kao mali tim
ovo je **najveća pojedinačna prepreka** punom statusu IP-a).

### 1.5. Testiranje sukladnosti (čl. 60)
Provodi se **isključivo** putem **Portala za testiranje sukladnosti (PTS)** — vidi §3.

### 1.6. Trajne obveze i brisanje s popisa (čl. 62)
- **Obnova ISO/IEC 27001**: novu verziju certifikata dostaviti PU najkasnije **60 dana** nakon isteka valjanosti.
- Ako IP ne obnovi ISO ili prestane ispunjavati bilo koji uvjet iz Zakona → PU ga **briše s Popisa** i **obavještava
  njegove korisnike** (koji tada moraju izabrati drugog posrednika). Popis se kontinuirano održava.

### 1.7. Dva paralelna "popisa" (ne miješati)
- **Popis informacijskih posrednika (Porezna uprava)** — za Fiskalizaciju 2.0 (B2B/B2C fiskalizacija eRačuna):
  https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019 (~34 posrednika na 2026-07-04).
- **Popis posrednika na centralnoj platformi (Ministarstvo gospodarstva)** — stariji **B2G** e-Račun režim
  (Direktiva 2014/55/EU). Za F2.0 mjerodavan je **popis PU**.

---

## 2. TEHNIČKI zahtjevi (iz službenih PU specifikacija)

Kompletan model razmjene definiran je s **tri** PU dokumenta koji se čitaju zajedno:
**AMS** (doc 142), **MPS** (doc 141), **Pristupna točka i AS4 profil** (doc 140). Fiskalizacija/eIzvještavanje je
zaseban dokument + CIS servis.

### 2.1. Model: 4-corner + AS4 + discovery (AMS→MPS)

```
                      ┌──────────────── SUSTAV PORezNE UPRAVE (PU) ────────────────┐
                      │  AMS (DNS U-NAPTR, BDXL 1.6)      CIS: Fiskalizacija +      │
                      │  ams.porezna-uprava.hr           eIzvještavanje (evidentiraj*) │
                      └───────▲───────────────────────────────▲────────────────────┘
                              │ (1) DNS upit: hash(OIB)              ▲ (F) fiskalna poruka
                              │     → URL MPS-a primatelja           │     XAdES potpis
        C1 Izdavatelj         │                                     │
        (naš korisnik)        │                                     │
             │ app/API        │            (2) REST GET MPS         │
             ▼                │           SignedServiceMetadata     │
  ┌──────────────────┐   AMS/ │  ┌──────────────────┐   ┌───────────┴─────┐
  │  C2  PT/IZDAVATELJ├───────┼─▶│  MPS primatelja  │   │  MPS izdavatelja │  (svaka PT ima svoj MPS/SMP)
  │  = domovina-fiskal│       │  │  (SMP primatelja)│   │  (= domovina-... )│
  │  Domibus AS4 GW   │       │  └──────────────────┘   └─────────────────┘
  └────────┬─────────┘        │           │ vraća EndpointURI + cert C3
           │ (3) AS4 Push (One-Way, SOAP 1.2, XAdES, gzip, port 443, mTLS)
           ▼
  ┌──────────────────┐        publish/update u AMS: MPS → ManageBusinessIdentifier (SOAP, two-way SSL)
  │  C3  PT PRIMATELJA│◀──── potvrda primitka: Signed Receipt (Non-Repudiation of Receipt)
  │  (drugi IP/PT)    │
  └────────┬─────────┘
           ▼
        C4 Primatelj (krajnji korisnik drugog posrednika)
```

Koraci (iz doc 140/141/142):
1. C2 (naša PT) ima **ID primatelja** (OIB). Ako ne zna krajnju adresu → **DNS upit AMS-u**.
2. AMS vraća **U-NAPTR** zapis s **URL-om MPS-a** kod kojeg je primatelj registriran.
3. C2 radi **REST GET** na MPS → dobiva **`SignedServiceMetadata`** s **`EndpointURI`** i **certifikatom** PT-a
   primatelja (C3).
4. C2 otvara **HTTPS/AS4** prema C3 (port 443, TLS ≥1.2), šalje eRačun zapakiran u **SBDH** unutar AS4 poruke.
5. C3 vraća **potpisanu potvrdu primitka** (ili ebMS grešku `EBMS:0004` s `ERACUN:NOT_SERVICED` /
   `ERACUN:VALIDATION_ERROR`).

### 2.2. AS4 profil `eRačun-AS4` (doc 140) — konkretni parametri
Baza: **CEF eDelivery AS4 Profile v1.15**, dodatno profilirano:

| Značajka | Vrijednost |
|---|---|
| Exchange pattern | **One-Way / Push** (jedini obavezni) |
| Transport | HTTP 1.1, **port 443**, TLS ≥ 1.2, valjan CA cert iz RH |
| Packaging | **SOAP 1.2 with attachments**; sve kao **MIME privitci**; **SBDH** obavezan (integralni, ne standalone) |
| Potpis | **WS-Security 1.1 + XAdES** (XML Signature), **RSA-SHA256**; **Binary Security Token** |
| Enkripcija | **NE koristi se** (nema XML Encryption na razini poruke) |
| Kompresija | **gzip** (`application/gzip`) |
| Pouzdanost | AS4 **Reception Awareness** + duplicate detection (maxsize 10 MB, checkwindow 7D) |
| Potvrda | **Signed Receipt** (Non-Repudiation of Receipt), replyPattern=Response |
| MPC | zadani: `http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/defaultMPC` |
| Agreement | `urn:fdc:eracun.hr:2023:agreements:ap_provider` (PMode.ID=`eRacun`) |
| Service | `urn:fdc:eracun.hr:poacc:en16931:any`, type `cenbii-procid-ubl` |
| Adresiranje | `From/To` = **PT-ovi** (Subject **CNAME** iz certifikata PT); C1/C4 preko atributa **`originalSender` / `finalRecipient`** |
| ID sheme | **ISO 6523**; OIB = shema **`9934`** (HR:VAT), GLN = **`0088`**; format `iso6523-actorid-upis::9934:<OIB>` |
| Action | npr. `en16931UblInvoiceAction` = `busdox-docid-qns::…Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0::2.1` |

Podržani tipovi dokumenta: **UBL 2.1 Invoice**, **UBL 2.1 CreditNote**, **UN/CEFACT CII Invoice (D16B)** — svi s
hrvatskim CustomizationID-om (`cius-2025:1.0` + `ext-2025:1.0`).

### 2.3. Discovery: AMS (doc 142) i MPS (doc 141)
**AMS** — centralni, drži PU; **DNS-bazirani** (U-NAPTR po RFC 2915, standard **eDelivery BDXL 1.6**):
- ID primatelja: kanonski oblik `9934:<OIB>` → **SHA-256** → **BASE32** (bez `=`) → `.iso6523-actorid-upis`
  → `.prod` ili `.demo` → `.ams.porezna-uprava.hr`.
- Upit: `dig @dns1.hitronet.hr <hash>.iso6523-actorid-upis.prod.ams.porezna-uprava.hr NAPTR`
- Odgovor (fiksni URL, prazan regex `!^.*$!`): npr. `IN NAPTR 100 10 "U" "ERACUN:meta" "!^.*$!https://…/eRacun-SMP!"`.
- **Sigurnost upravljačkog kanala**: two-way SSL; MPS se autenticira certifikatom s **OIB-om** MPS-a.

**MPS** — drži **svaka PT/IP** za svoje korisnike (naš je dio ako smo PT). Dvije uloge:
1. **Dohvat (REST SMP, OASIS BDXR SMP 2016/05)**: `GET /{scheme}::{id}/services/{docType}` → vraća
   **`SignedServiceMetadata`** (potpisan **XAdES**, `enveloped-signature`, RSA-SHA256/… — primjer u doc 141 koristi
   `rsa-sha256`/`sha256`; napomena: tekst spec-a spominje i sha1 za stariji profil — **provjeriti aktualnu verziju**).
   TLS **one-way**, MPS SSL cert mora imati **EV** svojstvo. Sadrži obavezan **`<ex:HRMPS>` Extension** s
   `ParticipantOIB` i `AccessPointOIB`. `transportProfile="eracun-transport-as4-v1_0"`.
2. **Objava/održavanje u AMS-u (SOAP `ManageBusinessIdentifier`)** — HTTP SOAP 1.1, two-way SSL:
   - **`Create()`** — registracija novog ID-a ili **migracija** (preuzimanje korisnika od drugog IP-a),
   - **`Delete()`** — brisanje ID-a,
   - **`List()`** — paginirani izlist svih ID-ova koje drži naš IP.
   - **Ne koriste se**: PrepareToMigrate, Migrate, CreateList, DeleteList.
   - Svaka registracija/promjena mora biti **potvrđena od poreznog obveznika** kroz **ePorezna/FiskAplikaciju**
     (osim brisanja — o njemu se korisnik samo obavještava). AMS pri `Create` sam radi `GET SignedServiceMetadata`
     prema našem MPS-u da izvuče OIB sudionika i OIB IP-a → naš MPS mora **imati podatke spremne prije poziva**.

### 2.4. Fiskalizacija eRačuna + eIzvještavanje (odvojeni kanal, CIS)
Neovisno o razmjeni, iz svakog izlaznog/ulaznog eRačuna izdvaja se propisani set podataka i šalje na **CIS servis
PU** kao potpisana poruka. Poruke (usp. `shunkica/fiskalizacija2-js`, `08-*`):
`evidentirajERacun`, `evidentirajIsporukuZaKojuNijeIzdanERacun`, `evidentirajNaplatu`, `evidentirajOdbijanje`.
Ovo je zaseban SOAP/CIS potpisni tok (ne AS4) i **ne** stavlja JIR/ZKI na eRačun. Detaljna shema: PU dokument
**"Tehnička specifikacija Fiskalizacija eRačuna i eIzvještavanje"**.

### 2.5. Certifikati — što nam treba
- **Kvalificirani X.509** (poslovni/aplikacijski certifikat) od pružatelja s **hrvatske liste povjerenja**
  (**FINA**, **AKD**), s **OIB-om** subjekta u atributu. Isti tip koristi se za:
  - AS4 **XAdES** potpis poruke (Binary Security Token),
  - **MPS→AMS** klijentsku autentikaciju (two-way SSL, OIB MPS-a u certu),
  - **MPS TLS** poslužitelj (EV cert),
  - potpis **`SignedServiceMetadata`** (XAdES).
- Za **B2C** (fiskalizacija 1.0 logika, ZKI RSA-SHA1 + JIR) i dalje vrijedi zaseban FINA aplikacijski certifikat —
  vidi `03-*` §9 i `02-*`.

### 2.6. Runtime posljedica za naš stog (Cloudflare Workers + Hono)
AS4/ebMS3 + XAdES + mTLS + SBDH je **težak** za čisti Worker runtime. Realno:
- **AS4 gateway = zaseban dugotrajni servis** (Domibus na JVM, ili phase4 embeddan u Java/Node-adjacent servis),
  ne Worker. Worker/Hono ostaje **aplikacijski/orkestracijski sloj** (UBL generiranje, API, tenant, queue).
- **Discovery (AMS DNS + MPS REST)** je lakši dio — DNS NAPTR upit + HTTPS GET; može i iz Node sidecara.
- **Fiskalni CIS potpis** (WebCrypto RSA-SHA256) izvediv na Workeru; XAdES enveloped je granično → vjerojatno
  Node signing sidecar (usp. `11-arhitektura-runtime.md`).

---

## 3. TESTIRANJE / CERTIFIKACIJA — Portal za testiranje sukladnosti (PTS)

- URL: **https://pts.porezna-uprava.hr/** ; pristup preko **ePorezna** (https://e-porezna.porezna-uprava.hr/).
- **Uloge** (doc 105):
  - **Administrator** — mora imati aktivan račun u **ePorezna**; bira **svrhu testiranja**, učitava **zakonsku
    dokumentaciju** (za IP-ove), upravlja testerima. Može ovlastiti drugu pravnu osobu kao administratora.
  - **Tester** — administrator ga kreira; dobiva **e-mail s poveznicom** za postavljanje lozinke (vremenski
    ograničeno); pristupa scenarijima. Nema administrativne funkcije.
- **Svrha testiranja** (bira administrator):
  - **(a) Informacijski posrednik** (usluga drugima) → **mora** proći Završno testiranje **i** predati dokumentaciju
    iz čl. 61; na njega se primjenjuju pravila IP-a.
  - **(b) Za vlastite potrebe** → prolazi Završno testiranje za odabrane scenarije, **bez** dokumentacije i **bez**
    pravila IP-a.
- **Područja / scenariji**:
  - **MPS**: objava poreznog obveznika u AMS, brisanje iz AMS-a, dohvat adrese primatelja.
  - **eRačun (razmjena)**: (a) slanje — AMS upit → MPS upit → **AS4 slanje** PT-u primatelja; (b) zaprimanje —
    objava u AMS preko MPS-a, odgovor MPS-a, **AS4 zaprimanje**.
  - **Fiskalizacija i eIzvještavanje**: fiskalizacija izlaznog eRačuna, ulaznog eRačuna, eIzvještavanje o
    **odbijanju**, eIzvještavanje o **naplati**.
- **Opcionalno testiranje** (razvojna faza): neograničen broj pokušaja, bilo kojim redom.
- **Završno testiranje**: koraci se prolaze **redom**; svaki uspješan korak ostaje zabilježen; neuspjeli se ponavlja.
  **Samo tko prođe Završno testiranje smije objavljivati podatke u AMS** (svoje ili korisničke) preko MPS-a.
- **Obveznost**: Završno testiranje za operatore Pristupnih točaka obvezno je **od 01.09.2025.** (Zakon).
- Ako radim fiskalizaciju **samo za sebe**, nisam obvezan proći završni fiskalni scenarij; ako je nudim **drugima**,
  moram proći **sve** fiskalne scenarije.
- Prije PTS-a: **Validator eRačuna** (PU, Schematron) za provjeru UBL/HR CIUS sukladnosti.

---

## 4. OPEN-SOURCE / GOTOVI AS4 GATEWAYI

PU u samoj AS4 specifikaciji (doc 140, Prilozi 4–5) **preporučuje i daje upute** za **Domibus** + gotove **P-mode**
primjere, a u MPS specifikaciji (doc 141, Prilog 1) za **DomiSMP**. To je najsigurniji put "po receptu".

| Rješenje | Jezik / runtime | Uloga | Procjena za nas |
|---|---|---|---|
| **Domibus** (EU DIGIT / CEF) | Java (Tomcat 9 / WildFly 26 / WebLogic; MySQL 8 / Oracle) | **AS4 PT (MSH)** | **Preporuka.** PU dokumentira točnu verziju (5.1.3) i daje P-mode XML za `eRačun-AS4`. Self-host, zreo, EU-održavan. Trošak: JVM + baza + operativa. |
| **DomiSMP** (EU DIGIT / CEF) | Java (Tomcat 9 / WebLogic; MySQL/Oracle) | **MPS (SMP)** | **Preporuka za MPS dio.** Implementira OASIS BDXR SMP + potpisivanje; PU ga navodi kao referentno rješenje. |
| **phax/phase4** | **Java** (embeddable lib, Apache-2.0) | AS4 client+server | Alternativa Domibusu ako želimo **ugraditi** AS4 u vlastiti Java servis umjesto standalone middlewarea. Ima ugrađenu Peppol/eDelivery podršku; treba ručno namjestiti `eRačun-AS4` P-mode. Lakši footprint, više vlastitog koda. |
| **phax/peppol-commons + phive + ph-ubl** | Java, Apache-2.0 | UBL modeli, EN16931/CIUS validacija, SMP klijent | Korisno za **validaciju** i UBL bez obzira na izbor gatewaya. |
| **Oxalis** | Java | Peppol AP (AS4) | Peppol-orijentiran; koristan ako idemo i na **prekogranično**. Za domaći `eRačun-AS4` treba prilagodba profila; manje "po receptu" od Domibusa. |
| **AS4.NET** | .NET | AS4 | Postoji, ali **dugo neodržavan** → ne preporuča se. |
| **Node.js AS4** | — | — | **Ne postoji zreo open-source AS4 MSH za Node.** Zato je realan plan: AS4 kao Java sidecar (Domibus/phase4), a naš TS/Worker sloj ga orkestrira preko internog API-ja. |

**Zaključak:** za PT/IP praktički se svodi na **Domibus (AS4) + DomiSMP (MPS)** kao self-hosted JVM par, s našim
`domovina-fiskal` (TS) kao aplikacijskim slojem koji generira UBL, radi discovery, gura payload u Domibus i vodi
fiskalni CIS tok. `phase4` je "lean" alternativa ako želimo manje moving-partsa i spremni smo pisati više Jave.

---

## 5. PEPPOL — treba li nam?

**Za domaći promet (HR↔HR): NE.** Hrvatska ima **vlastiti** discovery sloj (AMS = SML/BDXL ekvivalent PU,
MPS = SMP koji drži svaka PT) na standardu **eDelivery BDXL 1.6** i **OASIS BDXR SMP**, s **`eRačun-AS4`** profilom.
Domaći sudionici se pronalaze preko `ams.porezna-uprava.hr`, ne preko Peppol SML-a. Dakle za HR B2B/B2G/fiskalizaciju
**ne treba** OpenPeppol članstvo ni Peppol SMP.

**Za prekogranično (EU): DA, ali odvojeno.** Hrvatska platforma je integrirana s **Peppol** za prekograničnu
interoperabilnost; **FINA** djeluje kao **Peppol Access Point**. Ako `domovina-fiskal` ikad želi slati/primati u
druge EU zemlje izravno, tada bi trebalo **OpenPeppol članstvo + Peppol AP certifikacija + Peppol SMP** — što je
**zaseban, dodatan** projekt. Za sada: prekogranično prepustiti FINA-i / Peppol AP-u, a fokus držati na domaćem
AMS/MPS/AS4.

> Napomena o srodnosti: budući da je HR profil vrlo blizak Peppol eDelivery AS4 (isti ebMS3/AS4, ISO 6523 sheme,
> BDXL/SMP koncepti), **isti Domibus/phase4** stog pokriva i domaći `eRačun-AS4` i (uz drugi P-mode/PKI) Peppol —
> pa faza "domaća PT" ne baca kod ako kasnije dodamo Peppol.

---

## 6. Popis PU tehničkih dokumenata (stabilni pointeri)

Service-katalog: `porezna.gov.hr/fiskalizacija/api/dokumenti/{id}` (verzije se mijenjaju — uvijek povuci najnoviju;
pojedini ID-ovi znaju vraćati HTTP 500 povremeno, pokušati ponovno):

| Dokument | ID / URL | Verzija (2026-07-04) |
|---|---|---|
| Pristupna točka i standardni AS4 profil | `api/dokumenti/140` | 1.4 (7.10.2025.) |
| Metapodatkovni servis (MPS) | `api/dokumenti/141` | 1.3 (8.10.2025.) |
| Adresar metapodatkovnih servisa (AMS) | `api/dokumenti/142` | 1.4 (9.10.2025.) |
| Organizacija i procedure – PTS | `api/dokumenti/105` | 1.1 (11.8.2025.) |
| Specifikacija osnovne uporabe eRačuna s proširenjima (CIUS) | `api/dokumenti/99` (povremeno 500) | — |
| Tehnička spec. Fiskalizacija eRačuna i eIzvještavanje | (u katalogu / vendor-mirror fiskalizacija2.hr) | — |

> ⚠️ ID-jevi 99/104 su na dan pristupa vraćali HTTP 500 preko API-ja; AS4/MPS/AMS/PTS (140/141/142/105) uredno
> preuzeti i citirani u ovom dokumentu. CIUS (99) povući iz aplikacije/Validatora kad je servis dostupan.

---

## 7. Kontrolna lista (što konkretno napraviti)

**A. Preduvjeti (i za "za sebe" i za IP):**
- [ ] Račun u **ePorezna**; administrator dodijeli **Tester** ulogu za PTS.
- [ ] Nabaviti **kvalificirani X.509** certifikat (FINA/AKD) s **OIB-om** u atributu (za AS4/MPS/AMS/CIS).
- [ ] Povući aktualne PU dokumente (140/141/142/105/99) + **CIUS** i **Validator eRačuna**.

**B. Tehnička implementacija:**
- [ ] Postaviti **Domibus** (AS4 PT) s `eRačun-AS4` P-mode (PU Prilozi 4–5, doc 140) na javnom **:443** endpointu.
- [ ] Postaviti **DomiSMP** (MPS) — REST SMP `SignedServiceMetadata` (XAdES) + `ManageBusinessIdentifier` (Create/Delete/List) prema AMS-u.
- [ ] Implementirati **AMS discovery** (U-NAPTR: `9934:OIB` → SHA256 → BASE32 → `…ams.porezna-uprava.hr`).
- [ ] **UBL 2.1 (HR CIUS 2025 + ext)** generiranje + SBDH ovojnica; validacija Schematronom (phive/Validator).
- [ ] **Fiskalni CIS klijent** (`evidentiraj*`) + XAdES/CIS potpis (uzor `shunkica/fiskalizacija2-js`).
- [ ] Integracijski sloj `domovina-fiskal` (TS/Hono) ↔ Domibus/DomiSMP (interni API, queue, retry).

**C. Certifikacija:**
- [ ] Opcionalno testiranje na PTS-u (MPS + eRačun + fiskalizacija) do zelenog.
- [ ] **Završno testiranje** (redoslijedom); za IP i **učitati dokumentaciju čl. 61**.
- [ ] (IP) Pribaviti **ISO/IEC 27001**, GDPR čl. 32 dokument, EU-data izjavu, uspostaviti **NIS2/kibernetičku
      sigurnost** kao ključni subjekt.
- [ ] Dobiti **potvrdu o sukladnosti** → upis na **Popis IP** → objaviti se da nas korisnici mogu odabrati u FiskAplikaciji.

**D. Trajno:**
- [ ] Obnova **ISO 27001** i dostava PU u **60 dana** od isteka; praćenje verzija PU spec-a; incident reporting.

---

## 8. Procjena truda i rizika

| Stavka | "PT za sebe" | Puni IP (usluga drugima) |
|---|---|---|
| Pravno/administrativno | Nisko (nema čl. 61, nema ISO) | **Visoko** (ISO 27001, NIS2 ključni subjekt, GDPR, popis, revizije) |
| Tehnika (AS4+MPS+discovery+fiskal) | **Visoko** (isto kao IP) | Visoko |
| Operativa (24/7 GW, certifikati, TLS, monitoring) | Srednje-visoko | **Visoko** |
| Vrijeme do produkcije | Mjeseci | Mjeseci + compliance ciklus (ISO audit) |
| Glavni rizici | JVM/AS4 kompleksnost, XAdES/mTLS, promjene spec-a | + trajni sigurnosni/regulatorni teret, odgovornost prema korisnicima, brisanje s popisa |

**Najveći rizici za mali tim:** (1) **NIS2 status ključnog subjekta** + **ISO 27001** (trajni trošak i audit),
(2) **AS4/XAdES/mTLS** operativa izvan Worker modela (JVM sidecar), (3) **promjenjivost** PU specifikacija
(verzije 1.x kroz 2025.). Za usporedbu, FIRA je **zaobišla** sve ovo koristeći Pondi/ePoslovanje kao IP.

---

## 9. Preporuka — fazni pristup

**Faza 1 (sad → tržište brzo): aplikacijski sloj iznad postojećeg IP-a.**
`domovina-fiskal` ostaje ono što jest — generira UBL/HR CIUS, radi API/tenant, a razmjenu i (po potrebi)
fiskalizaciju delegira **registriranom posredniku** (FINA / MeR / Pondi-ePoslovanje) preko njihova API-ja.
Nula certifikacije, nula NIS2/ISO tereta, brzo u produkciju. (Isti model kao FIRA.)

**Faza 2 (kad postoji volumen/poslovni razlog): vlastita PT "za sebe".**
Postaviti **Domibus + DomiSMP + fiskalni CIS klijent**, proći **Završno testiranje za vlastite potrebe**, objaviti
svoj OIB (i po potrebi tenante) u AMS. Time uklanjamo ovisnost o tuđem IP-u za **vlastiti** promet, bez punog IP
statusa. Tehnički stog je 90% onoga što treba i za puni IP.

**Faza 3 (opcionalno, ako gradimo proizvod-posrednik): puni IP status.**
Tek kada poslovni model traži pružanje usluge **drugima**: pribaviti **ISO 27001**, uspostaviti **NIS2** program,
predati **čl. 61** dokumentaciju, proći Završno testiranje "za druge", upisati se na **Popis IP**. Ovo je zaseban
strateški korak s trajnim compliance troškom — ne ulaziti dok nema jasne isplativosti.

**Prekogranično (bilo koja faza):** prepustiti Peppol AP-u (FINA); vlastiti Peppol AP tek ako EU promet postane
core proizvod.

---

## Izvori

- [Porezna uprava — Pristupna točka i standardni AS4 profil (doc 140, v1.4)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/140) — CEF eDelivery AS4 v1.15, `eRačun-AS4` profil, P-mode, Domibus upute/primjeri, SBDH, PKI (pristup 2026-07-04)
- [Porezna uprava — Metapodatkovni servis MPS (doc 141, v1.3)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/141) — REST SMP `SignedServiceMetadata` (XAdES), `ManageBusinessIdentifier` (Create/Delete/List), DomiSMP, HRMPS Extension (pristup 2026-07-04)
- [Porezna uprava — Adresar AMS (doc 142, v1.4)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/142) — U-NAPTR/BDXL 1.6, ISO 6523 shema 9934, SHA256+BASE32 DNS upit, two-way SSL (pristup 2026-07-04)
- [Porezna uprava — Organizacija i procedure PTS (doc 105, v1.1)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105) — uloge Administrator/Tester, scenariji MPS/eRačun/fiskalizacija, Završno testiranje (pristup 2026-07-04)
- [Porezna uprava — Tehničke specifikacije (lista dokumenata)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/tehnicke-specifikacije) (pristup 2026-07-04)
- [Porezna uprava — Objavljeni prvi informacijski posrednici](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/fiskalizacija-informacijski-posrednici) — definicija IP-a, uvjeti, čl. 61, ISO 27001, kibernetička sigurnost (pristup 2026-07-04)
- [Porezna uprava — Popis informacijskih posrednika (8019)](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019) — službeni registar (~34) (pristup 2026-07-04)
- [Porezna uprava — Pokrenut Portal za testiranje sukladnosti](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/pokrenut-portal-za-testiranje) — PTS, Završno testiranje od 01.09.2025. (pristup 2026-07-04)
- [zakon.hr — Zakon o fiskalizaciji (čl. 59–62, informacijski posrednici)](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — uvjeti, dokumentacija čl. 61, testiranje čl. 60, praćenje/brisanje čl. 62 (pristup 2026-07-04)
- [Narodne novine — NN 89/2025 (Zakon o fiskalizaciji)](https://narodne-novine.nn.hr/eli/sluzbeni/2025/89/1233/pdf) — primarni pravni izvor (pristup 2026-07-04)
- [EU DIGIT — Domibus (AS4 Access Point)](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467110244/Domibus) — referentni open-source AS4 MSH (pristup 2026-07-04)
- [GitHub — cefedelivery/domibus](https://github.com/cefedelivery/domibus) — izvorni kod Domibusa (pristup 2026-07-04)
- [GitHub — phax/phase4](https://github.com/phax/phase4) — embeddable Java AS4 (Peppol/eDelivery), Apache-2.0 (pristup 2026-07-04)
- [GitHub — phax/peppol-commons](https://github.com/phax/peppol-commons) — Peppol/UBL/validacija komponente, Apache-2.0 (pristup 2026-07-04)
- [Peppol eDelivery AS4 Profile](https://docs.peppol.eu/edelivery/as4/specification/) — srodni AS4 profil (prekogranično) (pristup 2026-07-04)
- [EU DIGIT — eDelivery BDXL 1.6](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eDelivery+BDXL+1.6) — standard na kojem su AMS/MPS (pristup 2026-07-04)
- [European Commission — eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia) — EU pregled, Peppol/FINA AP, UBL/CII (pristup 2026-07-04)
- [ecosio — E-invoicing and e-reporting in Croatia: Fiscalisation 2.0](https://ecosio.com/en/blog/e-invoicing-croatia-fiscalisation-2-0-e-reporting/) — *vendor*: pregled AMS/MPS/AS4 (pristup 2026-07-04)
- [VATupdate — E-invoicing in Croatia briefing](https://www.vatupdate.com/2025/12/19/e-invoicing-in-croatia-a-briefing-document/) — *vendor*: sažetak modela (pristup 2026-07-04)
- [fiskalizacija2.hr — Pristupna točka i informacijski posrednik (glosar)](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/pristupna-tocka-i-informacijski-posrednik/) — *edukativni izvor* (pristup 2026-07-04)

> Interne reference: `03-fiskalizacija-2.0-eracun.md` (okvir, rokovi, CIUS), `08-postojece-implementacije.md`
> (Domibus/phase4/shunkica uzori, licence), `11-arhitektura-runtime.md` (Worker vs sidecar potpis).

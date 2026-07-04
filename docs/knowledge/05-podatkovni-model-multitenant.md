# 05 — Podatkovni model i multi-tenant zahtjevi

> Stanje na dan **2026-07-04**. Cilj dokumenta: definirati **što svaki tenant (SME / izdavatelj)
> mora imati pohranjeno u bazi** da bi mogao izdati fiskalni račun (B2C u krajnjoj potrošnji)
> i/ili fiskalizirani eRačun (B2B/B2G), te predložiti konkretnu **DB shemu** (Cloudflare D1 /
> SQLite kao primarni cilj, uz Postgres napomene).
>
> Arhitektonsko načelo (preuzeto od FIRA modela, vidi `docs/reference/fira-custom-webshop-api.md`):
> **payload API-ja opisuje samo `kupac + stavke + tip` — SVE o izdavatelju (OIB, naziv, certifikat,
> poslovni prostor, naplatni uređaj, PDV status, IBAN) je server-side i vezano na `apiKey` = tenant.**

---

## 0. TL;DR — što tenant MORA imati prije prvog računa

| Preduvjet | Zašto | Izvor obveze |
|---|---|---|
| **OIB + naziv + adresa** izdavatelja | Ide u ZKI, u `Izdavatelj` element eRačuna, na ispis | Zakon o fiskalizaciji NN 89/2025 |
| **PDV status** (`u sustavu PDV-a` da/ne) | Određuje R1 vs R2, obvezu izdavanja eRačuna (2026 vs 2027), PDV raščlambu | NN 89/2025 |
| **Aplikativni digitalni certifikat** (FINA/CA u HR), per-tenant, **enkriptiran** | TLS veza prema CIS-u **i** elektroničko potpisivanje poruke (ZKI + XML-DSIG) | Teh. spec. Fisk 2.0, pogl. 9–11 |
| **Poslovni prostor prijavljen u CIS** *prije* prvog računa iz tog prostora | Zakonska obveza; bez prijave račun nema valjan kontekst | Teh. spec., B2C stranica PU (ažur. 5.1.2026) |
| **Naplatni uređaj** (oznaka) unutar prostora | Dio broja računa i ZKI-ja | isto |
| **Interni akt o slijednosti brojeva računa** | Određuje razinu slijednosti (PP ili NU) i strukturu | B2C stranica PU |
| **KPD šifra** po artiklu/usluzi | Obavezna klasifikacija (shema `CG`) na eRačunu | Teh. spec. Fisk 2.0, tablica 53–54 |

---

## 1. Regulatorni kontekst (ukratko, za oblikovanje modela)

- **Zakon o fiskalizaciji**, **NN 89/2025** (objavljen 13. 6. 2025.), na snazi **1. 9. 2025.**, uz odgode
  pojedinih odredbi. Objedinjuje: B2C fiskalizaciju u krajnjoj potrošnji, izdavanje i fiskalizaciju
  **eRačuna** u B2B te B2G segmentu. (narodne-novine.nn.hr 2025_06_89_1233)
- **Rokovi:**
  - **1. 1. 2026.** — obveznici **u sustavu PDV-a**: izdaju **i** zaprimaju eRačun (B2B/B2G);
    obveznici **izvan sustava PDV-a**: obvezni **zaprimati** eRačun (i fiskalizirati zaprimanje).
    B2C: fiskalizacija se proširuje na **sve načine plaćanja** (gotovina, kartice, **transakcijski
    račun**, ostalo) — ne više samo gotovina/kartice.
  - **1. 1. 2027.** — druga faza: obveznici izvan PDV-a (npr. paušalisti) počinju i **izdavati** eRačun.
- **eIzvještavanje:** izdavatelj eRačuna dužan je **do 20. u mjesecu** dostaviti podatke o svim u
  cijelosti/djelomično naplaćenim eRačunima iz prethodnog mjeseca (poruka `EvidentirajNaplatu`).
- **Fiskalizacija „u 5 radnih dana“:** samo iznimno, kad zbog tehničkih razloga/prekida veze
  trenutna fiskalizacija nije bila moguća.

> ⚠️ **Dva odvojena tehnička kanala — model mora podržati oba:**
> 1. **B2C / krajnja potrošnja („Fiskalizacija 1.0“ mehanika)** — SOAP prema `FiskalizacijaService`,
>    generira se **ZKI** (lokalno) i dobiva **JIR** (od PU), QR kod na ispisu. Ostaje na snazi.
> 2. **eRačun (B2B/B2G) + eIzvještavanje („Fiskalizacija 2.0“)** — SOAP prema `fin/2024` servisima
>    (`EvidentirajERacun`, `EvidentirajNaplatu`, `EvidentirajOdbijanje`), UBL/EN 16931 struktura.

---

## 2. Entiteti podatkovnog modela

### 2.1. Tenant / SME (izdavatelj)

Reprezentira jednog poreznog obveznika (klijenta našeg servisa). Sve ostalo visi na njemu.

| Polje | Tip | Napomena |
|---|---|---|
| `oib` | CHAR(11) | 11 znamenki; ide u ZKI i u `Izdavatelj.oibPorezniBroj` (BT-31). **Validirati mod-11 kontrolnu znamenku.** |
| `naziv` | TEXT | Puni naziv obveznika (`Izdavatelj.ime`). |
| `adresa` (ulica, kbr, mjesto, pošt. broj, država) | TEXT | Sjedište; na ispisu i u eRačunu. |
| `u_sustavu_pdv` | BOOL | Ključno: R1 (u PDV) vs R2 (nije u PDV); određuje rokove 2026/2027 i PDV raščlambu. |
| `iban` | CHAR(21…) | HR IBAN; ide u eRačun `identifikatorRacunaZaPlacanje` (PayeeFinancialAccount) i na ispis. |
| `naziv_banke` / `bic` | TEXT | Opcionalno za eRačun. |
| `oznaka_slijednosti_default` | CHAR(1) | `P` (razina poslovnog prostora) ili `N` (razina naplatnog uređaja) — interni akt. |
| `eracun_izdavanje_od` | DATE | 2026-01-01 (PDV) ili 2027-01-01 (ne-PDV) — kada tenant smije izdavati eRačun. |
| `status` | ENUM | `active` / `suspended`. |

### 2.2. Certifikat (per-tenant, enkriptiran)

Aplikativni digitalni certifikat (FINA / CA u RH). Koristi se za **dvije** stvari: TLS prema CIS-u
i **potpisivanje poruke**. Za B2C ZKI potpis se radi **privatnim ključem** tog certifikata (RSA).

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | |
| `okolina` | ENUM `test`/`prod` | Odvojeni certifikati za test i produkciju. |
| `pkcs12_encrypted` | BLOB | `.p12/.pfx` sadržaj, **enkriptiran** (envelope encryption). Nikada plaintext u bazi. |
| `enc_alg` / `enc_key_id` / `iv` | TEXT | Metapodaci enkripcije (npr. AES-256-GCM; ključ iz KMS/Secrets, ne iz baze). |
| `subject_dn` | TEXT | Distinguished Name; sadrži OIB — provjera podudarnosti s `tenant.oib`. |
| `serial` | TEXT | Serijski broj (ide u `IssuerSerial` XAdES/KeyInfo). |
| `not_before` / `not_after` | DATETIME | Za monitoring isteka (upozorenje X dana prije). |
| `fingerprint_sha256` | TEXT | Za identifikaciju/rotaciju. |

> 🔐 **Nikada** ne spremati privatni ključ u čisti tekst. Na Cloudflare Workers: dešifriranje u
> memoriji tek u trenutku potpisivanja; master ključ iz `wrangler secret` / vanjski KMS. (Vidi
> `docs/knowledge/11-arhitektura-runtime.md` za dilemu Worker vs. „signing sidecar“ jer WebCrypto
> nema izravni mTLS klijent + RSA-SHA1 za legacy ZKI.)

### 2.3. Poslovni prostor (PoslovniProstor) — **MORA biti registriran u CIS-u prije računa**

Prijava poslovnog prostora ostaje obvezna i nakon 1. 1. 2026. Bez uspješne prijave nije dopušteno
izdavati fiskalne račune iz tog prostora.

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | |
| `oznaka` | TEXT | **Oznaka poslovnog prostora** (`oznPP`) — dio broja računa i ZKI-ja. Interni akt. |
| `adresa` (ulica, kbr, naselje, pošt.broj, općina) | TEXT | ILI: |
| `tip_nekretnina` | ENUM | Za **pokretni**/bez fiksne adrese: oznaka umjesto adrese (npr. tip prostora „na terenu“). |
| `tip_prostora` | TEXT | Vrsta poslovnog prostora / opis. |
| `sifra_djelatnosti` (NKD) | TEXT | Vrsta djelatnosti u prostoru. |
| `radno_vrijeme` | TEXT | Od 1. 1. 2026. može se dostaviti elektronički. |
| `datum_pocetka_primjene` | DATE | **Datum od kojeg se prostor koristi** — mora biti prijavljen u CIS prije prvog računa. |
| `datum_zatvaranja` | DATE | Opcionalno (zatvaranje prostora). |
| `cis_status` | ENUM | `neposlano` / `prijavljen` / `greska` — je li prijava potvrđena u CIS-u. |
| `cis_prijava_ts` | DATETIME | Kada je uspješno prijavljen. |

> ⚠️ **Invarijanta koju kod MORA provoditi:** računski servis odbija izdati račun ako
> `poslovni_prostor.cis_status <> 'prijavljen'`. Prijava prostora je zasebna poruka prema CIS-u
> (`PoslovniProstorZahtjev`) i događa se **prije** prvog `RacunZahtjev`.

### 2.4. Naplatni uređaj (NaplatniUredaj)

| Polje | Tip | Napomena |
|---|---|---|
| `poslovni_prostor_id` | FK | Uređaj pripada prostoru. |
| `oznaka` | TEXT (obično numerička) | **Oznaka naplatnog uređaja** (`oznNU`) — dio broja računa i ZKI-ja. |
| `opis` | TEXT | npr. „Blagajna 1“, „Webshop“. |
| `aktivan` | BOOL | |

### 2.5. Operater (na računu)

Fiskalni račun mora sadržavati **oznaku operatera** (OIB osobe koja je izdala račun ili njegova oznaka).

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | |
| `oib_operatera` | CHAR(11) | OIB operatera; ide u fiskalizacijsku poruku i na ispis. |
| `ime` | TEXT | Za ispis. |
| `aktivan` | BOOL | |

### 2.6. Kupac (Primatelj)

Za B2C često anoniman (nema OIB). Za B2B/B2G **obavezan OIB/porezni broj** (Primatelj `oibPorezniBroj`, BT-48).

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | Kupac je u kontekstu tenanta (adresar). |
| `naziv` / `ime` | TEXT | `Primatelj.ime`. |
| `oib` | CHAR(11) NULL | Obavezan za eRačun (B2B/B2G); NULL za anonimni B2C. |
| `vat_number` | TEXT NULL | Za strane kupce (npr. `ATU…`, `DE…`). |
| `adresa` (ulica, grad, država, pošt.broj) | TEXT | |
| `email` | TEXT | Za slanje računa / pristupnu točku eRačuna. |
| `tip` | ENUM | `fizicka` / `pravna` / `drzava(B2G)`. |

### 2.7. Račun (Racun)

Središnji entitet. Objedinjuje B2C fiskalizaciju (ZKI/JIR) i eRačun (B2B/B2G) atribute.

**Broj računa** — pravilo **`brojRacuna/oznakaPP/oznakaNU`** (npr. `1234/POSL1/2`; PU primjer strukture
„numerički broj − oznaka poslovnog prostora − broj naplatnog uređaja“, npr. `1-1-1`). U eRačunu isti
identifikator dolazi u `brojDokumenta` / `/Invoice/cbc:ID` (u primjeru spec.: `1234/2024/01`).

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | |
| `poslovni_prostor_id` / `naplatni_uredaj_id` | FK | Kontekst. |
| `operater_id` | FK | Oznaka operatera na računu. |
| `kupac_id` | FK NULL | NULL za anonimni B2C. |
| `redni_broj` | INTEGER | Slijedni broj (`brojRacuna`) — vidi pravila numeriranja (§3). |
| `godina` | INTEGER | Za godišnji reset. |
| `broj_racuna_full` | TEXT | Materijalizirano `redni_broj/oznPP/oznNU`. |
| `oznaka_slijednosti` | CHAR(1) | `P` ili `N` (na razini prostora ili uređaja). |
| `datum_vrijeme` | DATETIME | Datum i vrijeme izdavanja (sat/minuta obavezni za B2C). |
| `tip_dokumenta` | ENUM | `ponuda` / `racun` / `fiskalni_b2c` / `eracun_b2b` / `eracun_b2g`. |
| `vrsta_dokumenta` | TEXT | UNTDID 1001 (npr. `380` = račun) — za eRačun. |
| `vrsta_poslovnog_procesa` | TEXT | npr. `01` (`/Invoice/cbc:ProfileID`). |
| `valuta` | CHAR(3) | ISO 4217, `EUR`. |
| `nacin_placanja` | ENUM | B2C: gotovina/kartica/transakcijski/ostalo. eIzvještavanje: `T`/`K`/`O`. |
| `neto` / `iznos_bez_pdv` / `pdv` / `iznos_s_pdv` / `dospijeva_za_placanje` | DECIMAL | `DokumentUkupanIznos`. |
| `zki` | CHAR(32) | Zaštitni kod izdavatelja (MD5 hex). Ispisuje se i kad fiskalizacija ne uspije. |
| `jir` | CHAR(36) NULL | UUID od PU (8-4-4-4-12); NULL dok nije fiskalizirano. |
| `status` | ENUM | `nacrt` / `poslan` / `fiskaliziran` / `odbijen` / `storniran` / `naplacen`. |
| `qr_payload` | TEXT | Sadržaj QR koda (URL PU + JIR/ZKI + datum + iznos). |
| `indikator_kopije` | BOOL | eRačun `indikatorKopije` (kopija računa true/false). |

### 2.8. Stavke računa (StavkaERacuna)

| Polje | Tip | Napomena |
|---|---|---|
| `racun_id` | FK | |
| `redni_broj` | INTEGER | Poredak stavke. |
| `naziv` | TEXT | `artiklNaziv`. |
| `kolicina` | DECIMAL | `kolicina`. |
| `jedinica_mjere` | TEXT | Šifra jed. mjere po **EN 16931** (`/Invoice/…/@unitCode`; npr. `H87` komad, `C62` jedinica). |
| `neto_cijena` | DECIMAL | `artiklNetoCijena`. |
| `pdv_kategorija` | CHAR(1) | UNTDID 5305 (`S` standardna, `AE` prijenos, `Z` nulta, `E` izuzeto…). |
| `pdv_stopa` | DECIMAL | 25 / 13 / 5 / 0. |
| `kpd` | TEXT | **KPD klasifikacija** (`identifikatorKlasifikacije`, npr. `11.07.01`). |
| `kpd_shema` | CHAR(2) | Uvijek `CG` (oznaka KPD nomenklature u eRačunu). |

### 2.9. PDV raščlamba (RaspodjelaPdv)

Agregacija po poreznoj stopi/kategoriji (obavezno za R1 / eRačun).

| Polje | Tip |
|---|---|
| `racun_id` | FK |
| `kategorija_pdv` | CHAR(1) (`S`, `Z`, `E`, `AE`…) |
| `stopa` | DECIMAL |
| `oporezivi_iznos` | DECIMAL |
| `iznos_poreza` | DECIMAL |
| `razlog_izuzeca_vatex` | TEXT NULL (šifrarnik VATEX) |

### 2.10. Evidencija poslanih poruka (audit log)

Svaka poruka prema CIS-u/PU se pohranjuje (potpisani zahtjev + odgovor) radi dokazivosti i retryja.

| Polje | Tip | Napomena |
|---|---|---|
| `tenant_id` | FK | |
| `racun_id` | FK NULL | Vezano na račun (ili prijavu prostora → NULL). |
| `vrsta_poruke` | ENUM | `poslovni_prostor` / `racun_b2c` / `eracun` / `naplata` / `odbijanje` / `isporuka_bez_eracuna`. |
| `smjer` | ENUM | `zahtjev` / `odgovor`. |
| `message_id` | TEXT | UUID `id` atribut poruke (idempotencija). |
| `request_xml` / `response_xml` | TEXT | Cijeli potpisani SOAP (za reviziju). |
| `jir` | TEXT NULL | Ako odgovor sadrži JIR. |
| `sifra_greske` / `poruka_greske` | TEXT NULL | npr. `S007`, `S009`, `S011`. |
| `okolina` | ENUM | `test`/`prod`. |
| `created_at` | DATETIME | |

---

## 3. Pravila numeriranja računa

Izvor: B2C stranica Porezne uprave (ažur. 5. 1. 2026.) + teh. spec.

1. **Struktura broja:** `brojRacuna / oznakaPoslovnogProstora / oznakaNaplatnogUredaja`
   (PU navodi „numerički broj − oznaka poslovnog prostora − broj naplatnog uređaja“, npr. `1-1-1`).
   U eRačunu isti string ide u `brojDokumenta` (`/Invoice/cbc:ID`).
2. **Slijednost (`oznakaSlijednosti`)** — obveznik **internim aktom** bira jednu od dvije razine:
   - **`P`** — kontinuirano na razini **poslovnog prostora** (svi uređaji dijele isti brojač), ili
   - **`N`** — kontinuirano na razini **naplatnog uređaja** (svaki uređaj ima svoj brojač).
3. **Kontinuitet (bez rupa):** brojevi moraju biti **neprekinuti i rastući** unutar odabrane razine
   i tekuće godine. Preskočeni/duplirani broj je nepravilnost.
4. **Godišnji reset:** numeracija **kreće od 1 svake kalendarske godine** (1. 1.), po odabranoj razini.
5. **Posljedica za shemu:** brojač mora biti **atomski** (jedan po ključu
   `(tenant, razina-entitet, godina)`), s pesimističkim zaključavanjem/`UPDATE … RETURNING` da se
   izbjegnu rupe i duplikati u konkurentnom pristupu.

> Model to rješava tablicom `sekvence` (§6) čiji je jedinstveni ključ upravo odabrana razina.

---

## 4. ZKI i JIR (B2C mehanika)

### 4.1. ZKI (Zaštitni kod izdavatelja) — generira se **lokalno** kod izdavatelja

Ulaz je **konkatenacija** (bez razdjelnika) sljedećih polja, ovim redoslijedom:

```
ZKI_input = OIB
          + datumVrijemeIzdavanja   (format: dd.MM.yyyyTHH:mm:ss)
          + brojRacuna              (redni broj, npr. 1234)
          + oznakaPoslovnogProstora (oznPP)
          + oznakaNaplatnogUredaja  (oznNU)
          + ukupanIznos             (npr. 1250.00, s decimalnom točkom)

potpis = RSA-SHA1( ZKI_input, privatniKljucCertifikata )
ZKI    = lower( hex( MD5( potpis ) ) )     // 32 heksadecimalna znaka
```

- ZKI se ispisuje na računu **čak i ako fiskalizacija (dobivanje JIR-a) ne uspije**.
- ⚠️ **Legacy kripto:** ZKI koristi **RSA-SHA1 + MD5**. Na Cloudflare Workers WebCrypto podržava
  RSA-PKCS1 potpis, ali provjeriti podršku za SHA-1/MD5 (MD5 nije u WebCrypto) — vjerojatno je
  potreban čisti-JS MD5 ili „signing sidecar“. (Vidi `docs/knowledge/02-*` i `11-*`.)

> Napomena: gornji **redoslijed i formati** su ustaljena praksa iz Fiskalizacija 1.0 tehničke
> specifikacije. Točan format datuma/iznosa **obavezno verificirati u aktualnoj teh. specifikaciji
> v2.6** prije implementacije — službeni PDF v2.6 je skenirani dokument (bez tekstualnog sloja),
> pa ovdje nije doslovno citiran. **Ne implementirati napamet.**

### 4.2. JIR (Jedinstveni identifikator računa) — dodjeljuje **Porezna uprava**

- PU ga generira metodom **UUID** nakon zaprimanja cjelovitih podataka o računu.
- Format: **32 hex znaka, grupirano 8-4-4-4-12**, npr. `f47ac10b-58cc-4372-a567-0e02b2c3d479`.
- Vraća se u odgovoru i **mora se ispisati na računu**; ulazi u **QR kod** (URL PU + JIR/ZKI + datum + iznos).

---

## 5. eRačun 2.0 — polja koja model mora podržati (EN 16931 / HR-CIUS)

Poruka **`EvidentirajERacunZahtjev`** (namespace `http://www.porezna-uprava.gov.hr/fin/2024/types/eFiskalizacija`).
CIUS identifikator specifikacije (`/Invoice/cbc:CustomizationID`):

```
urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0
```

Ključni elementi (naziv u fiskalizacijskoj poruci → UBL/EN 16931 putanja):

| Element (poruka) | UBL putanja / BT | Napomena |
|---|---|---|
| `Zaglavlje/vrstaERacuna` | — | `I` = izlazni, `U` = ulazni |
| `brojDokumenta` | `/Invoice/cbc:ID` | broj računa (`brROB/PP/NU`) |
| `datumIzdavanja` | `/Invoice/cbc:IssueDate` (BT-2) | `YYYY-MM-DD` |
| `vrstaDokumenta` | `/Invoice/cbc:InvoiceTypeCode` (BT-3) | UNTDID 1001, npr. `380` |
| `valutaERacuna` | `/Invoice/cbc:DocumentCurrencyCode` (BT-5) | ISO 4217, `EUR` |
| `vrstaPoslovnogProcesa` | `/Invoice/cbc:ProfileID` | npr. `01` |
| `Izdavatelj/ime` + `oibPorezniBroj` | `AccountingSupplierParty/…/PartyTaxScheme/cbc:CompanyID` (BT-31) | OIB izdavatelja |
| `Primatelj/ime` + `oibPorezniBroj` | `AccountingCustomerParty/…/cbc:CompanyID` (BT-48) | OIB primatelja |
| `identifikatorRacunaZaPlacanje` | `PaymentMeans/PayeeFinancialAccount/cbc:ID` | IBAN izdavatelja |
| `DokumentUkupanIznos` (`neto`, `iznosBezPdv`, `pdv`, `iznosSPdv`, `iznosKojiDospijevaZaPlacanje`) | `cac:LegalMonetaryTotal` | ukupni iznosi |
| `RaspodjelaPdv` (`kategorijaPdv`, `oporeziviIznos`, `iznosPoreza`, `stopa`) | `cac:TaxTotal/TaxSubtotal` | kategorija UNTDID 5305 (`S`…) |
| `StavkaERacuna` (`kolicina`, `jedinicaMjere`, `artiklNetoCijena`, `artiklKategorijaPdv`, `artiklStopaPdv`, `artiklNaziv`) | `cac:InvoiceLine` | jed. mjere po EN 16931 (`@unitCode`) |
| `ArtiklIdentifikatorKlasifikacija` (`identifikatorKlasifikacije`, `identifikatorSheme`) | `Item/cac:CommodityClassification` | **KPD** vrijednost + shema `CG` |
| `indikatorKopije` | — | `true`/`false` |

**Minimalni primjer tijela `ERacun` (iz teh. spec.):**

```xml
<efis:ERacun>
  <efis:brojDokumenta>1234/2024/01</efis:brojDokumenta>
  <efis:datumIzdavanja>2024-09-02</efis:datumIzdavanja>
  <efis:vrstaDokumenta>380</efis:vrstaDokumenta>
  <efis:valutaERacuna>EUR</efis:valutaERacuna>
  <efis:vrstaPoslovnogProcesa>01</efis:vrstaPoslovnogProcesa>
  <efis:Izdavatelj>
    <efis:ime>Some Seller Ltd.</efis:ime>
    <efis:oibPorezniBroj>02994650199</efis:oibPorezniBroj>
  </efis:Izdavatelj>
  <efis:Primatelj>
    <efis:ime>John Doe</efis:ime>
    <efis:oibPorezniBroj>02994650190</efis:oibPorezniBroj>
  </efis:Primatelj>
  <efis:DokumentUkupanIznos>
    <efis:neto>1000.00</efis:neto>
    <efis:iznosBezPdv>1000.00</efis:iznosBezPdv>
    <efis:pdv>250.00</efis:pdv>
    <efis:iznosSPdv>1250.00</efis:iznosSPdv>
    <efis:iznosKojiDospijevaZaPlacanje>1250.00</efis:iznosKojiDospijevaZaPlacanje>
  </efis:DokumentUkupanIznos>
  <efis:RaspodjelaPdv>
    <efis:kategorijaPdv>S</efis:kategorijaPdv>
    <efis:oporeziviIznos>1000.00</efis:oporeziviIznos>
    <efis:iznosPoreza>250.00</efis:iznosPoreza>
    <efis:stopa>25</efis:stopa>
  </efis:RaspodjelaPdv>
  <efis:StavkaERacuna>
    <efis:kolicina>2</efis:kolicina>
    <efis:jedinicaMjere>10</efis:jedinicaMjere>
    <efis:artiklNetoCijena>500.00</efis:artiklNetoCijena>
    <efis:artiklKategorijaPdv>S</efis:artiklKategorijaPdv>
    <efis:artiklStopaPdv>25</efis:artiklStopaPdv>
    <efis:artiklNaziv>naziv artikla</efis:artiklNaziv>
    <efis:ArtiklIdentifikatorKlasifikacija>
      <efis:identifikatorKlasifikacije>11.07.01</efis:identifikatorKlasifikacije>
      <efis:identifikatorSheme>CG</efis:identifikatorSheme>
    </efis:ArtiklIdentifikatorKlasifikacija>
  </efis:StavkaERacuna>
  <efis:indikatorKopije>false</efis:indikatorKopije>
</efis:ERacun>
```

**Potpis eRačun poruke:** XML-DSIG (enveloped), **RSA-SHA256** (`xmldsig-more#rsa-sha256`),
kanonikalizacija c14n / exc-c14n, `DigestMethod` SHA-256, `KeyInfo/X509Data/X509Certificate`
(XAdES-B). To je **drukčije** od legacy ZKI RSA-SHA1 mehanizma.

### 5.1. eIzvještavanje — `EvidentirajNaplata`

Poruka o naplati (do 20. u mjesecu). Model treba `naplata` zapise vezane na račun:

```xml
<eiz:Naplata>
  <eiz:brojDokumenta>1234-2024-06</eiz:brojDokumenta>
  <eiz:datumIzdavanja>2024-02-27</eiz:datumIzdavanja>
  <eiz:oibPorezniBrojIzdavatelja>02994650199</eiz:oibPorezniBrojIzdavatelja>
  <eiz:oibPorezniBrojPrimatelja>00000000001</eiz:oibPorezniBrojPrimatelja>
  <eiz:datumNaplate>2024-06-17</eiz:datumNaplate>
  <eiz:naplaceniIznos>110.00</eiz:naplaceniIznos>
  <eiz:nacinPlacanja>T</eiz:nacinPlacanja>   <!-- T=transakcijski, K, O=ostalo -->
</eiz:Naplata>
```

---

## 6. Predložena SQL shema (Cloudflare D1 / SQLite)

> Konvencije: sve na hrvatskom (kao u `pipeline.domovina.ai`). `TEXT` za ISO datume (SQLite nema
> native `DATETIME`). Novčani iznosi kao `TEXT` (decimalni string) **ili** `INTEGER` u centima —
> ovdje `TEXT` radi točnosti prema XML formatu; alternativa u Postgresu je `NUMERIC(15,2)`.
> Za Postgres: `TEXT`→`VARCHAR`, `INTEGER PRIMARY KEY`→`BIGSERIAL`, `BLOB`→`BYTEA`,
> booleove `INTEGER 0/1`→`BOOLEAN`, dodati `CHECK` i `gen_random_uuid()`.

```sql
-- =========================================================
-- 0001_init.sql  — Domovina Fiskal, multi-tenant shema
-- =========================================================

-- 1) TENANT / SME (izdavatelj)
CREATE TABLE tenant (
  id                       INTEGER PRIMARY KEY,
  oib                      TEXT NOT NULL UNIQUE,           -- 11 znamenki, mod-11 provjera u aplikaciji
  naziv                    TEXT NOT NULL,
  adr_ulica                TEXT,
  adr_kucni_broj           TEXT,
  adr_mjesto               TEXT,
  adr_postanski_broj       TEXT,
  adr_drzava               TEXT NOT NULL DEFAULT 'HR',
  u_sustavu_pdv            INTEGER NOT NULL DEFAULT 0,     -- 0/1
  iban                     TEXT,
  bic                      TEXT,
  naziv_banke              TEXT,
  oznaka_slijednosti_def   TEXT NOT NULL DEFAULT 'P'       -- 'P' ili 'N'
                            CHECK (oznaka_slijednosti_def IN ('P','N')),
  eracun_izdavanje_od      TEXT,                           -- '2026-01-01' | '2027-01-01'
  status                   TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended')),
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2) API KLJUČEVI (apiKey = tenant identitet; hashiran)
CREATE TABLE api_kljuc (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  prefiks       TEXT NOT NULL,                 -- vidljivi prefiks za identifikaciju
  hash          TEXT NOT NULL UNIQUE,          -- SHA-256 tajnog dijela ključa
  opis          TEXT,
  aktivan       INTEGER NOT NULL DEFAULT 1,
  zadnje_koristen_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_apikljuc_tenant ON api_kljuc(tenant_id);

-- 3) CERTIFIKAT (per-tenant, enkriptiran; odvojeno test/prod)
CREATE TABLE certifikat (
  id                 INTEGER PRIMARY KEY,
  tenant_id          INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  okolina            TEXT NOT NULL CHECK (okolina IN ('test','prod')),
  pkcs12_encrypted   BLOB NOT NULL,            -- .p12 sadržaj, enkriptiran (AES-256-GCM)
  enc_alg            TEXT NOT NULL DEFAULT 'AES-256-GCM',
  enc_key_id         TEXT NOT NULL,            -- referenca na KMS/secret, NE ključ
  enc_iv             TEXT NOT NULL,
  subject_dn         TEXT,
  serial             TEXT,
  fingerprint_sha256 TEXT,
  not_before         TEXT,
  not_after          TEXT,
  aktivan            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, okolina, aktivan)
);
CREATE INDEX ix_cert_tenant ON certifikat(tenant_id);

-- 4) POSLOVNI PROSTOR (mora biti 'prijavljen' u CIS prije računa)
CREATE TABLE poslovni_prostor (
  id                     INTEGER PRIMARY KEY,
  tenant_id              INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  oznaka                 TEXT NOT NULL,          -- oznPP
  adr_ulica              TEXT,
  adr_kucni_broj         TEXT,
  adr_naselje            TEXT,
  adr_postanski_broj     TEXT,
  adr_opcina             TEXT,
  bez_fiksne_adrese      INTEGER NOT NULL DEFAULT 0,  -- pokretni prostor
  tip_prostora           TEXT,
  sifra_djelatnosti_nkd  TEXT,
  radno_vrijeme          TEXT,
  datum_pocetka_primjene TEXT NOT NULL,          -- MORA biti prije prvog računa
  datum_zatvaranja       TEXT,
  cis_status             TEXT NOT NULL DEFAULT 'neposlano'
                          CHECK (cis_status IN ('neposlano','prijavljen','greska')),
  cis_prijava_ts         TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, oznaka)
);
CREATE INDEX ix_pp_tenant ON poslovni_prostor(tenant_id);

-- 5) NAPLATNI UREĐAJ
CREATE TABLE naplatni_uredaj (
  id                  INTEGER PRIMARY KEY,
  poslovni_prostor_id INTEGER NOT NULL REFERENCES poslovni_prostor(id) ON DELETE CASCADE,
  oznaka              TEXT NOT NULL,             -- oznNU
  opis                TEXT,
  aktivan             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (poslovni_prostor_id, oznaka)
);

-- 6) OPERATER
CREATE TABLE operater (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  oib_operatera TEXT NOT NULL,
  ime           TEXT,
  aktivan       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, oib_operatera)
);

-- 7) KUPAC (Primatelj)
CREATE TABLE kupac (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  naziv         TEXT NOT NULL,
  oib           TEXT,                    -- obavezan za eRačun B2B/B2G, NULL za anon B2C
  vat_number    TEXT,                    -- strani kupci
  adr_ulica     TEXT,
  adr_grad      TEXT,
  adr_postanski_broj TEXT,
  adr_drzava    TEXT DEFAULT 'HR',
  email         TEXT,
  tip           TEXT CHECK (tip IN ('fizicka','pravna','drzava')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_kupac_tenant ON kupac(tenant_id);
CREATE INDEX ix_kupac_oib    ON kupac(tenant_id, oib);

-- 8) SEKVENCE (atomski brojači po odabranoj razini slijednosti)
--    razina_tip: 'PP' -> razina_id = poslovni_prostor.id
--                'NU' -> razina_id = naplatni_uredaj.id
CREATE TABLE sekvenca (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  razina_tip    TEXT NOT NULL CHECK (razina_tip IN ('PP','NU')),
  razina_id     INTEGER NOT NULL,        -- FK na PP ili NU ovisno o razina_tip
  godina        INTEGER NOT NULL,
  zadnji_broj   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, razina_tip, razina_id, godina)
);
-- Dodjela sljedećeg broja (atomski, bez rupa):
--   UPDATE sekvenca SET zadnji_broj = zadnji_broj + 1
--     WHERE tenant_id=? AND razina_tip=? AND razina_id=? AND godina=?
--     RETURNING zadnji_broj;
-- (u D1: unutar iste batch/transakcije; INSERT ... ON CONFLICT za prvi broj godine)

-- 9) RAČUN
CREATE TABLE racun (
  id                    INTEGER PRIMARY KEY,
  tenant_id             INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  poslovni_prostor_id   INTEGER NOT NULL REFERENCES poslovni_prostor(id),
  naplatni_uredaj_id    INTEGER NOT NULL REFERENCES naplatni_uredaj(id),
  operater_id           INTEGER REFERENCES operater(id),
  kupac_id              INTEGER REFERENCES kupac(id),     -- NULL za anon B2C
  redni_broj            INTEGER NOT NULL,
  godina                INTEGER NOT NULL,
  broj_racuna_full      TEXT NOT NULL,      -- 'redni/oznPP/oznNU'
  oznaka_slijednosti    TEXT NOT NULL CHECK (oznaka_slijednosti IN ('P','N')),
  datum_vrijeme         TEXT NOT NULL,      -- ISO 8601, sat+minuta obavezni za B2C
  tip_dokumenta         TEXT NOT NULL
                         CHECK (tip_dokumenta IN
                           ('ponuda','racun','fiskalni_b2c','eracun_b2b','eracun_b2g')),
  vrsta_dokumenta       TEXT,               -- UNTDID 1001, npr '380'
  vrsta_poslovnog_proc  TEXT,               -- ProfileID, npr '01'
  valuta                TEXT NOT NULL DEFAULT 'EUR',
  nacin_placanja        TEXT,               -- gotovina/kartica/transakcijski/ostalo
  neto                  TEXT,
  iznos_bez_pdv         TEXT,
  pdv                   TEXT,
  iznos_s_pdv           TEXT,
  dospijeva_za_placanje TEXT,
  zki                   TEXT,               -- 32 hex; i kad fiskalizacija ne uspije
  jir                   TEXT,               -- UUID od PU; NULL dok nije fiskalizirano
  qr_payload            TEXT,
  indikator_kopije      INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'nacrt'
                         CHECK (status IN
                           ('nacrt','poslan','fiskaliziran','odbijen','storniran','naplacen')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, godina, poslovni_prostor_id, naplatni_uredaj_id, redni_broj)
);
CREATE INDEX ix_racun_tenant_datum ON racun(tenant_id, datum_vrijeme);
CREATE INDEX ix_racun_jir          ON racun(jir);
CREATE INDEX ix_racun_status       ON racun(tenant_id, status);
CREATE INDEX ix_racun_kupac        ON racun(kupac_id);

-- 10) STAVKE RAČUNA
CREATE TABLE stavka (
  id              INTEGER PRIMARY KEY,
  racun_id        INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  redni_broj      INTEGER NOT NULL,
  naziv           TEXT NOT NULL,
  kolicina        TEXT NOT NULL,
  jedinica_mjere  TEXT NOT NULL,       -- EN16931 unitCode (npr 'H87')
  neto_cijena     TEXT NOT NULL,
  pdv_kategorija  TEXT NOT NULL,       -- UNTDID 5305 'S','Z','E','AE'...
  pdv_stopa       TEXT NOT NULL,       -- 25/13/5/0
  kpd             TEXT,                -- KPD vrijednost npr '11.07.01'
  kpd_shema       TEXT NOT NULL DEFAULT 'CG',
  UNIQUE (racun_id, redni_broj)
);
CREATE INDEX ix_stavka_racun ON stavka(racun_id);

-- 11) PDV RAŠČLAMBA
CREATE TABLE pdv_raspodjela (
  id                  INTEGER PRIMARY KEY,
  racun_id            INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  kategorija_pdv      TEXT NOT NULL,   -- 'S','Z','E','AE'
  stopa               TEXT NOT NULL,
  oporezivi_iznos     TEXT NOT NULL,
  iznos_poreza        TEXT NOT NULL,
  razlog_izuzeca_vatex TEXT
);
CREATE INDEX ix_pdvrasp_racun ON pdv_raspodjela(racun_id);

-- 12) NAPLATA (eIzvještavanje)
CREATE TABLE naplata (
  id             INTEGER PRIMARY KEY,
  racun_id       INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  datum_naplate  TEXT NOT NULL,
  naplaceni_iznos TEXT NOT NULL,
  nacin_placanja TEXT NOT NULL,        -- 'T','K','O'
  prijavljeno_ts TEXT,                 -- kada je EvidentirajNaplata poslana (do 20. u mj.)
  status         TEXT NOT NULL DEFAULT 'nacrt'
                  CHECK (status IN ('nacrt','poslano','greska')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_naplata_racun ON naplata(racun_id);

-- 13) AUDIT LOG PORUKA (potpisani zahtjev + odgovor)
CREATE TABLE poruka_log (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  racun_id      INTEGER REFERENCES racun(id) ON DELETE SET NULL,
  vrsta_poruke  TEXT NOT NULL
                 CHECK (vrsta_poruke IN
                   ('poslovni_prostor','racun_b2c','eracun','naplata','odbijanje',
                    'isporuka_bez_eracuna')),
  smjer         TEXT NOT NULL CHECK (smjer IN ('zahtjev','odgovor')),
  message_id    TEXT,                  -- UUID id atribut (idempotencija)
  okolina       TEXT NOT NULL CHECK (okolina IN ('test','prod')),
  request_xml   TEXT,
  response_xml  TEXT,
  jir           TEXT,
  sifra_greske  TEXT,
  poruka_greske TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_poruka_tenant   ON poruka_log(tenant_id, created_at);
CREATE INDEX ix_poruka_racun    ON poruka_log(racun_id);
CREATE INDEX ix_poruka_msgid    ON poruka_log(message_id);
```

### 6.1. Ključne invarijante koje aplikacija provodi (ne samo shema)

- **OIB validacija** (mod-11) na `tenant.oib`, `kupac.oib`, `operater.oib_operatera`.
- **Prostor prijavljen prije računa:** `racun` insert dopušten samo ako
  `poslovni_prostor.cis_status = 'prijavljen'` i `datum_pocetka_primjene <= datum računa`.
- **Atomsko numeriranje** kroz `sekvenca` (razina P ili N) — bez rupa, godišnji reset.
- **eRačun samo od `eracun_izdavanje_od`** (2026/2027 ovisno o PDV statusu).
- **KPD obavezan** za stavke eRačuna (`stavka.kpd` NOT NULL na aplikacijskoj razini za B2B/B2G).
- **`utf8mb4`/pun Unicode + sanitizacija ulaza** (lekcija iz FIRA testiranja — emoji su srušili
  njihov backend; SQLite je UTF-8 nativno, ali validirati/normalizirati ulaz).

---

## 7. Mapiranje na naš JSON API (payload = kupac + stavke + tip)

Klijent šalje **minimalni** payload; server rekonstruira sve o izdavatelju iz tenanta (`apiKey`):

```http
POST /api/v1/racun
Authorization: Bearer <API_KEY>            # apiKey => tenant
Content-Type: application/json; charset=utf-8
```

```jsonc
{
  "tip": "FISKALNI_B2C",                    // PONUDA | RACUN | FISKALNI_B2C | ERACUN_B2B | ERACUN_B2G
  "poslovniProstor": "POSL1",               // oznaka; server nađe PP (mora biti 'prijavljen')
  "naplatniUredaj": "2",                    // oznaka NU unutar PP
  "operaterOib": "12345678903",             // -> operater
  "nacinPlacanja": "KARTICA",
  "valuta": "EUR",
  "kupac": {                                // NULL/izostavljen za anon B2C
    "naziv": "Firma d.o.o.",
    "oib": "02994650190",                   // obavezno za ERACUN_B2B/B2G
    "adresa": { "ulica": "Ilica 1", "grad": "Zagreb", "postanskiBroj": "10000", "drzava": "HR" },
    "email": "racuni@firma.hr"
  },
  "stavke": [
    {
      "naziv": "Konzultacije",
      "kolicina": 2,
      "jedinicaMjere": "H87",               // EN16931 unitCode
      "netoCijena": "500.00",
      "pdvStopa": "25",                      // ili decimalni 0.25 -> normalizirati
      "pdvKategorija": "S",
      "kpd": "62.02.30"                      // shema 'CG' se dodaje server-side
    }
  ]
}
```

**Što server radi (server-side, iz tenanta):** dohvat OIB/naziv/adresa/IBAN/PDV status izdavatelja →
dodjela `redni_broj` iz `sekvenca` → sastavljanje `broj_racuna_full` → izračun PDV raščlambe i
`DokumentUkupanIznos` → **ZKI** (RSA-SHA1+MD5) → slanje CIS/PU poruke (potpis RSA-SHA256 za eRačun,
odn. legacy za B2C) → upis **JIR** i `qr_payload` → sve u `poruka_log`.

**Odgovor:**

```jsonc
{
  "brojRacuna": "45/POSL1/2",
  "zki": "4f2a6b3d2c7e9f1a3b4c5d6e7f8a9b0c",
  "jir": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "fiskaliziran",
  "qr": "https://porezna.gov.hr/rn?jir=…&zki=…&datv=…&izns=…"
}
```

> Napomena o dizajnu (iz FIRA reference): `taxRate` po stavci može stići kao decimalni (`0.25`) ili
> postotak (`25`) — API mora **jasno dokumentirati** i normalizirati; stroga zod/valibot shema s
> dobrim porukama grešaka (za razliku od nejasne FIRA tolerancije).

---

## 8. Endpointi (CIS / Porezna uprava)

| Kanal | Okolina | URL |
|---|---|---|
| B2C fiskalizacija (`FiskalizacijaService`) | **Test** | `https://cistest.apis-it.hr:8509/FiskalizacijaServiceEprod` |
| B2C fiskalizacija | **Produkcija** | `https://cis.porezna-uprava.hr:8509/FiskalizacijaService` |
| eRačun / eIzvještavanje (`fin/2024`) | — | SOAP servisi (`eFiskalizacijaService`, `eIzvjestavanjeService`); namespace `http://www.porezna-uprava.gov.hr/fin/2024/...`. **Konkretne prod/test URL adrese verificirati u aktualnoj teh. specifikaciji / FiskAplikaciji prije integracije.** |

Certifikati CIS-a po okolini: prod poslužiteljski `cis.porezna-uprava.hr` / aplikacijski `fiskalcis`;
test `cistest.porezna-uprava.hr` / `fiskalcistest`. Preporuka PU: min. 2 dana stabilnog rada u testnoj
okolini prije produkcije.

---

## 9. Otvorena pitanja / upozorenja

- ⚠️ **Točan ZKI format** (redoslijed polja, format datuma `dd.MM.yyyyTHH:mm:ss`, format iznosa)
  citiran je iz ustaljene prakse Fiskalizacije 1.0; **službeni PDF teh. spec. v2.6 je skeniran**
  (bez tekstualnog sloja) pa nije doslovno potvrđen u ovom istraživanju. **Verificirati na izvoru
  prije koda.**
- ⚠️ **Konkretne test/prod URL adrese za `fin/2024` eRačun/eIzvještavanje servise** nisu bile
  eksplicitno izlistane u dohvaćenom dijelu spec.; tablica 103 pokriva klasični `FiskalizacijaService`.
  Provjeriti u punoj teh. specifikaciji / na fiskalizacija2.hr.
- ⚠️ **RSA-SHA1 + MD5 na Cloudflare Workers:** WebCrypto ne nudi MD5; SHA-1 potpisi su ograničeni.
  Vjerojatno treba čisti-JS MD5 + pažljiv RSA, ili Node „signing sidecar“ (odluka u `11-*`).
- ⚠️ **`identifikatorRacunaZaPlacanje` (IBAN)** je u primjeru `[1,1]` obavezan — potvrditi je li
  obavezan i za sve tipove (npr. gotovinski) ili samo za bezgotovinske eRačune.
- Puni **KPD šifrarnik** i **EN 16931 šifrarnik jedinica mjera / VATEX / UNTDID 1001 / 5305** su u
  dodacima teh. spec. — treba ih uvesti kao referentne tablice (može zaseban dokument `06-*`).

---

## Izvori

- [Zakon o fiskalizaciji, NN 89/2025 (13. 6. 2025.)](https://narodne-novine.nn.hr/clanci/sluzbeni/2025_06_89_1233.html) — temeljni propis; B2C + eRačun B2B/B2G, rokovi. (pristup 2026-07-04)
- [Porezna uprava — Vodič kroz Fiskalizaciju 2.0](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149) — faze 2026/2027, FiskAplikacija, priprema, KPD. (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija računa u krajnjoj potrošnji – B2C (ažur. 5. 1. 2026.)](https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje-azurirano-5-1-2026/8033) — B2C obavezni elementi (JIR/ZKI/QR), svi načini plaćanja, struktura broja računa, prijava poslovnog prostora. (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija 2.0 / eRačun (bezgotovinski računi)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni) — službena ulazna točka. (pristup 2026-07-04)
- [Tehnička specifikacija — Fiskalizacija eRačuna i eIzvještavanje (fiskalizacija2.hr, v1.3, 2025)](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf) — `EvidentirajERacun`/`Naplata`/`Odbijanje`, polja eRačuna, KPD/CG, RSA-SHA256 potpis, endpoint tablica 103, PKI. (pristup 2026-07-04)
- [Ministarstvo financija — Specifikacija osnovne uporabe eRačuna s proširenjima (CIUS)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/183) — HR-CIUS obavezna polja (BT-1, BT-2, HR-BT-2, BT-3, BT-5, BT-27, BT-19…), CustomizationID. (pristup 2026-07-04)
- [Fiskalizacija 2.0 — Rječnik: Identifikatori (JIR, ZKI, ZIR, UUID, QR)](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/identifikatori/) — generiranje i struktura JIR/ZKI, QR kod dimenzije/sadržaj. (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija: Tehnička specifikacija za korisnike v2.6 (B2C)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf) — klasična B2C spec (PoslovniProstor, ZKI, JIR). ⚠️ skenirani PDF bez tekstualnog sloja — sadržaj nije doslovno ekstrahiran. (pristup 2026-07-04)
- [Porezna uprava — Metapodatkovni servis (MPS) / tehnički standardi povezivanja](https://porezna.gov.hr/fiskalizacija/api/dokumenti/104) — pristupne točke, AMS/adresar. (pristup 2026-07-04)
- Lokalna referenca (firsthand): `docs/reference/fira-custom-webshop-api.md` — API dizajn (payload = kupac+stavke+tip; izdavatelj server-side po apiKey), `utf8mb4` lekcija. (pristup 2026-07-04)

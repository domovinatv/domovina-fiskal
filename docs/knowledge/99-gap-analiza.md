# Gap-analiza i kontrola potpunosti

> Stroga kontrola potpunosti baze znanja (`01`–`11` + `reference/`) za `domovina-fiskal`.
> Stanje **2026-07-04**. Ova revizija dodaje **web-verifikaciju** rizičnih tvrdnji
> (primarni izvori: Narodne novine / zakon.hr NN 89/2025, Porezna uprava, tehnička
> spec. v2.6). Statusi: **✅ POTVRĐENO**, **❌ OBORENO / ISPRAVAK**, **⚠️ OTVORENO**.
>
> **Prije implementacije svaku ⚠️ stavku potvrditi na primarnom izvoru; ✅ stavke
> smiju u kod uz naznačeni izvor; ❌ stavke ISPRAVITI u izvornom dokumentu.**

---

## 0. Sažetak web-verifikacije (što je ovim prolazom riješeno)

| Tema | Ishod | Bilješka |
|---|---|---|
| ZKI algoritam (RSA-SHA1 + MD5) | ✅ POTVRĐENO | PU „Zaštitni kod izdavatelja 4616" + spec. v2.6 — točno kako stoji u `02` |
| CIS port `:8449` | ✅ POTVRĐENO | Test `cistest.apis-it.hr:8449`, prod `cis.porezna-uprava.hr:8449` |
| CIS port `:8509` + `/FiskalizacijaServiceEprod` (u `05`) | ❌ OBORENO | Ne postoji u službenoj dokumentaciji — **greška u `05` §8** |
| MIKROeRAČUN 2026 zaprimanje / 2027 izdavanje | ✅ POTVRĐENO | PU 8190 / 8052 / 8047 — razrješava dvojbu iz `01` §2.4 |
| Rokovi eRačuna 2026 (PDV) / 2027 (ne-PDV) | ✅ POTVRĐENO | PU 8047/8048/8149 |
| Fiskalizacija eRačuna „5 radnih dana" | ✅ POTVRĐENO | PU 8049 — izdavatelj (samoizdavanje) i primatelj |
| KPD u UBL-u (`ItemClassificationCode`, `listID="CG"`, 6 znamenki) | ✅ POTVRĐENO | PU + tehnička spec.; **format s/bez točaka još ⚠️** |
| Iznosi kazni NN 89/2025 | ✅ POTVRĐENO + ISPRAVAK | zakon.hr z/3960 — čl. 71/72/73; `01` treba uskladiti (v. R14) |
| Rok naknadne dostave (offline) | ✅ POTVRĐENO | **čl. 21. st. 2. = „dva radna dana"** (v. R15, ispravak `10`) |
| Zabrana rada / pečaćenje | ✅ POTVRĐENO | **čl. 66., najviše 8 dana** — pogodak nagađanja u `01` |
| MD5 na Cloudflare Workers | ✅ POTVRĐENO (u `11`) | ❌ zastarjele tvrdnje u `02`/`05`/`INDEX` (v. §2) |

---

## 1. Rizične / nepotvrđene tvrdnje — tablica verifikacije

Kolone: **tvrdnja | dokument | kako provjeriti | web-nalaz (potvrda/oborenje)**.

| # | Tvrdnja | Dok. | Kako provjeriti | Web-nalaz (2026-07-04) |
|---|---|---|---|---|
| R1 | CIS endpointi `cistest.apis-it.hr:8449/FiskalizacijaServiceTest`, `cis.porezna-uprava.hr:8449/FiskalizacijaService` | 02, 04, 11 | Aktualni WSDL / spec. v2.6 | ✅ **POTVRĐENO** (spec. v2.6, ipos.hr, nticaric). Port `8449` točan. |
| R1b | Alternativni endpoint `cistest.apis-it.hr:8509/FiskalizacijaServiceEprod` i host `cistest.porezna-uprava.hr` | **05 §8** | Isto | ❌ **OBORENO** — takav port/putanja/host **ne postoje** u službenoj dokumentaciji; **greška u `05`**. Koristiti R1. |
| R2 | ZKI = `md5(rsa_sha1(OIB+datVrij+bor+opp+onu+iznos))`, 32 hex lowercase, **SHA1 ne SHA256**; datum u ZKI ima **razmak** `dd.MM.yyyy HH:mm:ss`, u XML `T` | 02, 05, 10 | PU 4616 / spec. v2.6 §12; DEMO `ProvjeraZahtjev` | ✅ **POTVRĐENO** (PU „Zaštitni kod izdavatelja"): RSA-SHA1 potpis → MD5 (RFC 1321) → 32 hex; polja i redoslijed točni. |
| R3 | XML-DSIG: Exclusive C14N + RSA-SHA1 + SHA1 digest; CIS **odgovor** koristi inkluzivni C14N | 02 | Spec. v2.6 §7; test verifikacije odgovora | ✅ Visoka pouzdanost (spec. verbatim); asimetriju C14N potvrditi u DEMO testu (⚠️ empirijski). |
| R4 | Poslužiteljski certifikat CIS-a zamijenjen **12.01.2026.** (test `29.12.2025.`) | 02 | PU obavijest 8137 | ✅ **POTVRĐENO** (PU „Istek poslužiteljskog certifikata u siječnju 2026." 8137). Dohvatiti aktualni CIS javni ključ prije prod. |
| R5 | Rokovi 2.0: PDV izdaju+zaprimaju **1.1.2026.**; ne-PDV zaprimaju 2026., izdaju **1.1.2027.** | 01, 03, 05, 09, 10 | PU 8047/8048/8149 + NN 89/25 | ✅ **POTVRĐENO** (PU 8047/8048). |
| R6 | MIKROeRAČUN 2026 **samo zaprimanje**, izdavanje **od 2027.**; FiskAplikacija = upravljanje/uvid (dvije aplikacije) | 01, 03 | PU 8190/8052/8047 | ✅ **POTVRĐENO** — MIKROeRAČUN 2026 zaprimanje+fiskalizacija primitka, **izdavanje od 1.1.2027.**; razrješava „nekonzistentnost" iz `01` §2.4. |
| R7 | eIzvještavanje o naplati **do 20. u mjesecu**; fiskalizacija eRačuna **≤5 radnih dana** | 01, 03, 05 | PU 8049/8051 | ✅ **POTVRĐENO** (PU 8049): izdavatelj u trenutku izdavanja (samoizdavanje ≤5 r.d.), primatelj ≤5 r.d. od primitka. „Do 20." — PU 8051. |
| R8 | KPD u UBL-u: `cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode`, `listID="CG"`, **6 znamenki** | 03, 05, 06 | HR CIUS (dokumenti/99) + Validator | ✅ **POTVRĐENO** (shema **CG**, min. 6 znamenki, obavezno osim za predujam/odobrenja). ⚠️ **Otvoreno: format s točkama (`52.10.00`) vs bez (`521000`)** — spec. traži „šesteroznamenkasti numerički" → vjerojatno **bez točaka**; potvrditi u CIUS-u/Validatoru. |
| R9 | AS4/ebMS3 profil + XAdES potpis eRačuna (RSA-SHA256) | 03, 05, 11 | PU „Pristupna točka i AS4 profil" (dokumenti/…) | ⚠️ **OTVORENO** — profil realan (Peppol AS4), ali **točna XAdES razina** i detalji nisu verificirani iz primarnog PU dokumenta. |
| R10 | Odnos domaći MPS/AMS ↔ Peppol SMP/SML (je li domaći promet obavezno preko Peppol-a) | 03 | PU „Adresar (AMS)" + „MPS" | ⚠️ **OTVORENO** — nije razriješeno; EU stranica i PU se čitaju različito. Povući primarne PU dokumente. |
| R11 | Cloudflare Workers: **MD5 dostupan**, `node:crypto` pun uz `nodejs_compat`, mTLS binding **statičan** (nije per-tenant) | 11 | developers.cloudflare.com | ✅ **POTVRĐENO u `11`** (revizija). ❌ **`02`/`05`/`INDEX` još tvrde suprotno** (v. §2). |
| R12 | QR `izn` = iznos u **centima**, cijeli broj, bez separatora/vodećih nula, `-` za storno; host `porezna.gov.hr/rn` | 02, 09 | Spec. v2.6 §2.7 | ✅ Visoka pouzdanost (spec.); host i format potvrđeni u `02`/`09`. ⚠️ Naziv polja: `02`/`09` = `izn`, **`05` §7 koristi `izns`** — uskladiti (v. §2). |
| R13 | Način plaćanja `C` (ček) **ukinut od 01.09.2025.** → dozvoljeni `G/K/T/O` | 02, 01 | Spec. v2.6 / HOK | ✅ Potvrđeno u `01`/`02`. ❌ **`06` §5.1 i `09` §2 još navode `C` kao važeći** (v. §2). |
| R14 | Iznosi kazni (okvirno): teži ~3.980–66.360 € (PO), lakši ~1.320–26.540 € (PO), kupac 30–260 €; čl. 71.–73., zabrana rada čl. 66. | 01 | NN 89/25 / zakon.hr z/3960 | ✅ **POTVRĐENO + ISPRAVAK** (zakon.hr): **čl. 71.** PO 3.980–66.360 / odg **660**–6.630 / fiz 3.980–39.810; **čl. 72.** PO 2.650–66.360 / odg **390**–6.630 / fiz 1.320–39.810 (+ponovljeni); **čl. 73.** PO 1.320–26.540 / odg 260–2.650 / fiz 660–13.270 / **kupac 30–260**; **zabrana rada čl. 66., najviše 8 dana** (pečaćenje). `01` je zbrojio 71/72/73 u dva reda i ima nepreciznu vrijednost za odgovornu osobu — **uskladiti**. |
| R15 | Rok naknadne dostave (offline) — 2 dana/48h; točan rok po NN 89/25 | 02, 10 | NN 89/25 | ✅ **POTVRĐENO**: **čl. 21. st. 2. — „dva radna dana"** od prekida veze. ❌ `10` §4.1 kaže „dva **kalendarska** dana" — **ispravak na „radna dana"**. |
| R16 | Prag ulaska u sustav PDV-a 100.000 €; tekst oslobođenja malog obveznika **čl. 90. st. 1.** | 06, 10 | Zakon o PDV-u | ⚠️ **DJELOMIČNO** — `10` §7.2 tvrdi čl. 90. **st. 1.**, `01` §4.1/`06` spominju čl. 90. **st. 2.** — **razriješiti točan stavak** u važećem Zakonu o PDV-u (interna nekonzistentnost). |
| R17 | eRačun fiskalizacijska poruka: namespace `http://www.porezna-uprava.gov.hr/fin/2024/types/eFiskalizacija`, elementi `EvidentirajERacun`/`EvidentirajNaplatu`/`EvidentirajOdbijanje` | 05, 08 | PU „Tehnička spec. Fiskalizacija eRačuna i eIzvještavanje" | ⚠️ **OTVORENO** — nazivi iz vendor-mirrora (fiskalizacija2.hr) i `shunkica/fiskalizacija2-js`; **verificirati točan namespace/elemente iz primarnog PU dokumenta** prije koda. |
| R18 | `jedinicaMjere` u fiskalizacijskoj poruci = numerička šifra (`10`) vs UN/ECE Rec 20 kod (`H87`) u UBL-u | 05, 06 | Tehnička spec. + CIUS | ⚠️ **OTVORENO** — `05` primjer koristi `<jedinicaMjere>10</jedinicaMjere>`, `06` propisuje UN/ECE Rec 20 (`H87`/`C62`). Provjeriti koristi li fiskalizacijska poruka **drugu kodnu listu** od UBL-a. |

---

## 2. Proturječja / nekonzistentnosti između dokumenata

**P1 — CIS port i host (KRITIČNO).**
`02`, `04`, `11`, `INDEX` i destilat: **`:8449`**, host test `cistest.apis-it.hr`.
`05` §8: **`:8509`**, putanja `/FiskalizacijaServiceEprod`, host test `cistest.porezna-uprava.hr`.
→ Web-nalaz: **`:8449` je točan**; `05` §8 sadrži **grešku** (i port i putanja i host). **Ispraviti `05`.**

**P2 — MD5 / `node:crypto` na Workers (KRITIČNO za arhitekturu).**
`11` (revizija, web-provjereno): **MD5 je podržan**, pun `node:crypto` uz `nodejs_compat`.
`02` §2.4/§11, `05` §4.1/§9, `INDEX` destilat: još tvrde **„WebCrypto nema MD5"** / „treba JS-MD5" / „sidecar jer nema MD5".
→ **Zastarjelo nakon `11`.** Uskladiti `02`, `05`, `INDEX` s nalazom da kripto **više nije razlog za sidecar** (ostaje samo uvjetni mTLS + sigurnosni izbor).

**P3 — Način plaćanja `C` (ček).**
`01`/`02`: `C` **ukinut od 01.09.2025.** → `G/K/T/O`.
`06` §5.1: navodi `G/K/C/T/O` kao fiksni skup „koji se ne mogu mijenjati"; `06` §5.3 i `09` §2 tablica također navode `C`.
→ Proturječje. **Ispraviti `06`/`09`** (za B2C od 01.09.2025. `C` se ne smije koristiti); `C` ostaje samo kao povijesna napomena.

**P4 — Naknadna dostava: kalendarski vs radni dani.**
`10` §4.1: „dva **kalendarska** dana". Web: **čl. 21. st. 2. = „dva radna dana"**. → **Ispraviti `10`.**

**P5 — Iznosi kazni + broj članka za odgovornu osobu.**
`01` §2.9 daje odgovornu osobu „~660–6.630 €" (to je čl. 71.), ali za **čl. 72.** je **390–6.630 €**; `01` također ne razdvaja čl. 71./72./73. → **Uskladiti `01`** s razdvojenim člancima (v. R14).

**P6 — Tekst oslobođenja malog obveznika (čl. 90. st. 1. vs st. 2.).**
`10` §7.2 = st. 1.; `01` §4.1 i `06` = st. 2. → interna nekonzistentnost; **razriješiti točan stavak.**

**P7 — QR polje iznosa: `izn` vs `izns`.**
`02`/`09` koriste `izn`; `05` §7 (primjer odgovora) koristi `izns`. → Uskladiti (spec. koristi **`izn`**).

**P8 — KPD format (s točkama vs bez).**
`03` (`62.01.11`), `05` (`11.07.01`), `06` (`52.10.00`, „točke prezentacijske") — svi s točkama; službena spec. traži „šesteroznamenkasti numerički". → **Potvrditi točan zapis u CIUS/Validatoru** prije koda (P8 = otvoreno, ne kontradikcija u zaključku nego u primjerima).

**P9 — Konceptualna (dobro označena, ali NAJVEĆI izvor zabune).**
Dvije odvojene staze: **B2C 1.0** (ZKI/JIR/QR, CIS SOAP `fin/2012`) vs **B2B/B2G 2.0** (eRačun, bez ZKI/JIR/QR, `fin/2024` + AS4). Konzistentno kroz `02`/`03`/`05`/`10`/`11`, ali kod **mora** imati dvije staze — ne miješati.

**P10 — `f73` verzija sheme.**
`02` koristi `.../types/f73` uz napomenu da se sufiks mijenja po verziji. **Ne hardkodirati** — čitati iz aktualnog WSDL/XSD.

---

## 3. Nedostaci po dokumentu

| Dok. | Što nedostaje / preplitko |
|---|---|
| 01 | Precizni **iznosi kazni po člancima** (sad dostupni — v. R14, ugraditi); točan **stavak čl. 90.** za oslobođenje; brojevi članaka za obveznika/iznimke/obavijest kupcu (dio potvrđen: kazne 71–73, zabrana 66, naknadna dostava 21). |
| 02 | Uskladiti **MD5/Workers** tvrdnju s `11`; element-po-element XSD za `PromijeniNacPlac*` i prijavu **poslovnog prostora** (root u aktualnom `f73`); točna **min. TLS verzija**; potvrda je li **transportni mTLS obavezan** (DEMO test). |
| 03 | **Stvarna XML shema fiskalizacijske poruke 2.0** (samo opisno); konkretni **PTS/prod endpointi** (`fin/2024`); XAdES razina; odnos MPS/AMS↔Peppol (R9/R10). |
| 04 | Točan **produkcijski CA** (Fina RDC 2015 vs 2020, ovisi o datumu izdavanja certa); potvrda **trajanja demo certa** (2 god.); je li „fiskalcistest" naziv servisa a ne proizvoda. |
| 05 | ❌ **Ispraviti endpoint `:8509`/host** (§8, v. P1); uskladiti **MD5/Workers** (§4.1/§9); verificirati **`fin/2024` namespace** (R17) i **`jedinicaMjere`** kodnu listu (R18); mapiranje svih EN 16931 obveznih BT elemenata. |
| 06 | ❌ **Ukloniti `C` iz važećih načina plaćanja** (P3); normativno mapiranje **HR PDV oslobođenja → VATEX-EU**; točan skup **VAT category** kodova koje HR CIUS dopušta; **H87 vs C62** za „komad"; točan **stavak čl. 90.** |
| 07 | DE/AT cjenik FIRA-e; verifikacija cijena konkurenata; nebitno za implementaciju (kompetitivni doc). |
| 08 | Zreo **.NET klijent za 2.0** (ne postoji); doseg `shunkica/fiskalizacija2-js`; javni OSS klijent za **FINA/MeR eRačun API**; licenca `kodmasin/fiskpy` (NOASSERTION). |
| 09 | ❌ **`C` u tablici načina plaćanja** (P3); točan prag **pojednostavljenog računa** (čl. 79. st. 5–7.); je li **SMS provjera** još aktivna (vjerojatno ne); CIUS zahtjevi za vizualizaciju eRačuna. |
| 10 | ❌ **„kalendarska" → „radna" dana** (§4.1, P4); potpuni offline-režim za **2.0** (ne pretpostavljati 48h prozor); potvrditi **st. 1. vs st. 2.** čl. 90. |
| 11 | Uglavnom kompletan (web-provjeren); ostaje empirijska potvrda **exc-C14N u Workers runtimeu** i **je li transportni mTLS obavezan** (odlučuje treba li sidecar). |
| INDEX | Destilat §„Arhitektonska odluka" i §„Certifikati" tvrde **„WebCrypto nema MD5" / „hibrid nužan"** — **zastarjelo**, uskladiti s `11` (Workers-first, uvjetni sidecar). |

---

## 4. Prioritetna pitanja za korisnika (Matija)

1. **Opseg MVP-a — što prvo?**
   - (a) samo **B2C fiskalizacija 1.0** (CIS SOAP, ZKI/JIR/QR) — jasna, stabilna spec., ali traži POS/blagajnu;
   - (b) **eRačun preko posrednika** (FINA / Moj-eRačun API) — bliže FIRA modelu i tvom `fira-forms-connector` slučaju, brže do vrijednosti;
   - (c) oboje odmah.
   *Preporuka: **(b) preko posrednika** za izdavanje + **(a) B2C** kad zatreba blagajna. Vidi §5.*

2. **Vlastita Pristupna točka vs posrednik.** Želiš li proći **Završno testiranje / certifikaciju PT-a na PTS-u** (veći trud, puna kontrola, ti si posrednik, treba AS4 stack — realno **Java servis** `phase4`/Domibus) ili se osloniti na **postojećeg posrednika** (REST/HTTPS iz Workera, bez AS4, bez certifikacije)?
   *Preporuka: **posrednik** za fazu 1; vlastita PT tek ako postane poslovni cilj.*

3. **Hosting (uvjetnog) sidecara.** Mac Mini (kao `pipeline.domovina.ai` bridge) ili **VPS 24/7**? Async naknadna dostava (JIR nakon offline-a) traži da komponenta bude dostupna i noću → **VPS robusniji**. NB: nakon `11` sidecar je potreban **samo** ako (i) transportni mTLS je obavezan **ili** (ii) iz sigurnosnih razloga ne želimo dešifrirati ključ na edge-u.

4. **Izbor CA.** FINA („fiskal" aplikacijski cert, ~49,78 € prvi put) ili **AKD/Certilia** (20 € + PDV, jeftinije, digitalniji onboarding)? Za razvoj krećemo **besplatnim FINA DEMO** certom neovisno o prod izboru. Od 01.09.2025. dopušten je bilo koji HR QTSP uz OIB.

5. **Baza: D1 (SQLite) vs Postgres.** D1 je dovoljan za MVP i uklapa se u Worker stack (`05` shema je pisana za D1). Postgres (+Hyperdrive) ako preraste ili zbog složenijih izvještaja/analitike. **Osjetljivi podaci (enkriptirani certifikati) rade jednako na oba.**
   *Preporuka: **D1 za MVP**, migracija na Postgres kao svjesna kasnija odluka; shemu držati portabilnom (`05` §6 već daje Postgres napomene).*

6. **Onboarding certifikata (multi-tenant).** Kako tenant uploada **P12 + lozinku** (admin UI), envelope-enkripcija at-rest, i **smijemo li dešifrirati privatni ključ na edge-u** (`11` §4-B) ili inzistiramo na sidecaru (`11` §4-A)? Ovo je **sigurnosni**, ne više tehnički izbor.

---

## 5. Preporučeni redoslijed implementacije

1. **Temelji.** Worker + Hono + D1 skela (uzor `pipeline.domovina.ai`), multi-tenant API ključ (hashiran), podatkovni model iz `05` (migracije `000X_*.sql`), admin skela (Basic Auth, server-rendered HTML), stroga **zod/valibot** validacija JSON API-ja (dizajn iz `fira-custom-webshop-api.md`, ali stroži; `utf8mb4`/pun Unicode).

2. **Ne-fiskalni dokumenti (vrijednost bez certifikata).** Izdavanje `PONUDA`/`RAČUN` → PDF (`09`, `pdf-lib`) + QR (čisti JS) + e-mail (SPF/DKIM/DMARC). Kao FIRA `PONUDA` za setup.

3. **eRačun 2.0 preko posrednika (preporučena prva fiskalna vrijednost).** UBL 2.1 (HR CIUS, `CustomizationID`, **KPD `listID="CG"` 6 znamenki**) + poziv posrednika (REST/HTTPS iz Workera) + fiskalizacijska poruka + eIzvještavanje (`03`, `05`, `06`). **Prvo verificirati `fin/2024` namespace/shemu iz primarnog PU dokumenta (R17).**

4. **B2C fiskalizacija 1.0 (kad zatreba blagajna).** ZKI (RSASSA-PKCS1-v1_5+SHA-1 → MD5, **na Workeru** po `11`) + XML-DSIG (exc-C14N/RSA-SHA1/SHA1) + SOAP `RacunZahtjev` na **CIS TEST `:8449`** s DEMO certom; `EchoRequest` → `RacunZahtjev` → JIR. **Prvo empirijski utvrditi je li transportni mTLS obavezan** — odlučuje treba li sidecar. Async queue + naknadna dostava (`NakDost=true`, novi `IdPoruke`, rok **2 radna dana**).

5. **Edge-caseovi (`10`).** OIB (ISO 7064 MOD 11,10), storno/odobrenje (380/381/383/384/386, referenca BT-25), zaokruživanje (po VAT-breakdown skupini, BT-114), reverse charge (AE), ne-PDV (čl. 90.), avansi (BT-112/113/115), valuta/HNB tečaj.

6. **(Opcionalno) vlastita Pristupna točka.** AS4 (`phase4`/Domibus, zaseban Java servis) + MPS/AMS + **Završno testiranje na PTS-u** + potvrda o sukladnosti.

**Preduvjeti prije faze 4/5 (blokeri):** ispraviti `05` §8 endpoint (P1), uskladiti MD5/Workers (P2), riješiti `C` (P3), potvrditi KPD format (P8), `fin/2024` shemu (R17).

---

## Izvori

> Datum pristupa svih izvora: **2026-07-04**.

**Primarni pravni / Porezna uprava:**
- [Narodne novine — Zakon o fiskalizaciji, NN 89/2025](https://narodne-novine.nn.hr/clanci/sluzbeni/2025_06_89_1233.html) — temeljni akt
- [zakon.hr — Zakon o fiskalizaciji (z/3960)](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — pročišćeni tekst; **kazne čl. 71.–73., zabrana rada čl. 66., naknadna dostava čl. 21. st. 2.**
- [PU — Izdavanje i primanje eRačuna i fiskalizacija eRačuna (8047)](https://porezna-uprava.gov.hr/hr/izdavanje-i-primanje-eracuna-i-fiskalizacija-eracuna/8047) — MIKROeRAČUN 2026/2027, „5 radnih dana"
- [PU — MIKROeRAČUN (8190)](https://porezna-uprava.gov.hr/8190) i [MIKROeRAČUN / FiskAplikacija (8052)](https://porezna-uprava.gov.hr/hr/fiskaplikacija-mikroeracun-i-ostalo/8052) — 2026 zaprimanje, 2027 izdavanje
- [PU — Fiskalizacija eRačuna (8049)](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-azurirano-17-4-2026/8049) — rok 5 radnih dana (izdavatelj/primatelj)
- [PU — Izvještajni sustav / eIzvještavanje (8051)](https://porezna-uprava.gov.hr/hr/izvjestajni-sustav/8051) — naplata do 20. u mjesecu
- [PU — Izdavatelji i primatelji eRačuna (8048)](https://porezna-uprava.gov.hr/hr/izdavatelji-i-primatelji-eracuna-te-obveza-izdavanja-eracuna-azurirano-7-11-2025/8048) — rokovi 2026/2027
- [PU — Zaštitni kod izdavatelja računa (4616)](https://porezna-uprava.gov.hr/hr/zastitni-kod-izdavatelja-racuna/4616) — ZKI: RSA-SHA1 + MD5, 32 hex
- [PU — Istek poslužiteljskog certifikata u siječnju 2026. (8137)](https://porezna-uprava.gov.hr/hr/istek-posluziteljskog-certifikata-u-sijecnju-2026-godine/8137) — zamjena CIS certa 12.01.2026.
- [PU — Klasifikacija proizvoda (KPD 2025.) (7718)](https://porezna-uprava.gov.hr/hr/klasifikacija-proizvoda-kpd-2025/7718) i [Klasifikacija roba i usluga u eRačunu](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/klasifikacija-roba-i-usluga-u-eracunu) — KPD `listID="CG"`, min. 6 znamenki
- [PU — Fiskalizacija: Tehnička specifikacija za korisnike v2.6 (PDF)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf) — endpoint `:8449`, ZKI, XML-DSIG, QR
- [Tehnička specifikacija Fiskalizacija eRačuna i eIzvještavanje (vendor mirror, fiskalizacija2.hr)](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf) — KPD/CG, elementi 2.0

**Sekundarni / kontekst:**
- [Bilić savjetovanje — Zakon o fiskalizaciji (NN 89/2025)](https://bilic-savjetovanje.hr/novosti/zakon-o-fiskalizaciji-nn-89-2025/) — kontekst kazni
- [Fina — Ključne promjene uz e-račune od 2026.](https://www.fina.hr/novosti/kljucne-promjene-koje-ocekuju-obrtnike-uz-e-racune-od-sljedece-godine) — MIKROeRAČUN, obrtnici
- [Minimax — Fiskalizacija 2.0: KPD](https://help.minimax.hr/help/fiskalizacija-20-klasifikacija-proizvoda-po-djelatnostima-kpd) — KPD u praksi
- [ipos.hr — Postavke fiskalizacije](https://www.ipos.hr/webhelp2/Content/92_Prekidaci/ID920010022%20Prekidaci%20fiskalizacija.htm) — endpoint `:8449` (potvrda)
- [github.com/nticaric/fiskalizacija](https://github.com/nticaric/fiskalizacija) — referentna ZKI/CIS implementacija (endpoint, algoritam)

**Interni dokumenti (osnova):** `01`–`11` + `docs/reference/fira-custom-webshop-api.md`, `docs/reference/lokalni-artefakti.md`.

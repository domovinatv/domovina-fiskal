# 10 — Edge-caseovi, validacije i poslovna pravila

> Stanje na dan **2026-07-04**. Fiskalizacija 2.0 / eRačun je na snazi od **1. 1. 2026.** za
> obveznike u sustavu PDV-a (slanje + zaprimanje) i za sve za zaprimanje; slanje za ne-PDV
> obveznike i proračun kreće **1. 1. 2027.** Fiskalizacija 1.0 (B2C, krajnja potrošnja) i dalje
> postoji, ali od 1. 1. 2026. proširena je na **sve načine plaćanja** (ne samo gotovinu).
>
> Ovaj dokument je operativna referenca za implementaciju validacija i poslovnih pravila u
> našem open-source fiskalizacijskom servisu. Svaki edge-case ima: **pravilo → izvor → kako
> ga tretira naš sustav**. Gdje je nešto nesigurno ili proturječno, eksplicitno je označeno
> ⚠️ **UPOZORENJE**.

---

## 1. Validacija OIB-a (ISO 7064, MOD 11,10 — hibridni sustav)

### 1.1. Pravilo

OIB ima **11 znamenaka**; posljednja (11.) je **kontrolna znamenka** izračunata iz prvih 10
prema međunarodnoj normi **ISO 7064, MOD 11,10** (tzv. hibridni sustav). Izvor algoritma je
službena uputa REGOS-a "KONTROLA OIB-a (ISO7064, MOD 11,10 – Hibridni sistem)".

### 1.2. Točan postupak (iz službene REGOS upute, doslovno)

1. Prva znamenka **zbroji se s brojem 10**.
2. Dobiveni zbroj **cjelobrojno (s ostatkom) podijeli se s 10**; ako je ostatak **0**,
   zamijeni se s **10** (taj broj je "međuostatak").
3. Međuostatak se **pomnoži s 2**.
4. Umnožak se **cjelobrojno podijeli s 11**; ovaj ostatak matematički nikad ne može biti 0
   (rezultat prethodnog koraka je uvijek paran).
5. Sljedeća znamenka **zbroji se s ostatkom iz koraka 4**.
6. Ponavljaju se koraci 2–5 dok se ne potroše sve znamenke (prvih 10).
7. Kontrolna znamenka = **11 − (ostatak iz zadnjeg koraka)**; ako je ostatak **1**, kontrolna
   znamenka je **0** (jer 11−1=10, a 10 ima dvije znamenke).

### 1.3. Radni primjer (iz službene upute) — OIB `69435151530`

Provjeravamo prvih 10 znamenaka `6943515153`, očekivana kontrolna znamenka je `0`.

| korak | znamenka | c = znamenka + ostatak(prošli) / +10 (korak 1) | d = c mod 10 (0→10) | e = d×2 | ostatak = e mod 11 |
|------:|:--------:|:--:|:--:|:--:|:--:|
| 1 | 6 | 16 | 6 | 12 | 1 |
| 2 | 9 | 10 | 10 | 20 | 9 |
| 3 | 4 | 13 | 3 | 6 | 6 |
| 4 | 3 | 9 | 9 | 18 | 7 |
| 5 | 5 | 12 | 2 | 4 | 4 |
| 6 | 1 | 5 | 5 | 10 | 10 |
| 7 | 5 | 15 | 5 | 10 | 10 |
| 8 | 1 | 11 | 1 | 2 | 2 |
| 9 | 5 | 7 | 7 | 14 | 3 |
| 10 | 3 | 6 | 6 | 12 | 1 |

Zadnji ostatak = **1** ⇒ 11 − 1 = 10 ⇒ kontrolna znamenka = **0**. ✔ OIB je ispravan.

### 1.4. Referentna implementacija (TypeScript)

```ts
/** Validacija hrvatskog OIB-a: ISO 7064 MOD 11,10 (hibridni). */
export function isValidOIB(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;         // točno 11 znamenaka
  let ostatak = 10;                                 // "međudodatak" za 1. korak
  for (let i = 0; i < 10; i++) {
    let c = (oib.charCodeAt(i) - 48) + ostatak;      // korak: znamenka + prethodni ostatak
    c = c % 10;                                       // mod 10
    if (c === 0) c = 10;                              // 0 -> 10
    c = (c * 2) % 11;                                 // ×2, mod 11
    ostatak = c;
  }
  const kontrolna = (11 - ostatak) % 10;             // ako je ostatak 1 -> 0
  return kontrolna === (oib.charCodeAt(10) - 48);
}
```

> Napomena: `(11 - ostatak) % 10` elegantno pokriva slučaj ostatak=1 (→ 10 % 10 = 0). Za sve
> ostale ostatke (2..10) `11 - ostatak` je u rasponu 1..9, a `% 10` ga ne mijenja.

### 1.5. Kako ga tretira naš sustav

- OIB izdavatelja: **server-side** (vezan na tenant/API-ključ, po uzoru na FIRA model — vidi
  `docs/reference/fira-custom-webshop-api.md`). Validira se jednom pri registraciji tenanta.
- OIB kupca (`billingAddress.oib`): validira se **na ulazu** (zod/valibot custom refine s
  `isValidOIB`). Prazan/nepostojeći OIB dopušten je za B2C krajnjeg potrošača (fizička osoba
  bez OIB-a na računu); OBAVEZAN za B2B/R1 i za eRačun (gdje je primatelj poslovni subjekt).
- ⚠️ **UPOZORENJE:** matematički ispravan OIB **nije** dokaz da OIB postoji/aktivan je.
  Postojanje se provjerava zasebno (npr. javni upit OIB-a / VIES za EU VAT). Sintaktička
  validacija ≠ provjera stvarnog postojanja.

**Izvori:** REGOS uputa (PDF), Zakon o OIB-u.

---

## 2. Storniranje i ispravak računa (storno, odobrenje, negativni računi, veza na original)

### 2.1. Temeljno pravilo (Fiskalizacija 1.0 / B2C)

Račun se stornira kad sadrži pogrešne podatke ili kod povrata novca kupcu. **Original se NE
briše** — izdaje se **novi** dokument (storno) s **negativnim (suprotnim) predznakom** iznosa.
Storno se **mora fiskalizirati** kao i svaki račun; "sve obveze propisane za izdavanje računa
na odgovarajući način primjenjuju se i kod izdavanja računa za storniranje" (mišljenje PU,
20. 8. 2013.).

Fiskalizacija po računu s **negativnim predznakom je moguća** — CIS to prihvaća.

⚠️ **Bitno (1.0 mehanika):** svaki fiskalizirani račun (i original i storno) dobiva **vlastiti
novi JIR**. U fiskalizacijskoj poruci 1.0 **ne postoji strukturno polje "veza na originalni
JIR"**. Povezanost originala i storna vodi se **knjigovodstveno** (obveznik mora evidentirati
vezu). U CIS-u su to dva zasebna računa čiji zbroj iznosa = 0,00.

### 2.2. Fiskalizacija 2.0 (eRačun, B2B/B2G) — ispravci kroz vrste dokumenata

U eRačunu (EN 16931 / UBL / CII) ispravak se radi strukturirano preko **vrste dokumenta**
(kod `BT-3`, UNTDID 1001):

| Kod | Vrsta (HR) | Predznak | Namjena |
|----:|:-----------|:--------:|:--------|
| **380** | Komercijalni račun | + | Redovni račun |
| **381** | Knjižno odobrenje (credit note) | **uvijek −** | Umanjenje/odobrenje kupcu |
| **383** | Knjižno terećenje (debit note) | + | Dodatno terećenje kupca |
| **384** | Ispravak računa (corrected invoice) | ± | Zamjena/ispravak referenciranog računa |
| **386** | Račun za predujam (prepayment) | + | Avansni račun |

Za razliku od 1.0, u eRačunu **postoji strukturna referenca** na prethodni dokument
(`BT-25 Preceding invoice reference` / `BG-3`). **Svaki eRačun može imati N referenci** na
prethodne eRačune; ako se referenca odnosi na cijelu poslovnu godinu, dopušteno je referirati
pojedine račune (npr. prvi i posljednji račun u godini) — izvor: PU, "Fiskalizacija 2.0 –
primjeri i način postupanja", 24. 11. 2025.

⚠️ **Ključno pravilo za 381:** "Svi podaci o iznosima koji se dostavljaju u Sustav za
fiskalizaciju za vrstu dokumenta **381 – knjižno odobrenje uvijek se smatraju negativnim** te
za tu vrstu dokumenta **nije moguće napraviti storno** dokument koji bi imao vrstu 381."
(izvor: isti PU dokument). Dakle: ne stornira se odobrenje odobrenjem.

### 2.3. Storno vs. odobrenje — razlika

- **Storno (384 / negativni 380):** poništava **cijeli** pogrešni račun; koristi se kad je
  original pogrešan (krivi kupac, krivi iznos, dupli račun).
- **Knjižno odobrenje (381):** ne poništava original nego **umanjuje** potraživanje (naknadni
  rabat, povrat dijela robe, reklamacija). Stvara kod primatelja **preplaćeni iznos** koji se
  može iskoristiti za buduće račune (vidi §6 o naplati).

### 2.4. Kako ga tretira naš sustav

- Model dokumenta ima obavezno polje `documentType` (enum: `380|381|383|384|386`) i
  opcionalno-obavezno `precedingReferences[]` (za 381/383/384 **obavezno** barem 1 referenca).
- Za tip **381** namećemo invariantu: svi iznosi negativni; zabranjujemo `precedingReferences`
  koje pokazuju na drugo 381 kao "storno odobrenja".
- Za B2C 1.0 storno: generiramo novi račun s negativnim stavkama, tražimo ZKI+JIR, a vezu na
  original vodimo interno u D1 (`storno_of_invoice_id`) jer je CIS ne pamti strukturno.
- Uvijek čuvamo **immutable** original (nikad update/delete) — ispravak = novi zapis.

**Izvori:** PU mišljenje 1466 (storno), PU "F2 primjeri" 24. 11. 2025., MF specifikacija
eRačuna (UNTDID 1001 kodovi).

---

## 3. Naknadno izdani / ispravljeni računi

### 3.1. Pravilo

- Ispravak izdanog računa u sljedećem poreznom razdoblju radi se **odobrenjem/terećenjem** s
  referencom na original (ne mijenja se original retroaktivno).
- Kod eRačuna ispravak je novi dokument (381/383/384) s `BT-25` referencom; PU ga povezuje s
  izvornim eRačunom automatski.
- Rok izdavanja računa: općenito **bez odgode po isporuci**; za oslobođene isporuke unutar EU
  i usluge poreznim obveznicima iz drugih DČ najkasnije **15. dana u mjesecu nakon** mjeseca
  isporuke (Pravilnik o PDV-u; PU uputa 1484). Za B2C fiskalni račun — u trenutku isporuke.

### 3.2. Kako ga tretira naš sustav

- API prima `issueDate` i `deliveryDate/servicePeriod`; validiramo da issueDate nije u
  budućnosti i (za EU oslobođenja) upozoravamo ako je > 15. dana idućeg mjeseca.
- Naknadni ispravci idu isključivo kao novi dokument s obaveznom referencom.

**Izvori:** PU uputa 1484, Pravilnik o PDV-u.

---

## 4. Offline / nedostupnost CIS-a (izdaj sa ZKI bez JIR-a, dostavi naknadno)

### 4.1. Pravilo

Ako CIS/veza nije dostupna, račun se **izdaje s upisanim ZKI-jem** (zaštitni kod izdavatelja —
lokalno izračunat), **bez JIR-a** (jer JIR dodjeljuje CIS). Obveznik je dužan **naknadno**
uspostaviti vezu i dostaviti sve račune bez JIR-a.

**Rok = 2 dana / 48 sati**, tumačen **u korist obveznika**: ako danas nastane račun bez JIR-a,
rok počinje teći od **kraja tekućeg dana (00:00 sljedećeg dana)**, tj. račun mora biti ovjeren
u roku **sljedeća dva kalendarska dana**. Nakon dostave CIS svim računima dodjeljuje JIR i
elektronički ih vraća obvezniku. (Izvor: PU Tehnička specifikacija; PU FAQ.)

⚠️ **UPOZORENJE (1.0 vs 2.0):** Gornji "48h/ZKI bez JIR-a" mehanizam je **klasična
Fiskalizacija 1.0** logika (B2C). Za **B2C od 1. 1. 2026.** ostaje ZKI + naknadna dostava
kada nema veze. Za **Fiskalizaciju 2.0 (eRačun)** model je drukčiji — fiskalizacijska poruka
(izdavanja i zaprimanja) šalje se uz razmjenu eRačuna, a postoje odvojena pravila i rokovi
eIzvještavanja. Točan offline-režim za 2.0 potvrditi u aktualnoj Tehničkoj specifikaciji
"Fiskalizacija eRačuna i eIzvještavanje" — **ne pretpostavljati identičan 48h prozor**.

### 4.2. ZKI (podsjetnik — detalji u `docs/knowledge/02-*`)

ZKI = **RSA-SHA1 potpis** konkateniranih polja (OIB, datum/vrijeme, broj računa, oznaka
poslovnog prostora, oznaka naplatnog uređaja, ukupni iznos), a rezultat se sažme **MD5 → hex
(32 znaka)**. ZKI se računa **lokalno privatnim ključem certifikata** i može se izdati offline
(ne treba CIS). To je razlika prema JIR-u.

⚠️ Ne izmišljati redoslijed polja — koristiti točan redoslijed iz Tehničke specifikacije
(vidi `docs/knowledge/02-*`).

### 4.3. Kako ga tretira naš sustav

- Uvijek prvo izračunamo **ZKI lokalno**; slanje CIS-u je zaseban korak.
- Ako CIS vrati grešku/timeout: račun se sprema sa statusom `PENDING_JIR`, ZKI je već upisan,
  račun je pravno izdan. Cron sweep (po uzoru na `pipeline.domovina.ai`) periodički
  **re-tryja** dostavu do dobivanja JIR-a; alarm ako se približi 48h.
- Log i UI na hrvatskom; jasno razlikujemo `zki_ok / jir_pending / jir_ok / jir_failed`.

**Izvori:** PU Tehnička specifikacija za korisnike (v2.x), PU FAQ (48h tumačenje),
lokalni artefakti (`docs/reference/lokalni-artefakti.md`).

---

## 5. Zaokruživanje (2 decimale, EUR, PDV po stopi vs. po stavci)

### 5.1. Pravila

- Svi iznosi na računu su u **EUR**, na **2 decimale** (točnost 1 cent).
- Osnovno matematičko zaokruživanje: 3. decimala < 5 ⇒ 2. decimala nepromijenjena; 3. decimala
  ≥ 5 ⇒ 2. decimala +1 (half-up). Izvor za EUR pravila: Zakon o uvođenju eura (pravila
  preračunavanja i zaokruživanja — 5 decimala fiksnog tečaja, zaokruženje na 2).
- **PDV se razvrstava i zbraja po poreznoj stopi** (25 %, 13 %, 5 %, 0 %, oslobođeno). U
  fiskalizacijskoj poruci iznos je "razvrstan po poreznoj stopi" (zbroj naknade + iznos poreza
  + iznos oslobođenja). Preporuka: PDV zaokružiti **na razini porezne skupine (po stopi)**, a
  ne zbrajanjem zaokruženih PDV-ova po pojedinoj stavci — to je usklađeno s EN 16931 (PDV se
  računa na `BG-23` razini po `VAT category`).
- eRačun ima poseban element **iznos zaokruživanja** (`BT-114 Rounding amount`) kojim se
  usklađuje ukupni iznos za plaćanje.

⚠️ **UPOZORENJE (proturječje u praksi):** Neki alati zaokružuju PDV **po stavci** pa zbrajaju,
drugi zbrajaju osnovice po stopi pa jednom zaokruže PDV. Rezultati se mogu razlikovati za
±0,01. EN 16931 / poslovna pravila (BR-CO-*) preferiraju **izračun po VAT-breakdown skupini**.
Naš sustav slijedi taj pristup i eksplicitno ga dokumentira; razliku pokrivamo `BT-114`.

### 5.2. Preporučeni algoritam (naš sustav)

1. Po **stavci**: `net_line = round2(qty × unit_price × (1 − discount))`.
2. Grupiranje stavki po **PDV stopi** → suma neto osnovica po stopi.
3. Po **stopi**: `vat_group = round2(sum_net_group × rate)`. (Zaokruži jednom, po skupini.)
4. `total_vat = Σ vat_group`; `total_net = Σ net_line`; `total_gross = total_net + total_vat`.
5. Ako je potrebno uskladiti prikazani "za platiti" (npr. gotovinsko zaokruživanje), razliku
   iskazati u `BT-114 Rounding amount`.

### 5.3. Kako ga tretira naš sustav

- Interna aritmetika: **integer cents** (BigInt/number cijeli centi) da izbjegnemo float
  greške; zaokružujemo half-up eksplicitno, nikad se ne oslanjamo na binarni float.
- Jedinstvena funkcija `round2()` (banker's? — **NE**, koristimo half-up sukladno EUR pravilu).

**Izvori:** Zakon o uvođenju eura, PU B2C stranica (elementi razvrstani po stopi), MF/EN 16931
specifikacija eRačuna (BT-114 rounding).

---

## 6. Avansi / predujmovi i konačni račun

### 6.1. Pravilo (PDV)

- Po primitku **predujma** izdaje se **račun za predujam** (avansni; eRačun vrsta **386**) i
  obračunava PDV na primljeni iznos — **osim** ako je isporuka obavljena unutar istog poreznog
  razdoblja (tada se može izdati samo konačni račun bez avansnog).
- Kod **konačnog računa** po isporuci: od obračunanog PDV-a **umanjuje se PDV s predujma** i
  navodi se **broj računa za predujam**. Kad su predujam i isporuka u **istom** razdoblju, na
  konačnom se **ne iskazuje umanjenje** (jer avansnog računa efektivno nije bilo).

### 6.2. Fiskalizacija 2.0 — točan redoslijed (PU "F2 primjeri", 24. 11. 2025.)

Redoslijed: **(1)** eRačun za predujam po uplati → **(2)** eRačun koji **stornira** eRačun(e)
za predujam → **(3)** konačni eRačun. Za **svaki** od (1)–(3) šalje se fiskalizacijska poruka
**izdavanja** (izdavatelj) i **zaprimanja** (primatelj).

**Primjer 1 (nema razlike za uplatu):**

| Dokument | BT-112 Ukupno | BT-113 Plaćeno | BT-115 Za naplatu | eIzvještavanje | Referenca | Datum |
|---|---:|---:|---:|:--:|:--:|---|
| Račun za predujam 100/1/1 | 500,00 | 500,00 | 0,00 | NE | — | 5. 1. 2026. |
| Storno predujma 105/1/1 | −500,00 | −500,00 | 0,00 | NE | 100/1/1 | 10. 1. 2026. |
| Konačni račun 110/1/1 | 500,00 | 500,00 | 0,00 | NE | 105/1/1 | 10. 1. 2026. |

BT-115 = 0,00 ⇒ ne očekuje se dostava podatka o naplati; status eRačuna = **naplaćen**.

**Primjer 2 (isporuka veća od predujma):**

| Dokument | BT-112 | BT-113 | BT-115 | eIzvještavanje | Referenca | Datum |
|---|---:|---:|---:|:--:|:--:|---|
| Račun za predujam 15/1/1 | 500,00 | 500,00 | 0,00 | NE | — | 25. 3. 2026. |
| Storno predujma 18/1/1 | −500,00 | −500,00 | 0,00 | NE | 15/1/1 | 27. 3. 2026. |
| Konačni račun 25/1/1 | 1.500,00 | 500,00 | **1.000,00** | **DA** | 18/1/1 | 27. 3. 2026. |

BT-115 = 1.000,00 > 0 ⇒ **šalje se podatak o naplati** (1.000,00) kroz eIzvještavanje.

### 6.3. Kako ga tretira naš sustav

- Podržavamo tok predujam → storno predujma → konačni, s auto-generiranjem referenci
  (`BT-25`) između koraka.
- Računamo BT-112/113/115 i **automatski određujemo** treba li slati podatak o naplati
  (`BT-115 > 0`).
- Mapiranje na FIRA-stil payload: `invoiceType` + posebna oznaka avansa; interno vodimo lanac.

**Izvori:** PU "F2 primjeri" 24. 11. 2025., PU mišljenje 1628 (predujmovi).

---

## 6b. Podatak o naplati i eIzvještavanje (oznake T/O/Z) — 2.0

Iz istog PU dokumenta (bitno za naš model naplate):

- Podatak o naplati šalje se za **svaki eRačun čiji `BT-115 > 0,00`**. eRačun dobiva status
  **naplaćen** kad se kroz naplate zatvori iznos iz BT-115.
- Oznake načina plaćanja u podatku o naplati:
  - **T** — naplata na transakcijski račun.
  - **O** — ostala obračunska plaćanja (kompenzacija, asignacija, cesija i sl.).
  - **Z** — gotovina, kartica, ili "smatra se naplaćeno" (preplaćeni iznosi po odobrenju/stornu,
    zastara, otpis i sl.).
- Ako je eRačun plaćen **gotovinom**, izdavatelj šalje podatak o naplati s oznakom **Z**.
- Za eRačune iz **2025.** ne dostavljaju se podaci o naplati naplaćeni u 2026. (osim ako je
  poruka poslana u produkciji u 2025. — tada sustav ne ograničava dostavu naplate u 2026.).

---

## 7. Obrtnici na dohodak vs. dobit; ne-PDV obveznici; oslobođenja

### 7.1. Obveznici Fiskalizacije 2.0

Obveznici su izdavatelji i primatelji eRačuna: porezni obveznici upisani u registar PDV-a,
**obveznici poreza na dohodak od samostalne djelatnosti** i **obveznici poreza na dobit**, sa
sjedištem/prebivalištem/uobičajenim boravištem u RH.

- **PDV obveznici:** od **1. 1. 2026.** obvezno **slanje i zaprimanje** eRačuna (B2B/B2G).
- **Ne-PDV obveznici** (npr. obrt/paušal izvan PDV-a) i proračunski korisnici: od **1. 1. 2026.**
  obavezno **zaprimanje**, a **slanje od 1. 1. 2027.**

Za samog obveznika porez na dohodak vs. dobit **ne mijenja tehniku fiskalizacije** — mijenja
knjigovodstvo/prijave; oboje su obveznici F2.0. Razlika je relevantna za rokove (ne-PDV
dohodovci šalju tek od 2027.).

### 7.2. Ne-PDV obveznik — račun bez PDV-a

Mali porezni obveznik (izvan sustava PDV-a) **ne iskazuje PDV**, a na računu navodi klauzulu
o oslobođenju. Aktualna formulacija (od 1. 1. 2025.):

> **"Oslobođeno plaćanja PDV-a prema čl. 90. st. 1. Zakona o porezu na dodanu vrijednost."**

⚠️ **UPOZORENJE / terminologija:** zadatak spominje napomenu **"PDV nije obračunat"**. U
hrvatskoj praksi ispravna/precizna napomena za malog obveznika je **klauzula o oslobođenju po
čl. 90.**, ne generičko "PDV nije obračunat". Naš sustav generira **čl. 90. st. 1.** tekst za
male obveznike; generičku frazu ne koristimo jer nije usklađena sa Zakonom o PDV-u.

### 7.3. Kako ga tretira naš sustav

- Tenant ima flag `pdvObveznik: boolean` i `porezNa: 'dohodak'|'dobit'`.
- Ako `pdvObveznik = false`: sve stavke `taxRate = 0`, PDV se ne obračunava, a na PDF/eRačun
  automatski se dodaje napomena čl. 90. st. 1. (`BT-120 VAT exemption reason` +
  `BT-121` kod kategorije `E`).
- Datumska logika obveza (2026 vs 2027) je konfiguracijska (feature-flag po tipu obveznika).

**Izvori:** Zakon o fiskalizaciji (NN 89/25), PU "Izdavatelji i primatelji eRačuna", TEB/PU
o klauzuli čl. 90.

---

## 8. Reverse charge / prijenos porezne obveze (čl. 75. Zakona o PDV-u)

### 8.1. Pravilo

Kod prijenosa porezne obveze davatelj **ne iskazuje PDV** i navodi obveznu napomenu. Dva
glavna slučaja:

- **Tuzemni prijenos (čl. 75. st. 3.)** — npr. građevinske usluge, otpad, i sl.; oba subjekta
  moraju biti u registru PDV-a u RH. Napomena:
  > **"Prijenos porezne obveze prema čl. 75. st. 3. t. a) Zakona o PDV-u"** (točka ovisi o vrsti).
- **EU B2B usluge (čl. 17. st. 1., mehanizam reverse charge)** — primatelj u drugoj DČ
  obračunava PDV; napomena "prijenos porezne obveze / reverse charge".

Uvjet: ako primatelj **nije** u sustavu PDV-a (mali obveznik ili krajnji potrošač) — prijenos
se **ne primjenjuje**.

### 8.2. eRačun mapiranje

- PDV kategorija (`BT-118 VAT category code`) = **`AE` (VAT Reverse Charge)**.
- Stopa 0, iznos PDV-a 0; obavezno `BT-120` (razlog) s tekstom napomene.

### 8.3. Kako ga tretira naš sustav

- Stavka/dokument ima flag `reverseCharge: true` + `reverseChargeBasis` (npr. `cl75st3a`).
- Validacija: reverse charge dopušten **samo** ako su i izdavatelj i primatelj PDV obveznici
  (za tuzemni) — inače odbijamo s jasnom porukom greške.
- Auto-generiramo točnu napomenu i EN 16931 kategoriju `AE`.

**Izvori:** Zakon o PDV-u čl. 75. st. 3., PU FAQ PDV, TEB (ispostavljanje računa za tuzemni
prijenos), EN 16931 VAT category codes.

---

## 9. Rabati / popusti

### 9.1. Pravilo

- Popusti/rabati **umanjuju poreznu osnovicu**. Ako **nisu uključeni u jediničnu cijenu**,
  moraju se **iskazati na računu** (obvezni element računa po Pravilniku o PDV-u).
- Vrste: rabat u trenutku isporuke (umanjuje osnovicu odmah), casa sconto (popust za rani
  plaćaj), naknadni rabat/bonifikacija (kroz **knjižno odobrenje 381**).

### 9.2. eRačun mapiranje

- Popust na razini stavke: `BT-136 (Invoice line allowance amount)` + `BT-137` (osnovica) +
  `BT-138` (%).
- Popust na razini dokumenta: `BG-20 Document level allowances` (`BT-92`…).
- Naknadni popust nakon izdavanja: novi dokument **381**.

### 9.3. Kako ga tretira naš sustav

- Po uzoru na FIRA API (`discounts[]` kao stavke s negativnom cijenom) podržavamo popuste, ali
  ih **normaliziramo** u strukturirane `allowance` elemente (line-level i document-level) radi
  ispravnog EN 16931 mapiranja — ne guramo ih kao "negativne stavke" u eRačun.
- PDV osnovica se računa **nakon** popusta (§5 algoritam korak 1 uključuje `(1 − discount)`).

**Izvori:** Pravilnik o PDV-u (obvezni elementi — popusti/rabati), PU uputa 1484, EN 16931
allowance elementi, `docs/reference/fira-custom-webshop-api.md`.

---

## 10. Strana valuta i tečaj

### 10.1. Pravilo

- Račun **mora biti iskazan u EUR**. Iznos se **može** dodatno iskazati u drugoj valuti, ali
  **iznos PDV-a koji se plaća mora biti iskazan u EUR**.
- Ako su elementi osnovice u stranoj valuti, za preračun u EUR koristi se **srednji tečaj HNB-a
  na dan nastanka obveze obračuna PDV-a**.

### 10.2. eRačun mapiranje

- `BT-5 Invoice currency code` = valuta računa; `BT-6 VAT accounting currency code` = EUR (kad
  se PDV knjiži u EUR); `BT-7` datum tečaja / `BT-110`, `BT-111` iznosi PDV-a u knjigovodstvenoj
  valuti.

### 10.3. Kako ga tretira naš sustav

- Podržana valuta stavki (FIRA `currency`), ali **PDV i fiskalizacijska poruka uvijek u EUR**.
- Tečaj: dohvat **srednjeg tečaja HNB-a** za `deliveryDate`/datum obveze; spremamo tečaj i
  datum uz račun (audit). ⚠️ Ne izmišljamo tečaj — koristimo službenu HNB tečajnu listu; ako
  je nedostupna za taj datum, blokiramo/označavamo račun umjesto da pogađamo.

**Izvori:** Zakon o PDV-u / Pravilnik (iskaz u EUR, srednji tečaj HNB), HNB tečajna lista.

---

## 11. Gotovinski vs. transakcijski račun — što se fiskalizira (1.0 → 2.0)

### 11.1. Pravilo (prijelaz)

- **Do 2025. (Fiskalizacija 1.0):** fiskalizirali su se računi u krajnjoj potrošnji plaćeni
  **sredstvima koja se smatraju gotovinom** (gotovina, kartice, ček…), **ne** transakcijski
  (virmanski) B2B računi.
- **Od 1. 1. 2026.:**
  - **B2C (krajnja potrošnja):** fiskalizacija 1.0 se provodi za **sve načine plaćanja**
    (gotovina, kartica, transakcijski račun, ostalo) — ZKI+JIR.
  - **B2B/B2G:** ako se izdaje račun poslovnom subjektu i plaćanje je **transakcijski račun**,
    izdaje se **eRačun** i provodi **Fiskalizacija 2.0** tog računa (fisk. poruka izdavanja +
    zaprimanja + podatak o naplati kroz eIzvještavanje).

Sažetak: **od 2026. "sve ide"** — B2C kroz 1.0 (svi načini plaćanja), B2B/B2G kroz 2.0
(eRačun). Gotovinski B2B i dalje može imati i 1.0 obveze (krajnja potrošnja) — granica je
B2C vs B2B, ne više gotovina vs. transakcijski.

### 11.2. Kako ga tretira naš sustav

- Dokument ima `channel: 'B2C'|'B2B'|'B2G'` i `paymentType: GOTOVINA|KARTICA|TRANSAKCIJSKI|...`
  (usklađeno s FIRA enumom).
- Router odlučuje: B2C → 1.0 (ZKI/JIR); B2B/B2G → 2.0 (eRačun + fisk. poruke). Za mješovite
  slučajeve (npr. B2B gotovinski u krajnjoj potrošnji) primjenjujemo obje obveze i to jasno
  logiramo.

**Izvori:** PU B2C stranica (svi načini plaćanja od 2026.), PU/Fiskalopedija F2.0, Datalab/
expertise pregledi rokova.

---

## 12. Rok izdavanja računa

### 12.1. Pravilo

- **B2C fiskalni račun:** izdaje se i fiskalizira **u trenutku isporuke** (real-time; ZKI odmah,
  JIR odmah ili naknadno unutar 48h ako nema veze — §4).
- **Isporuke unutar EU oslobođene PDV-a / usluge poreznim obveznicima iz drugih DČ:** najkasnije
  **15. dana u mjesecu nakon** mjeseca u kojem je isporuka obavljena.
- **eRačun (B2B/B2G):** izdaje se sukladno PDV pravilima; fiskalizacijska poruka prati razmjenu.

### 12.2. Kako ga tretira naš sustav

- Validacija `issueDate` (ne u budućnosti); upozorenje na prekoračenje 15-dnevnog EU roka.

**Izvori:** PU uputa 1484, Pravilnik o PDV-u.

---

## 13. Kontinuitet numeriranja i prijelaz godine

### 13.1. Pravilo

- Broj računa ima **tri dijela**: `broj računa / oznaka poslovnog prostora / oznaka naplatnog
  uređaja` (npr. `110/1/1`).
- **Slijednost mora biti neprekinuta** (bez rupa) **unutar poslovnog prostora / naplatnog
  uređaja** za kalendarsku godinu.
- **Prijelaz godine:** svake kalendarske godine numeracija **kreće ispočetka**; početni broj
  može biti bilo koji (npr. 1, 1000, 25001) — definirano **internim aktom**. Bitno je da je
  slijednost tijekom godine neprekinuta.
- **Interni akt** propisuje pravila slijednosti, popis poslovnih prostora, oznake prostora i
  naplatnih uređaja te blagajnički maksimum. Oznake **moraju biti identične** kroz sustav —
  `PP1` ≠ `pp1` (case-sensitive; različita oznaka = drugi prostor).

### 13.2. Kako ga tretira naš sustav

- Numeraciju vodimo **atomarno u D1** po ključu `(tenant, poslovniProstor, naplatniUredaj, godina)`
  s `NEXT VALUE` uzorkom (transakcija/UPDATE…RETURNING) da nema rupa ni duplikata pod
  konkurencijom.
- Na **1. 1.** automatski novi brojač (reset po godini) s konfigurabilnim početnim brojem.
- Oznake prostora/uređaja validiramo strogo (case-sensitive, regex iz internog akta).
- ⚠️ Rupa u nizu = crveni alarm (moguć revizijski problem); nikad "preskačemo" broj bez traga.

**Izvori:** PU "Slijednost računa" (8050), PU "Račun" (4595), RRiF uputa o numeriranju,
FAROS/Fiskalopedija (interni akt F2.0).

---

## 14. Test scenariji (za našu test-suite)

### 14.1. OIB
- `00000000001` → nevaljan (kontrola); `69435151530` → **valjan** (referentni primjer).
- ne-11-znamenkasti, slova, prazan → odbijeno.
- Matematički valjan ali nepostojeći → prolazi sintaksu, ali flag "nije provjereno postojanje".

### 14.2. Zaokruživanje
- 3 stavke × 33,333 % udjela → provjeri da `Σ(round po stopi)` = ukupni PDV i da `BT-114`
  hvata ±0,01 razliku.
- Half-up granica: osnovica čiji PDV = x,xx5 → zaokruži naviše.

### 14.3. Storno / odobrenje
- Original 380 → storno 384 s referencom → zbroj = 0.
- 381 (credit note): pokušaj storna 381 → **mora biti odbijen** (pravilo: 381 nema storno).
- 1.0 B2C storno: negativni račun dobiva vlastiti JIR; interna veza spremljena.

### 14.4. Avans
- Primjer 1 (predujam=konačni, BT-115=0) → status naplaćen, **bez** podatka o naplati.
- Primjer 2 (konačni > predujam, BT-115=1.000) → **generira se** podatak o naplati (T),
  eIzvještavanje = DA.

### 14.5. Offline
- CIS timeout → račun `PENDING_JIR` sa ZKI; sweep dobiva JIR < 48h; alarm ako se prekorači.

### 14.6. Reverse charge / ne-PDV
- Reverse charge kad primatelj nije PDV obveznik → **odbijeno**.
- Ne-PDV izdavatelj → sve stavke 0 % + napomena čl. 90. st. 1., kategorija `E`.

### 14.7. Numeracija
- 100 konkurentnih zahtjeva → 100 uzastopnih brojeva, bez rupa/duplikata.
- Prijelaz 31. 12. → 1. 1. → reset brojača, novi početni broj iz internog akta.

### 14.8. Valuta
- USD stavke → PDV i fisk. poruka u EUR po srednjem tečaju HNB na datum obveze; tečaj spremljen.
- HNB tečaj nedostupan → račun blokiran/označen, ne pogađamo tečaj.

---

## Sažetak mapiranja edge-case → EN 16931 / fisk. polja (brza referencija)

| Edge-case | Ključno polje / kod | Napomena |
|---|---|---|
| Vrsta dokumenta | `BT-3` / UNTDID 1001: 380/381/383/384/386 | 381 uvijek negativan, bez storna |
| Referenca na original | `BT-25` / `BG-3` | N referenci moguće |
| Reverse charge | `BT-118` = `AE` + `BT-120` | čl. 75. st. 3. napomena |
| Oslobođenje (ne-PDV) | `BT-118` = `E` + `BT-120` | čl. 90. st. 1. |
| Zaokruživanje | `BT-114 Rounding amount` | usklađenje "za platiti" |
| Valuta / PDV valuta | `BT-5` / `BT-6` = EUR | srednji tečaj HNB |
| Popust stavka / doc | `BT-136…138` / `BG-20` | ne kao negativna stavka |
| Ukupno / plaćeno / za naplatu | `BT-112` / `BT-113` / `BT-115` | naplata ako BT-115 > 0 |
| ZKI / JIR | fisk. poruka 1.0 | ZKI lokalno, JIR iz CIS-a |

---

## Izvori

- [Zakon o fiskalizaciji, NN 89/25](https://narodne-novine.nn.hr/clanci/sluzbeni/2025_06_89_1233.html) — temeljni zakon F2.0, rokovi 1.9.2025./1.1.2026./1.1.2027. (pristup 2026-07-04)
- [Zakon o fiskalizaciji — pročišćeno, zakon.hr](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — radna verzija teksta zakona (pristup 2026-07-04)
- [REGOS — KONTROLA OIB-a (ISO 7064, MOD 11,10), PDF](https://regos.hr/app/uploads/2018/07/KONTROLA-OIB-a.pdf) — službeni algoritam kontrolne znamenke + primjer 69435151530 (pristup 2026-07-04)
- [PU — Mišljenje 1466: storniranje fiskaliziranog računa](https://porezna-uprava.gov.hr/Misljenja/Detaljno/1466) — storno se fiskalizira, negativni iznosi, vlastiti JIR, knjigovodstvena veza (pristup 2026-07-04)
- [PU — Fiskalizacija 2.0: primjeri i način postupanja (24.11.2025.), PDF](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Letci/F2_primjeri_20251124.pdf?vel=267824) — avansi, BT-112/113/115, oznake naplate T/O/Z, pravilo za 381, reference (pristup 2026-07-04)
- [PU — Fiskalizacija računa u krajnjoj potrošnji (B2C), 8033](https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje/8033) — B2C elementi, ZKI/JIR, svi načini plaćanja od 2026. (pristup 2026-07-04)
- [PU — Slijednost računa, 8050](https://porezna-uprava.gov.hr/hr/slijednost-racuna-8050/8050) — neprekinuta numeracija, prijelaz godine, interni akt (pristup 2026-07-04)
- [PU — Račun, 4595](https://porezna-uprava.gov.hr/hr/racun/4595) — obvezni elementi, struktura broja računa (pristup 2026-07-04)
- [PU — Izdavatelji i primatelji eRačuna (obveza izdavanja)](https://porezna-uprava.gov.hr/hr/izdavatelji-i-primatelji-eracuna-te-obveza-izdavanja-eracuna-azurirano-7-11-2025/8048) — tko/kada, PDV vs ne-PDV, 2026 vs 2027 (pristup 2026-07-04)
- [PU — Uputa 1484: obveza izdavanja računa](https://porezna-uprava.gov.hr/Misljenja/Detaljno/1484) — rokovi izdavanja, elementi, popusti/rabati (pristup 2026-07-04)
- [PU — Mišljenje 1628: PDV predujmovi](https://porezna-uprava.gov.hr/Misljenja/Detaljno/1628) — avansni i konačni račun, umanjenje PDV-a (pristup 2026-07-04)
- [PU — Tehnička specifikacija za korisnike (v2.x), PDF](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf) — ZKI, offline, 48h dostava (pristup 2026-07-04)
- [MF — Specifikacija osnovne uporabe eRačuna s proširenjima](https://porezna.gov.hr/fiskalizacija/api/dokumenti/183) — UNTDID 1001 kodovi, EN 16931 mapiranje (pristup 2026-07-04)
- [Tehnička specifikacija: Fiskalizacija eRačuna i eIzvještavanje, PDF](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf) — 2.0 poruke, vrste dokumenata (pristup 2026-07-04)
- [Zakon o uvođenju eura — pravila preračunavanja i zaokruživanja](https://profortis.hr/novosti-zakonodavstvo/zakon-o-uvodenju-eur-a) — 5 decimala tečaja, zaokruženje na 2, half-up (pristup 2026-07-04)
- [PDV aktualno — pravila preračunavanja i zaokruživanja](https://www.pdvaktualno.hr/33/pravila-preracunavanja-i-zaokruzivanja-uniqueidRCViWTptZHIq8BnelL0ZzmTzNsmOq4dZ/) — zaokruživanje PDV-a (pristup 2026-07-04)
- [TEB — klauzula o oslobođenju čl. 90. za male obveznike (od 1.1.2025.)](https://www.teb.hr/novosti/2025/klauzula-o-oslobodenju-od-placanja-pdv-a-na-racunima-malih-poreznih-obveznika-od-112025/) — točan tekst napomene ne-PDV obveznika (pristup 2026-07-04)
- [act-konto — Reverse charge (prijenos porezne obveze)](https://act-konto.hr/reverse-charge/) — čl. 75. st. 3., napomena, uvjeti (pristup 2026-07-04)
- [HNB — tečajna lista / srednji tečaj](https://www.hnb.hr/en/statistics/statistical-data/financial-sector/central-bank-cnb/exchange-rates/exchange-rate-list-for-cnb-clients) — srednji tečaj za preračun u EUR (pristup 2026-07-04)
- [FiskAI — Storno račun 2026 (tip 381, negativni iznosi)](https://www.fiskai.hr/kako-da/stornirati-racun/) — praktični pregled storna/odobrenja (vendor) (pristup 2026-07-04)
- [Billy POS — zakonski rok za naknadnu fiskalizaciju (48h)](https://billy.hr/zakonski-rok-za-naknadnu-fiskalizaciju-racuna/) — tumačenje 48h prozora (vendor) (pristup 2026-07-04)
- Lokalni: `docs/reference/fira-custom-webshop-api.md`, `docs/reference/lokalni-artefakti.md` — dizajn payloada, ZKI smjer (firsthand)

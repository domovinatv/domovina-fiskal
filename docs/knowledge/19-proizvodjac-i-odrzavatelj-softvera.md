# 19 — ITalk kao proizvođač i održavatelj softvera za fiskalizaciju (F1.0)

> Stanje / provjera izvora: **03.08.2026.** Svi URL-ovi provjereni na taj dan.
> Prioritet izvora: **Narodne novine** (Zakon o fiskalizaciji NN 89/2025), **Porezna uprava**
> (porezna.gov.hr/fiskalizacija, porezna-uprava.gov.hr). Sekundarni izvori označeni.
>
> **Pitanje na koje ovaj dokument odgovara:** može li **ITalk d.o.o.** biti upisan kao
> *proizvođač i/ili održavatelj programskog rješenja* za fiskalizaciju, i koji su preduvjeti.
> Do sada je ITalk kao proizvođača/održavatelja prijavljivao **Fira Finance** i **Solo**.
>
> **Ovo je Fiskalizacija 1.0 (maloprodaja / krajnja potrošnja) — NE miješati s
> informacijskim posrednikom za Fiskalizaciju 2.0** (tamo je odluka: koristimo **doku**,
> vidi [`13-provideri-krajolik.md`](./13-provideri-krajolik.md) i
> [`14-postupak-registracije-posrednika.md`](./14-postupak-registracije-posrednika.md)). Razlika: §5.

---

## 0. TL;DR

**DA, ITalk može biti proizvođač i održavatelj — i to odmah, bez ikakvog postupka
odobrenja.**

- **Nema registracije. Nema licenciranja. Nema akreditacije. Nema potvrde o sukladnosti.
  Nema naknade.** Zakon ne poznaje registar proizvođača softvera za fiskalizaciju.
- „Proizvođač i/ili održavatelj programskog rješenja" je **samo podatak koji obveznik
  fiskalizacije prijavi Poreznoj upravi** uz poslovni prostor, preko ePorezne. Jedini
  obvezni sadržaj tog podatka je **OIB** proizvođača/održavatelja.
- Cijena te uloge nije administrativna nego **pravna: suodgovornost.** Zakon izričito
  kaže da su *obveznik fiskalizacije **i** proizvođač/održavatelj* odgovorni za
  ispravnost programskog rješenja, uz kaznu do **66.360 €** za softver koji omogućava
  izbjegavanje fiskalizacije.
- Praktični preduvjeti nisu papirnati nego tehnički: softver mora zadovoljiti Tehničke
  specifikacije CIS-a i **ne smije omogućavati izmjenu stavaka na već izdanom računu**.

**Za nas:** čim `domovina-fiskal` prođe produkcijsku provjeru, ITalk se u ePorezni
upisuje kao proizvođač i održavatelj umjesto Fire/Sola — prvo za vlastite poslovne
prostore, a zatim ga tako navodi **svaki tenant** koji koristi našu platformu.

---

## 1. Pravni temelj

Izvor: [Zakon o fiskalizaciji, NN 89/2025](https://narodne-novine.nn.hr/clanci/sluzbeni/full/2025_06_89_1233.html) (03.08.2026.)

### 1.1 Članak 14 — obveza odgovarajućeg programskog rješenja

- Obveznik fiskalizacije **mora koristiti programsko rješenje koje omogućava postupanje
  sukladno Zakonu**.
- **Definicija zabranjenog softvera:** programskim rješenjima koja omogućavaju
  izbjegavanje fiskalizacije smatraju se ona koja **imaju mogućnost promjene stavaka na
  već izdanom računu**.
- **Suodgovornost:** *„Obveznik fiskalizacije računa te proizvođač i/ili održavatelj
  programskog rješenja odgovorni su za ispravnost programskog rješenja."*

> Ovo je jedina „kvalifikacija" koju zakon traži — ne certifikat nego **svojstvo samog
> softvera**. Posljedica za `domovina-fiskal`: **računi moraju biti nepromjenjivi
> (immutable) nakon fiskalizacije; ispravak ide isključivo storno dokumentom.** To nije
> stvar ukusa nego uvjet zakonitosti, i mora se moći dokazati (audit log, DB constraint).

### 1.2 Članak 17 — dostava podataka o proizvođaču/održavatelju

- Obveznik je **dužan dostaviti podatak o proizvođaču i/ili održavatelju** programskog
  rješenja u Sustav fiskalizacije.
- **Obvezni sadržaj: OIB** proizvođača i/ili održavatelja.
- **Ako je proizvođač/održavatelj strana osoba bez OIB-a:** ime/naziv, adresa, oznaka
  države i identifikacijski broj iz države poslovnog nastana.

### 1.3 Članak 71 — prekršajne kazne (najteži prekršaj)

| Tko | Iznos |
|---|---|
| **Proizvođač i/ili održavatelj** programskog rješenja koje omogućava izbjegavanje fiskalizacije (pravna osoba) | **3.980 – 66.360 €** |
| Odgovorna osoba u pravnoj osobi | 660 – 6.630 € |
| Fizička osoba obrtnik | 3.980 – 39.810 € |

⚠️ Brojeve članaka i raspone kazni **ponovno provjeriti u pročišćenom tekstu** prije
citiranja u ugovoru ili licenci — dohvaćeni su strojnim čitanjem NN teksta 03.08.2026.

---

## 2. Proizvođač vs. održavatelj

Zakon ih navodi kao **„proizvođač i/ili održavatelj"** — dakle:

- mogu biti **isti subjekt** (naš slučaj: ITalk i piše i održava `domovina-fiskal`);
- mogu biti **različiti subjekti** (npr. softver kupljen od jednog, održava ga drugi);
- obveznik prijavljuje **jednog ili oba**, ovisno o stvarnom stanju.

**Dosadašnji ITalk slučaj:** Fira Finance i Solo su bili *tuđi* proizvodi koje je ITalk
koristio — pa su oni bili i proizvođač i održavatelj. Prelaskom na vlastito rješenje
ITalk preuzima **obje uloge i pripadajuću odgovornost iz §1.1**.

---

## 3. Postupak — gdje se to konkretno upisuje

**Nije zaseban zahtjev ni obrazac za proizvođača.** Podatak se unosi kroz prijavu
poslovnog prostora, koju radi **obveznik fiskalizacije**, ne proizvođač.

1. Prijava u **ePorezna** (bankovni token, FINA token ili e-ID).
2. Usluga **„Fiskalizacija – prijava poslovnog prostora"**.
3. Unosi se:
   - **oznaka poslovnog prostora** — mora odgovarati **internom aktu** obveznika
     (oznaka je dio broja računa);
   - **djelatnost** i **radno vrijeme** (za online poslovanje: 0–24);
   - **podaci o proizvođaču i/ili održavatelju softvera** (OIB).
4. **Od 01.09.2025. prijava poslovnih prostora ide isključivo elektronički preko
   ePorezne** (papirnati put ukinut).
5. **Promjena podatka (npr. Fira/Solo → ITalk):** postojeći zapis se **ne uređuje** —
   zatvara se datumom prestanka i **kreira se novi zapis** s novim podacima.

Izvori: [Porezna uprava — Korisničke upute: Fiskalizacija – prijava poslovnog prostora (v2.4)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Korisni%C4%8Dke%20upute%20Fiskalizacija%20-%20prijava%20poslovnog%20prostora.pdf), [Porezna uprava — Dostava podataka o poslovnim prostorima](https://porezna-uprava.gov.hr/hr/dostava-podataka-o-poslovnim-prostorima/4612), [fiskalopedija.hr — Prijava poslovnog prostora putem ePorezne](https://fiskalopedija.hr/baza-znanja/prijava-poslovnog-prostora-eporezna) (sekundarni izvor, praktične upute; 03.08.2026.)

⚠️ Točan naziv i pozicija polja za proizvođača/održavatelja u ePorezna formi nisu
provjereni iz prve ruke — **provjeriti u samoj aplikaciji pri prvoj izmjeni** i
dopuniti ovaj dokument snimkom zaslona/koracima.

---

## 4. Preduvjeti za ITalk — stvarni popis

Formalnih (papirnatih) preduvjeta nema. Stvarni su:

| # | Preduvjet | Stanje |
|---|---|---|
| 1 | **OIB pravnog subjekta** | ✅ ITalk d.o.o. |
| 2 | **Softver sukladan Tehničkim specifikacijama CIS-a** (ZKI, JIR, XML-DSIG, QR) | 🟡 `domovina-fiskal` — vidi [`02-fiskalizacija-1.0-tehnicki.md`](./02-fiskalizacija-1.0-tehnicki.md) |
| 3 | **Nemogućnost izmjene stavaka izdanog računa** (čl. 14) | ⛔ mora biti dokazivo u kodu i shemi — vidi §6 |
| 4 | **Aplikacijski certifikat FINA/AKD** kod obveznika | ✅ obrađeno u [`04-certifikati-fina-akd.md`](./04-certifikati-fina-akd.md) |
| 5 | **Interni akt** obveznika (oznake prostora, numeriranje) | po tenantu |
| 6 | **Prilagodba za izmjene servisa u 2026.** | vidi §4.1 |

### 4.1 Izmjene servisa fiskalizacije u krajnjoj potrošnji od 01.01.2026.

Nova verzija servisa objavljena za prilagodbu i testiranje do studenog 2025., primjena
od **01.01.2026.** Što proizvođač/održavatelj mora podržati:

- **OIB primatelja računa** — novi element dodan u **sve postojeće metode**;
- **nova metoda za izmjenu podataka računa** (promjena načina plaćanja i OIB-a primatelja);
- **prijava radnog vremena poslovnog prostora** kroz servis (metode: prijava, dohvat, brisanje);
- **restriktivne kontrole pri fiskalizaciji računa** — stroža validacija na strani CIS-a.

Izvor: [Porezna uprava — Prilagodba servisa fiskalizacije za izmjene u 2026.](https://porezna.gov.hr/fiskalizacija/gotovinski-racuni/gotovinski-racuni-novosti/o/prilagodba-servisa-fiskalizacije-2026) (03.08.2026.)

⚠️ **Provjeriti:** postoji najava da **DEMO aplikacijski certifikat za test sustav
Fiskalcistest istječe sredinom srpnja 2026.** Budući da je danas 03.08.2026., taj je rok
vjerojatno **već prošao** — provjeriti stanje testnog certifikata prije sljedećeg
testnog ciklusa. Vidi [`04-certifikati-fina-akd.md`](./04-certifikati-fina-akd.md).

---

## 5. Razlika: proizvođač softvera (F1.0) vs. informacijski posrednik (F2.0)

Ovo je izvor najčešće zabune i razlog zašto ovaj dokument postoji odvojeno od
[`14-postupak-registracije-posrednika.md`](./14-postupak-registracije-posrednika.md).

| | **Proizvođač/održavatelj softvera** (F1.0, maloprodaja) | **Informacijski posrednik** (F2.0, eRačun) |
|---|---|---|
| Pravni temelj | čl. 14, 17, 71 | čl. 59–62 |
| Registracija kod PU | **NE postoji** | **DA** — upis na Popis IP-a |
| Postupak | nema — obveznik samo prijavi OIB uz poslovni prostor | PTS (`pts.porezna-uprava.hr`), završno testiranje |
| ISO 27001 / GDPR / EU-data dokumentacija (čl. 61) | **NE** | **DA** |
| Potvrda o sukladnosti | ne izdaje se | **DA** |
| Status „ključni subjekt" (NIS2) | ne | **DA** |
| Naknada | nema | nema |
| **Naša odluka** | **ITalk = proizvođač i održavatelj** | **koristimo doku** (ne postajemo IP) |

**Zaključak:** za maloprodajni dio (F1.0), koji nam **već radi**, ITalk može biti
proizvođač i održavatelj bez ikakvog postupka. Za eRačun (F2.0) i dalje ostaje doku kao
pristupna točka — te dvije odluke su neovisne i ne isključuju se.

---

## 6. Rizik koji preuzimamo i kako ga smanjiti

Suodgovornost iz čl. 14 je **stvarna i skalira s brojem tenanata**: kao proizvođač
odgovaramo za ispravnost softvera kojim **tuđi** obveznici izdaju svoje račune.

Mjere koje iz toga slijede (i ulaze u implementaciju, ne u „nice to have"):

1. **Nepromjenjivost izdanog računa na razini baze**, ne samo UI-ja. Nema `UPDATE` nad
   stavkama fiskaliziranog računa; ispravak isključivo storno dokumentom.
2. **Audit log svake promjene** nad dokumentima i konfiguracijom tenanta, s vremenom i
   akterom, čuvan izvan dosega tenanta.
3. **Verzioniranje programskog rješenja** i evidencija koja je verzija bila u primjeni
   kada — u prekršajnom postupku pitanje glasi „što je softver radio tog dana".
4. **Ugovor/licenca s tenantom** mora izrijekom razgraničiti odgovornost: mi jamčimo
   ispravnost programskog rješenja, tenant odgovara za istinitost podataka, ispravnost
   internog akta, certifikat i porezni tretman. → dopuniti
   [`17-licenca-onboarding.md`](./17-licenca-onboarding.md).
5. **Bez „administratorske" mogućnosti prepravljanja računa** — ni za nas. Svaka takva
   funkcija je doslovno zakonska definicija zabranjenog softvera.

---

## 7. Checklist za prelazak (Fira/Solo → ITalk)

- [ ] `domovina-fiskal` prolazi produkcijsku provjeru F1.0 (ZKI, JIR, QR, storno)
- [ ] Potvrđena nepromjenjivost računa (§6.1) + audit log (§6.2)
- [ ] Prilagodba za izmjene servisa 2026. (§4.1) implementirana
- [ ] Provjeren status FINA aplikacijskog certifikata (prod + test, §4.1 ⚠️)
- [ ] ePorezna → prijava poslovnog prostora: zatvoriti stari zapis (Fira/Solo), otvoriti
      novi s **OIB-om ITalk d.o.o.** kao proizvođačem i održavateljem
- [ ] Ista izmjena za drugi ITalk poslovni prostor (vidi `../handoff/lion-base-test-tenant.md`)
- [ ] Interni akt usklađen s oznakama poslovnih prostora
- [ ] Licenca/ugovor dopunjen razgraničenjem odgovornosti (§6.4)
- [ ] Uputa za tenante: „u ePorezni kao proizvođača/održavatelja upišite OIB ITalk d.o.o."
      → dio onboardinga u dashboardu

---

## 8. Izvori

- [Zakon o fiskalizaciji, NN 89/2025](https://narodne-novine.nn.hr/clanci/sluzbeni/full/2025_06_89_1233.html) — čl. 14, 17, 71 (03.08.2026.)
- [Porezna uprava — Obveze u postupku fiskalizacije](https://porezna-uprava.gov.hr/en/obveze-u-postupku-fiskalizacije/4592) (03.08.2026.)
- [Porezna uprava — Dostava podataka o poslovnim prostorima](https://porezna-uprava.gov.hr/hr/dostava-podataka-o-poslovnim-prostorima/4612) (03.08.2026.)
- [Porezna uprava — Korisničke upute: prijava poslovnog prostora (v2.4, PDF)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Korisni%C4%8Dke%20upute%20Fiskalizacija%20-%20prijava%20poslovnog%20prostora.pdf) (03.08.2026.)
- [Porezna uprava — Prilagodba servisa fiskalizacije za izmjene u 2026.](https://porezna.gov.hr/fiskalizacija/gotovinski-racuni/gotovinski-racuni-novosti/o/prilagodba-servisa-fiskalizacije-2026) (03.08.2026.)
- [Porezna uprava — Obrazac prijave podataka u sustavu fiskalizacije (PDF, arhiva)](https://porezna-uprava.gov.hr/UserDocsImages/arhiva/HR_Fiskalizacija/Documents/Obrazac%20prijave%20podataka%20u%20sustavu%20fisklalizacije.pdf) (03.08.2026.)
- [fiskalopedija.hr — Prijava poslovnog prostora putem ePorezne](https://fiskalopedija.hr/baza-znanja/prijava-poslovnog-prostora-eporezna) — sekundarni, praktične upute (03.08.2026.)

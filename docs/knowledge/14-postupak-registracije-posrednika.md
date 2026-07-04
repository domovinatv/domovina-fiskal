# 14 — Postupak registracije informacijskog posrednika (korak-po-korak, Fiskalizacija 2.0)

> Stanje / provjera izvora: **2026-07-04**. Svi URL-ovi i navodi provjereni na taj dan.
> Prioritet izvora: **Porezna uprava** (porezna.gov.hr/fiskalizacija, porezna-uprava.gov.hr — Mišljenja),
> **Narodne novine / zakon.hr** (Zakon o fiskalizaciji NN 89/2025, čl. 59–62), FINA/AKD (certifikati).
>
> Cilj: KONKRETAN operativni postupak kako subjekt (`domovina-fiskal` / obrt / d.o.o.) postaje **upisani
> informacijski posrednik (IP)** na Popisu PU (usluga DRUGIMA), te odvojeno kako se prolazi lakši put
> **"za vlastite potrebe"** (pristupna točka za vlastiti promet). Dopunjuje `12-vlastita-pristupna-tocka.md`
> (tehnički stog) i `13-provideri-krajolik.md` (tko je već upisan).

---

## 0. TL;DR — dva puta, isti portal

Sve ide kroz **jedan alat: Portal za testiranje sukladnosti (PTS)** — `https://pts.porezna-uprava.hr/`,
pristup preko **ePorezna**. **Nema zasebnog papirnatog obrasca/zahtjeva**; dokumentacija se **učitava u PTS**.
**Nema objavljene pristojbe/naknade** PU za upis (Zakon čl. 59–62 ne spominje nikakvu naknadu).

| | **"Za vlastite potrebe" (PT za sebe)** | **Informacijski posrednik (usluga drugima)** |
|---|---|---|
| Svrha u PTS-u | "za vlastite potrebe" | "Informacijski posrednik" |
| Dokumentacija čl. 61 (ISO 27001, GDPR, EU-data, opseg) | **NE** | **DA** (učitava se u PTS prije/uz završno testiranje) |
| Završno testiranje na PTS-u | **DA** (samo scenariji koje koristim) | **DA** (svi scenariji za deklarirani opseg) |
| Potvrda o sukladnosti | Ne izdaje se kao IP-potvrda; prolazak testa dovoljan da smijem objavljivati **svoj** OIB u AMS | **DA** — PU izdaje potvrdu o sukladnosti |
| Upis na Popis IP-a | **NE** | **DA** — objava na Popisu s opsegom usluga |
| Status "ključni subjekt" (NIS2) / trajne obveze | Ne (kao IP); vrijede opći propisi | **DA** (obnova ISO u 60 dana, kibernetička sigurnost, incident reporting) |

Ključna pravna razlika (Mišljenje PU 2629): **subjekti koji nisu IP ne trebaju prethodnu dokumentaciju —
direktno pristupaju testiranju**; IP mora prvo/uz test dostaviti dokumentaciju čl. 61.

**Broj upisanih IP-ova na 2026-07-04: 34** (zadnje ažuriranje popisa **12.3.2026.**).

---

## 1. PREDUVJETI (zajednički za oba puta)

1. **Pravni subjekt s OIB-om** — pravna ili fizička osoba (obrt). Zakon **ne traži** temeljni kapital,
   koncesiju ni članstvo u komori (čl. 59). ⚠️ Za IP je *de facto* preduvjet ISO 27001 → to podrazumijeva
   organizaciju sposobnu proći audit (nije za jednog čovjeka bez ISMS-a).
2. **Aktivan račun u ePorezna** za subjekt — nositelj uloge **Administrator** za PTS mora imati aktivan
   ePorezna račun (doc 105).
3. **Uloge u PTS-u** (doc 105):
   - **Administrator** — bira **svrhu testiranja**, (za IP) **učitava zakonsku dokumentaciju**, upravlja
     testerima; može ovlastiti drugu pravnu osobu kao administratora.
   - **Tester** — kreira ga Administrator; dobiva **e-mail s poveznicom** za postavljanje lozinke
     (vremenski ograničeno); pristupa scenarijima; nema administrativnih funkcija.
4. **Kvalificirani X.509 certifikat** (FINA/AKD, hrvatska lista povjerenja) s **OIB-om** subjekta u atributu —
   za AS4 XAdES potpis, MPS↔AMS mTLS, MPS TLS (EV) i fiskalni CIS potpis (detalji: `12-*` §2.5).
5. **Spremno tehničko rješenje** prema Tehničkim specifikacijama (AS4 PT + MPS + AMS discovery + fiskalni
   CIS klijent) — vidi `12-*` §2 i §4 (Domibus + DomiSMP).
6. **(Samo IP) Spremna dokumentacija čl. 61** — vidi §4.

---

## 2. POSTUPAK "ZA VLASTITE POTREBE" (PT za vlastiti promet)

Lakši put: fiskaliziram/razmjenjujem **samo svoj** promet (svoj OIB, svoji tenanti ako sam ja izdavatelj),
bez pružanja usluge trećima. Pravila o IP-u i dokumentacija čl. 61 se **ne primjenjuju**.

**Koraci:**
1. **ePorezna → PTS**: Administrator se prijavi na `pts.porezna-uprava.hr` preko ePorezna.
2. **Odabir svrhe testiranja = "za vlastite potrebe"** (Administrator). Time se preskače učitavanje
   dokumentacije čl. 61.
3. Administrator kreira **Testera** (e-mail poveznica → lozinka).
4. **Opcionalno testiranje** — razvojna faza, **neograničen broj pokušaja, bilo kojim redom**. Odradim
   samo scenarije koje stvarno koristim (npr. samo MPS + slanje eRačuna, ili + fiskalizacija).
5. **Završno testiranje** — koraci se prolaze **redom**; svaki uspješan korak ostaje zabilježen; neuspjeli
   se ponavlja. **Obvezno za sve operatore Pristupnih točaka od 01.09.2025.**
   - Ako fiskaliziram samo za sebe → **nisam obvezan** proći završni fiskalni scenarij ako ga ne koristim.
6. **Rezultat**: prolaskom Završnog testiranja stječem pravo **objavljivati podatke u AMS** (svoj OIB / svoje
   tenante) preko svog MPS-a i slati/primati AS4. **NE upisujem se** na Popis IP-a i **NE** dobivam status
   "ključnog subjekta" kao IP.

> Napomena: tehnički stog je 90% isti kao za puni IP (`12-*` §9, Faza 2). Razlika je isključivo
> administrativno-pravna (nema čl. 61, nema ISO/NIS2 tereta kao IP).

---

## 3. POSTUPAK "INFORMACIJSKI POSREDNIK" (usluga drugima) — puni put

Zakonski okvir: **Zakon o fiskalizaciji NN 89/2025, čl. 59–62.** Osoba smije obavljati poslove IP-a ako
kumulativno (čl. 59): (a) **dostavi dokumentaciju** iz čl. 61, i (b) **uspješno provede testiranje sukladnosti**
(čl. 60, kroz PTS). Postojeći posrednici iz stare (B2G) sheme **ne dobivaju automatski** status — moraju
proći isti postupak (Mišljenje PU 2636, 24.07.2025.).

**Korak-po-korak:**

1. **Priprema (prije PTS-a):**
   - Ishoditi/imati **važeći ISO/IEC 27001** (⚠️ preduvjet — Mišljenje 2636 izričito: certifikat ishoditi
     na vrijeme jer je preduvjet). Realno mjeseci audita ako ga još nema.
   - Pripremiti ostalu dokumentaciju čl. 61 (§4).
   - Pripremiti i istestirati tehničko rješenje (AS4 PT, MPS, AMS, fiskalni CIS) prema Tehničkim spec.
   - Uspostaviti program **kibernetičke sigurnosti** (status "ključnog subjekta" po Zakonu o kibernetičkoj
     sigurnosti — transpozicija NIS2).

2. **Prijava na PTS** (ePorezna → `pts.porezna-uprava.hr`), Administrator.

3. **Odabir svrhe testiranja = "Informacijski posrednik".** Time se aktivira obveza:
   (a) proći Završno testiranje **i** (b) učitati dokumentaciju čl. 61. Na subjekt se od tada primjenjuju
   pravila IP-a (Mišljenje 2629; PTS news).

4. **Kreiranje Testera** i **razvojno/Opcionalno testiranje** — neograničeni pokušaji do "zelenog" po svim
   scenarijima iz deklariranog opsega.

5. **Završno testiranje — scenariji (doc 105):** prolaze se **redom**, po deklariranom opsegu usluga:
   - **MPS**: objava poreznog obveznika u AMS · brisanje iz AMS-a · dohvat adrese primatelja.
   - **eRačun — razmjena (slanje)**: AMS upit → MPS upit → **AS4 slanje** PT-u primatelja.
   - **eRačun — razmjena (zaprimanje)**: objava u AMS preko MPS-a → odgovor MPS-a → **AS4 zaprimanje**.
   - **Fiskalizacija eRačuna**: fiskalizacija **izlaznog** eRačuna · fiskalizacija **ulaznog** eRačuna.
   - **eIzvještavanje**: eIzvještavanje o **odbijanju** · eIzvještavanje o **naplati**.
   - (Za puni IP koji nudi sve → moraju se proći **svi** scenariji; ako nudi samo dio usluga, testira
     scenarije koji odgovaraju opsegu.)

6. **Učitavanje dokumentacije čl. 61 u PTS** (Administrator) — 4 dokumenta iz §4.

7. **Verifikacija i izdavanje potvrde o sukladnosti:** nakon uspješnog testiranja **i** provjere dostavljene
   dokumentacije, **Porezna uprava izdaje Potvrdu o sukladnosti** (proces je "automatiziran" nakon
   uspješnog testa — Mišljenje 2636).

8. **Upis na Popis informacijskih posrednika** s naznakom **opsega usluga** (razmjena eRačuna /
   fiskalizacija / eIzvještavanje / MPS). Od objave na Popisu korisnici me mogu odabrati (u ePorezna →
   FiskAplikacija → ovlaštenja / adrese za zaprimanje — vidi `13-*` §1).

---

## 4. DOKUMENTACIJA ČL. 61 (samo za IP; učitava se u PTS)

Četiri dokumenta (Zakon čl. 61; Mišljenje 2629):

1. **Dokument o sigurnosti osobnih podataka** — detaljno navedena sredstva za osiguranje sigurnosti osobnih
   podataka sukladno **čl. 32 Uredbe (EU) 2016/679 (GDPR)**.
2. **Važeći certifikat ISO/IEC 27001** — najnovija verzija u trenutku podnošenja.
3. **Izjava o obradi/nemigraciji podataka unutar EU** — da nema prijenosa podataka izvan EU.
4. **Izjava o opsegu usluga** — koje vrste usluga posrednik pruža (razmjena / fiskalizacija / eIzvještavanje / MPS).

⚠️ **Nema objavljenog standardiziranog obrasca** za ove izjave — subjekt ih sastavlja sam i učitava u PTS
(nigdje na PU stranicama nije nađen download-obrazac na 2026-07-04). Format/predložak potvrditi kroz PTS ili
Korisničku podršku PU.

---

## 5. PRISTOJBA, TRAJANJE, OBRAZAC — verificirano

- **Pristojba/naknada PU za upis: nije propisana.** Zakon čl. 59–62 **ne spominje** nikakvu naknadu, pristojbu
  ni trošak upisa/registracije (potvrđeno na zakon.hr; Mišljenja 2629/2636 također ne navode naknadu).
  ⚠️ Vlastiti troškovi ostaju značajni: **ISO 27001 audit** (tržišni trošak certifikacijske kuće),
  **kvalificirani certifikat** (FINA/AKD), razvoj i hosting AS4/MPS infrastrukture.
- **Trajanje certifikacije: nije fiksno propisano.** Mišljenje 2636: "vremenski okvir ovisi o obvezniku i
  brzini prolaska testa sukladnosti"; nakon uspješnog testa proces je "automatiziran". ⚠️ PU ne objavljuje
  zajamčeni rok obrade. Realno usko grlo je **ishođenje ISO 27001** (mjeseci), ne sam test.
- **Obrazac/zahtjev: ne postoji zaseban papirnati zahtjev — sve ide kroz PTS aplikaciju** (odabir svrhe +
  učitavanje dokumentacije + testni scenariji). Popis-stranica PU (8019) ne sadrži poveznicu na obrazac ni
  na "postupak upisa" — samo definiciju IP-a i poveznicu na Korisničku podršku (provjereno 2026-07-04).

---

## 6. TRAJNE OBVEZE IP-a (čl. 62 + kibernetička sigurnost)

- **Obnova ISO/IEC 27001**: novu (važeću) verziju certifikata dostaviti PU najkasnije **60 dana** nakon
  isteka valjanosti (Zakon čl. 62). Propust → **brisanje s Popisa**.
  - ⚠️ Napomena o "3 godine": ISO 27001 certifikacijski ciklus je uobičajeno 3-godišnji (recertifikacija) uz
    godišnje nadzorne audite — otud navod "obnova svake 3 god." u `13-*`. Zakon operativno veže rok na
    **60 dana od isteka** važećeg certifikata; oba se ne isključuju (godišnji surveillance + 3-god. recert +
    obveza dostave nove verzije PU u 60 dana od isteka).
- **Kontinuirano ispunjavanje svih uvjeta** iz Zakona; ako IP prestane ispunjavati bilo koji uvjet → PU ga
  **briše s Popisa** i **obavještava njegove korisnike** (koji moraju izabrati drugog posrednika).
- **Status "ključnog subjekta"** po Zakonu o kibernetičkoj sigurnosti (NIS2): upravljanje rizicima, prijava
  incidenata, nadzor — trajni operativni/pravni teret (za mali tim najveća pojedinačna prepreka; `12-*` §1.4).

---

## 7. TKO IZDAJE ŠTO / TKO RADI ŠTO

| Artefakt / radnja | Tko |
|---|---|
| ePorezna račun, uloge Administrator/Tester | **Subjekt** (Administrator kreira Testera) |
| Kvalificirani X.509 certifikat (OIB u atributu) | **FINA / AKD** (izdavatelji s HR liste povjerenja) |
| ISO/IEC 27001 certifikat | **Akreditirana certifikacijska kuća** (neovisni auditor) |
| Dokumentacija čl. 61 (GDPR, EU-data, opseg izjave) | **Subjekt** sastavlja, učitava u PTS |
| Testni scenariji (opcionalno + završno) | **PTS** (PU platforma); prolazi ih Tester subjekta |
| **Potvrda o sukladnosti** | **Porezna uprava** |
| **Upis na Popis IP-a** (s opsegom usluga) | **Porezna uprava** |
| Ovlaštenje/punomoć da IP potpisuje u ime obveznika | **Krajnji korisnik** u ePorezna → FiskAplikacija (`13-*` §1) |

---

## 8. PRAKTIČNI TIMELINE (procjena)

⚠️ Sve procjene — PU ne jamči rokove; ovisi o pripremljenosti subjekta.

**Put "za vlastite potrebe":**
1. Certifikat + tehničko rješenje (Domibus/DomiSMP/CIS) — **tjedni–mjeseci** (glavni teret je razvoj).
2. Opcionalno testiranje do "zelenog" — dani–tjedni.
3. Završno testiranje — dani. → Nakon prolaska smijem u AMS. **Nema čekanja na potvrdu/upis.**

**Put "Informacijski posrednik":**
1. **ISO 27001** ishođenje — **najduže usko grlo** (tipično mjeseci ako se kreće od nule; uspostava ISMS-a).
2. NIS2 program + dokumentacija čl. 61 — paralelno, tjedni–mjeseci.
3. Tehničko rješenje + Opcionalno testiranje — tjedni.
4. Završno testiranje (svi scenariji opsega) — dani–tjedni.
5. Učitavanje dokumentacije + verifikacija PU → **potvrda o sukladnosti** → **upis na Popis** — ⚠️ trajanje
   verifikacije nije objavljeno; "automatizirano" nakon testa (Mišljenje 2636).

Ukupno za puni IP realno: **mjeseci** (dominira ISO + compliance ciklus), ne dani.

---

## 9. PREPORUKA ZA `domovina-fiskal`

Konzistentno s `12-*` §9 i `13-*` §6:
- **Faza 1 (sada):** aplikacijski sloj **nad postojećim IP-om** (Pondi / doku / FINA) preko punomoći —
  nula certifikacije, nula NIS2/ISO tereta. (Model kao FIRA.)
- **Faza 2 (kad ima volumena):** PT **"za vlastite potrebe"** — PTS svrha "za vlastite potrebe", Završno
  testiranje samo za scenarije koje koristim, objava **svog** OIB-a u AMS. Bez čl. 61/ISO/Popisa.
- **Faza 3 (tek ako gradimo proizvod-posrednik):** puni IP — ISO 27001 + NIS2 + čl. 61 + Popis. Zaseban
  strateški korak s trajnim compliance troškom; ne ulaziti bez jasne isplativosti.

---

## Izvori

- [zakon.hr — Zakon o fiskalizaciji (čl. 59–62)](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — uvjeti
  (čl. 59), testiranje kroz PTS (čl. 60), dokumentacija (čl. 61), rok obnove ISO 60 dana + brisanje (čl. 62);
  **nema odredbe o pristojbi** (pristup 2026-07-04)
- [Narodne novine — NN 89/2025 (Zakon o fiskalizaciji)](https://narodne-novine.nn.hr/eli/sluzbeni/2025/89/1233/pdf) — primarni pravni izvor (pristup 2026-07-04)
- [Porezna uprava — Popis informacijskih posrednika (8019)](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019) — **34 posrednika**, ažurirano **12.3.2026.**; stranica bez obrasca/zahtjeva, samo definicija + poveznica na Korisničku podršku (pristup 2026-07-04)
- [Porezna uprava — Mišljenje 2629: Testiranje sukladnosti informacijskih posrednika](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2629) — koraci, dokumentacija čl. 61, PU izdaje potvrdu o sukladnosti, objava na popisu; subjekti koji nisu IP ne trebaju prethodnu dokumentaciju (pristup 2026-07-04)
- [Porezna uprava — Mišljenje 2636: Fiskalizacija 2.0, informacijski posrednici (24.07.2025.)](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2636) — postojeći posrednici nisu automatski; ISO 27001 kao preduvjet; vremenski okvir ovisi o brzini testa; proces "automatiziran" nakon testa (pristup 2026-07-04)
- [Porezna uprava — Pokrenut Portal za testiranje sukladnosti](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/pokrenut-portal-za-testiranje) — pristup preko ePorezna, uloge Administrator/Tester, opcionalno vs završno, obveza od 01.09.2025. (pristup 2026-07-04)
- [Porezna uprava — Objavljeni prvi informacijski posrednici](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/fiskalizacija-informacijski-posrednici) — opseg usluga IP-a, potvrda o sukladnosti (pristup 2026-07-04)
- [Porezna uprava — Organizacija i procedure PTS (doc 105, v1.1)](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105) — uloge, svrhe testiranja, scenariji MPS/eRačun/fiskalizacija/eIzvještavanje, opcionalno vs završno (pristup 2026-07-04)
- [Porezna uprava — Pristupna točka (8053)](https://porezna-uprava.gov.hr/hr/pristupna-tocka/8053) — PT kao IP ili obveznik s vlastitim rješenjem (pristup 2026-07-04)
- [PTS — Portal za testiranje sukladnosti](https://pts.porezna-uprava.hr/) — pristup preko ePorezna (pristup 2026-07-04)

> Interne reference: `12-vlastita-pristupna-tocka.md` (tehnički stog AS4/MPS/AMS/CIS, §3 PTS scenariji, §9
> fazni pristup), `13-provideri-krajolik.md` (34 upisana IP-a, punomoć u FiskAplikaciji), `03-*` (okvir/rokovi).

---

## Razrješenje otvorenih ⚠️ (krug 2 — 2026-07-04)

- ⚠️→potvrđeno-da-NE-postoji **Trajanje verifikacije/izdavanja potvrde o sukladnosti nakon uspješnog testa + učitane dokumentacije** → **Nema objavljenog roka ni u jednom službenom izvoru.** Zakon o fiskalizaciji čl. 59–62 ne propisuje rok u kojem PU izdaje potvrdu/upisuje na Popis (potvrđeno na zakon.hr, tekst čl. 59: uvjet je samo dostava dokumentacije + uspješan test). Doc 105 (Organizacija i operativne procedure PTS, v1.1 od 11.8.2025.) također ne navodi rok — samo opisuje da je Portal "automatiziran". Mišljenje 2636 ostaje jedini navod: "vremenski okvir ovisi o obvezniku i brzini prolaska testa", proces "automatiziran" nakon testa. Zaključak: **rok ne postoji kao propisana/objavljena kategorija** (nije skriven iza logina — jednostavno nije normiran). Izvori: [zakon.hr čl. 59–62](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) · [doc 105](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105) · [Mišljenje 2636](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2636).

- ✅ **Interni PTS predložak/format za izjave iz čl. 61 (GDPR čl. 32, EU-data, opseg usluga)** → **Ne postoji propisani obrazac ni predložak — izjave se pišu slobodno i učitavaju u PTS.** Potvrđeno tri neovisna izvora: (1) zakon.hr — čl. 61 taksativno navodi 4 dokumenta ali **ne propisuje formu ni obrazac**; (2) doc 105 §3.1 — Administrator "učitava zakonom propisanu dokumentaciju koja je obvezna za sve Informacijske posrednike", bez ikakvog predloška/formata; (3) Mišljenje 2629 — nabraja sadržaj dokumenata bez download-obrasca. **Nema download-predloška ni na PU stranicama ni u doc 105.** Sama tehnička forma učitavanja (dopušteni tip datoteke, veličina) vidljiva je tek unutar PTS aplikacije nakon prijave — ali *sadržajni* predložak ne postoji, izjave su slobodne forme. Izvori: [zakon.hr čl. 61](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) · [doc 105](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105) · [Mišljenje 2629](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2629).

- ✅ **Odnos "obnova ISO svake 3 god." (ISO ciklus) vs zakonski rok "60 dana od isteka" (čl. 62)** → **Razjašnjeno; dvije neovisne stvari, ne isključuju se.** Doslovan tekst čl. 62 (potvrđeno na zakon.hr): *"Informacijski posrednik dužan je nakon isteka valjanosti certifikata za ISO/IEC 27001, bez odgađanja, a najkasnije u roku od 60 dana, Poreznoj upravi dostaviti najnoviju verziju certifikata."* Neispunjenje → brisanje s Popisa. Operativno: **"60 dana" je zakonski *grace period za DOSTAVU* obnovljenog certifikata PU nakon što postojećem istekne valjanost** — nije to ciklus certifikacije. **"Svake 3 god." je ISO-vlastiti certifikacijski ciklus** (izdavanje na 3 god. + godišnji nadzorni/surveillance auditi certifikacijske kuće, pa recertifikacija). Dakle: ISMS održavaš kontinuirano po ISO ciklusu (godišnji surveillance, 3-god. recert), a *prema PU* imaš samo jednu vremenski vezanu obvezu — predati novu verziju certifikata unutar 60 dana od isteka stare. Izvor: [zakon.hr čl. 62](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji).

- ✅ **Precizan potpun popis pod-scenarija Završnog testiranja po opsegu usluga** → **JAVAN u cijelosti u doc 105 (§4.1–4.3), nije skriven u PTS aplikaciji.** Potvrđeni doslovni pod-scenariji iz [doc 105](https://porezna.gov.hr/fiskalizacija/api/dokumenti/105):
  - **Područja testiranja (doc 105 §4):** MPS · eRačun · Fiskalizacija i eIzvještavanje · **Završni test za pružatelje usluga trećim stranama** · **Završni test za porezne obveznike koji rade za sebe** (dva odvojena završna toka).
  - **MPS (§4.1):** (a) Objava poreznog obveznika u AMS · (b) Brisanje podataka poreznog obveznika iz AMS-a · (c) Dohvat adrese primatelja eRačuna. Za završni test MPS-a nužno: uspješne metode objave i brisanja u AMS **+ razmjena podataka s drugom pristupnom točkom**.
  - **Razmjena eRačuna (§4.2):** (a) **Slanje** — AMS upit za ID PO (lokacija MPS-a) → obrada AMS odgovora + MPS upit (krajnja lokacija) → obrada MPS odgovora + **AS4 slanje** PT-u primatelja; (b) **Zaprimanje** — objava PO u AMS preko MPS-a → odgovor MPS-u na upit PT-a izdavatelja (podaci o PT za zaprimanje) → **AS4 zaprimanje**.
  - **Fiskalizacija i eIzvještavanje (§4.3):** (a) Fiskalizacija **izlaznog** eRačuna · (b) Fiskalizacija **ulaznog** eRačuna · (c) eIzvještavanje o **odbijanju** ulaznog eRačuna · (d) eIzvještavanje o **naplati** izlaznog eRačuna.
  - **Pravilo opsega (doc 105 str.10):** tko fiskalizira **za sebe → nije obvezan** proći završni fiskalni test (izlazni/ulazni + eIzvještavanje naplate/odbijanja); tko je **pružatelj usluge trećima → obvezan proći SVE** navedene scenarije. Isto načelo za MPS (za sebe ili kao pružatelj — u oba slučaja MPS pružatelj mora proći završni MPS test).
  - Napomena: postojeći popis u §3.5 ovog dokumenta bio je točan; ovime je **potvrđeno da je 100% javno** (doc 105), a ne samo unutar PTS-a. Jedino tehnički detalji pojedinih poziva ("tehnička dokumentacija za sve metode") dostupni su unutar Portala.

# 01 — Pravni okvir fiskalizacije u Hrvatskoj (1.0 i 2.0)

> Stanje na dan **2026-07-04**. Dokument opisuje pravni okvir hrvatske fiskalizacije:
> stari režim ("Fiskalizacija 1.0", gotovinski računi) i novi režim
> ("Fiskalizacija 2.0", eRačun + e-izvještavanje) uveden Zakonom o fiskalizaciji
> (NN 89/25).
>
> ⚠️ **Napomena o pouzdanosti:** NN brojevi, datumi stupanja na snagu i rokovi
> potkrijepljeni su primarnim izvorima (Narodne novine, Porezna uprava). Točni
> **brojevi članaka** i **precizni iznosi novčanih kazni** izvučeni su iz
> sekundarne obrade službenog teksta i mjestimično su nekonzistentni između
> izvora — svako oslanjanje na konkretan broj članka ili iznos kazne treba
> provjeriti izravno u pročišćenom tekstu Zakona (NN 89/25) prije produkcijske
> uporabe. Takva mjesta su niže eksplicitno označena znakom ⚠️.

---

## 0. Sažetak (TL;DR)

| Pitanje | Odgovor |
|---|---|
| Stari zakon | **Zakon o fiskalizaciji u prometu gotovinom**, NN **133/12** + izmjene 115/16, 106/18, 121/19, 138/20, 114/23 |
| Novi zakon | **Zakon o fiskalizaciji**, NN **89/25** (objavljen 13.6.2025.) |
| Sabor donio novi zakon | 6. lipnja 2025. |
| Novi zakon na snazi | **1. rujna 2025.** (stari prestaje vrijediti istog dana) |
| eRačun B2B/B2G — PDV obveznici izdaju | **1. siječnja 2026.** |
| Obveza **zaprimanja** eRačuna (svi, uklj. ne-PDV) | **1. siječnja 2026.** |
| e-Izvještavanje (eIzvještavanje) | **1. siječnja 2026.** |
| eRačun — ne-PDV obveznici (porez na dohodak/dobit izvan PDV-a) izdaju | **1. siječnja 2027.** |
| MIKROeRAČUN (besplatna aplikacija za izdavanje) | **1. siječnja 2027.** |
| Nadležnost | Ministarstvo financija (propisi) + Porezna uprava (provedba/nadzor) |

Ključna konceptualna razlika:
- **Fiskalizacija 1.0** = fiskalizacija **gotovinskih** računa (B2C u gotovini/kartici) preko CIS-a Porezne uprave, s **ZKI** i **JIR**.
- **Fiskalizacija 2.0** = obvezno **e-fakturiranje (eRačun)** u B2B/B2G + **e-izvještavanje** o računima, uz zadržanu (i proširenu) fiskalizaciju računa u krajnjoj potrošnji.

---

## 1. Fiskalizacija 1.0 — Zakon o fiskalizaciji u prometu gotovinom

### 1.1. Osnovni akt i povijest izmjena

**Zakon o fiskalizaciji u prometu gotovinom** donio je Hrvatski sabor
**23. studenoga 2012.**, objavljen u **NN 133/12**
([službeni tekst](https://narodne-novine.nn.hr/clanci/sluzbeni/2012_12_133_2822.html)).
U primjeni od **1. siječnja 2013.** (fazno po djelatnostima tijekom 2013.).

Kronologija izmjena i dopuna:

| NN broj | Godina | Napomena |
|---|---|---|
| **133/12** | 2012. | Osnovni tekst |
| **115/16** | 2016. | Izmjene i dopune (Sabor 2.12.2016.) |
| **106/18** | 2018. | Izmjene i dopune |
| **121/19** | 2019. | Izmjene i dopune |
| **138/20** | 2020. | Izmjene (Sabor 4.12.2020.) — [tekst](https://narodne-novine.nn.hr/clanci/sluzbeni/2020_12_138_2628.html) |
| **114/23** | 2023. | Izmjene i dopune (Sabor 28.9.2023.), na snazi od 1.1.2024. — [tekst](https://narodne-novine.nn.hr/clanci/sluzbeni/2023_10_114_1612.html) |

> ⚠️ Neki pregledi navode i NN **121/19** (praćeno pratećim pravilnicima), a
> konsolidacije variraju; mjerodavan je pročišćeni tekst na
> [zakon.hr/z/548](https://www.zakon.hr/z/548/zakon-o-fiskalizaciji-u-prometu-gotovinom).

Provedbeni akt: **Pravilnik o fiskalizaciji u prometu gotovinom** (više izmjena,
npr. NN 144/21, 125/22, 1/24).

### 1.2. Što je uređivao (bit režima 1.0)

- Obveznik fiskalizacije koji **naplaćuje račun sredstvima koja se smatraju
  gotovinom** (novčanice/kovanice, **kartice**, ček, ostala bezgotovinska sredstva
  koja nisu izravna transakcija na račun) dužan je **svaki takav račun prijaviti
  (fiskalizirati) u realnom vremenu** u Centralni informacijski sustav (CIS)
  Porezne uprave.
- Na temelju certifikata (FINA aplikativni certifikat) generira se **ZKI**
  (zaštitni kod izdavatelja), a CIS vraća **JIR** (jedinstveni identifikator
  računa). Oba se ispisuju na računu. (Tehnički detalji: `docs/knowledge/02-*`.)
- Obveza izdavanja računa za **svaki** promet i **prijave poslovnih prostora**,
  oznaka operatera, oznaka naplatnog uređaja itd.

### 1.3. Status na 2026-07-04

Zakon o fiskalizaciji u prometu gotovinom **prestao je vrijediti 1. rujna 2025.**,
stupanjem na snagu novog Zakona o fiskalizaciji (NN 89/25). Materija gotovinske
fiskalizacije preseljena je u novi zakon (uz izmjene), pa se **fiskalizacija
gotovinskih/B2C računa nastavlja**, ali sada u okviru objedinjenog zakona.

---

## 2. Fiskalizacija 2.0 — novi Zakon o fiskalizaciji (NN 89/25)

### 2.1. Identifikacija akta

- **Naziv:** Zakon o fiskalizaciji
- **NN broj:** **89/25**
- **Donio:** Hrvatski sabor **6. lipnja 2025.**
- **Objavljen:** **13. lipnja 2025.** (NN 89/2025)
- **Stupa na snagu:** **1. rujna 2025.** (uz odgođenu primjenu pojedinih odredaba —
  vidi §2.4)
- Službeni tekst: [narodne-novine.nn.hr/.../2025_06_89_1233.html](https://narodne-novine.nn.hr/clanci/sluzbeni/2025_06_89_1233.html)
- Pročišćeni/radni tekst: [zakon.hr/z/3960](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji)

Stupanjem na snagu prestaje vrijediti stari **Zakon o fiskalizaciji u prometu
gotovinom** (NN 133/12, 115/16, 106/18, 121/19, 138/20, 114/23).

### 2.2. Predmet zakona

Zakon objedinjuje u jedinstveni porezno-pravni okvir:

1. **Fiskalizaciju računa u krajnjoj potrošnji** (B2C) — nasljeđuje i proširuje
   režim 1.0 (uključujući kartice te digitalne servise plaćanja).
2. **Izdavanje i fiskalizaciju eRačuna između poreznih obveznika** (B2B).
3. **Fiskalizaciju računa između poreznih obveznika i tijela javne vlasti** (B2G).
4. **e-Izvještavanje** (eIzvještavanje) Porezne uprave o izdanim/zaprimljenim
   računima i o odbijenim eRačunima.

Izvor sažetka: [Porezna uprava — Fiskalizacija eRačuna](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-7716/7716),
[HOK — novi Zakon o fiskalizaciji](https://www.hok.hr/aktualno/na-snagu-je-stupio-novi-zakon-o-fiskalizaciji-koji-donosi-velike-promjene-u-poslovanju).

### 2.3. Tko je obveznik

Obveznik fiskalizacije je, u pravilu:

- **obveznik poreza na dohodak od samostalne djelatnosti** (obrtnici, slobodna
  zanimanja) i
- **obveznik poreza na dobit** (d.o.o., j.d.o.o., d.d. i ostala trgovačka društva),
- te **tijela javne vlasti** (za B2G zaprimanje/izdavanje).

Razlikovanje po statusu PDV-a bitno je **samo za rokove** izdavanja eRačuna
(vidi §2.4), ne za samo svojstvo obveznika:

- **PDV obveznici** (upisani u registar obveznika PDV-a): izdaju eRačune od
  **1.1.2026.**
- **Ne-PDV obveznici** (porez na dohodak/dobit, ali izvan sustava PDV-a; „mali
  porezni obveznici"): izdaju eRačune od **1.1.2027.**; **zaprimati** eRačune
  moraju već od **1.1.2026.**

> ⚠️ Precizna definicija obveznika i eventualne iznimke po statusu vezane su uz
> konkretne članke Zakona (izvori navode čl. 2. za definicije te posebne članke
> za eRačun). Brojeve članaka treba potvrditi u NN 89/25.

### 2.4. Rokovi faznog uvođenja (prijelazne i završne odredbe)

| Datum | Što stupa na snagu / počinje se primjenjivati |
|---|---|
| **1.9.2025.** | Zakon na snazi. Fiskalizacija računa (gotovina/krajnja potrošnja) po novom zakonu; **online prijava poslovnih prostora**; ukida se obveza isticanja oznake **„OVO NIJE FISKALIZIRANI RAČUN"** na pratećim dokumentima. |
| **1.1.2026.** | • PDV obveznici **izdaju i fiskaliziraju eRačune** u B2B (i B2G).<br>• **Svi** porezni obveznici (uključujući ne-PDV) moraju **zaprimati** eRačune i čuvati ih.<br>• Počinje **eIzvještavanje**.<br>• Fiskalizacija se proširuje na **kartice i digitalne servise plaćanja** (npr. PayPal, Google Pay, Stripe).<br>• Završava prijelazno razdoblje — obveznik mora imati registriranog **informacijskog posrednika** (ili vlastito rješenje). |
| **1.1.2027.** | • **Ne-PDV obveznici** (porez na dohodak/dobit izvan sustava PDV-a) počinju **izdavati i fiskalizirati eRačune**.<br>• Dostupna besplatna aplikacija **MIKROeRAČUN** za izdavanje eRačuna. |

Izvori za rokove: [RRiF — Rokovi za prilagodbu Fiskalizaciji 2.0](https://www.rrif.hr/rokovi_za_prilagodbu_fiskalizaciji_2_0-4175-misljenje/),
[HOK](https://www.hok.hr/aktualno/na-snagu-je-stupio-novi-zakon-o-fiskalizaciji-koji-donosi-velike-promjene-u-poslovanju),
[Porezna uprava — Vlada usvojila Prijedlog Zakona](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/vlada-rh-usvojila-prijedlog-zakona-o-fiskalizaciji).

> ⚠️ **Nekonzistentnost oko MIKROeRAČUN-a:** dio izvora navodi da je aplikacija
> za **zaprimanje** dostupna već od 1.1.2026., a za **izdavanje** od 1.1.2027.
> Za praktičnu upotrebu (naš servis) relevantno je: **izdavanje** eRačuna preko
> MIKROeRAČUN-a od **1.1.2027.** Provjeriti aktualnu objavu Porezne uprave.

### 2.5. eIzvještavanje (kratko)

- Uz eRačun uvodi se obveza **e-izvještavanja** Porezne uprave o računima.
- Prema pregledima: mjesečno izvješćivanje (do **20.** u mjesecu za prethodni
  mjesec) o izdanim računima te o **odbijenim** eRačunima; u slučaju nemogućnosti
  dostave eRačuna, obavijest Poreznoj upravi u kratkom roku (navodi se **5 dana**).
- ⚠️ Točni rokovi i sadržaj eIzvještavanja uređeni su Zakonom i podzakonskim
  aktom (Pravilnik) — detalji u `docs/knowledge/06-*` (KPD/eRačun) i pratećim
  dokumentima; brojke provjeriti u službenoj tehničkoj dokumentaciji.

### 2.6. Iznimke od fiskalizacije

Zakon predviđa iznimke (djelatnosti/situacije koje **nisu** predmet fiskalizacije
računa), npr.: prodaja vlastitih poljoprivrednih proizvoda, prijevozne/putne karte,
cestarine, poštanske usluge, bankarske i određene financijske usluge, zdravstvene
usluge, lutrijske igre i slično.

> ⚠️ Izvori navode iznimke u okviru **čl. 4.** Zakona. Konkretan popis i opseg
> iznimaka treba potvrditi u NN 89/25 i Pravilniku prije primjene.

### 2.7. Obveza isticanja upozorenja / obavijesti kupcu

- Obveznik mora na vidljivom mjestu istaknuti **obavijest o obvezi izdavanja
  računa te obvezi kupca da preuzme i zadrži račun**.
- **Kupac** je dužan zadržati račun (na papiru ili u drugom obliku) po izlasku iz
  poslovnog prostora te ga na zahtjev predočiti ovlaštenoj osobi.
- Novost 2.0: **ukida se** ranija obveza isticanja teksta
  **„OVO NIJE FISKALIZIRANI RAČUN"** na neobvezujućim/pratećim dokumentima
  (ponude, predračuni) — vrijedi od 1.9.2025.

> ⚠️ Brojevi članaka za obavijest kupcu variraju između izvora (navode se čl. 25.
> odnosno čl. 27.–29.). Potvrditi u tekstu NN 89/25.

### 2.8. Čuvanje evidencija

- eRačuni i pripadajuće evidencije čuvaju se **šest (6) godina od isteka godine**
  u kojoj su eRačuni izdani.
- ⚠️ Rok od 6 godina odnosi se na fiskalizacijske evidencije po ovom zakonu;
  napominjemo da drugi propisi (Zakon o računovodstvu, Zakon o PDV-u, Opći
  porezni zakon) mogu propisivati **dulje** rokove čuvanja za pojedine isprave
  (npr. knjigovodstvene isprave i dokumentacija) — primjenjuje se dulji rok.

### 2.9. Kaznene / prekršajne odredbe

Zakon propisuje novčane kazne za neprovođenje fiskalizacije, neispravno
izdavanje/fiskalizaciju eRačuna, neizvještavanje i sl. Okvirni rasponi (⚠️
**indikativno**, provjeriti u NN 89/25):

| Kategorija | Pravna osoba | Odgovorna osoba | Fizička osoba / obrtnik |
|---|---|---|---|
| Teži prekršaji (npr. neprovođenje fiskalizacije, neispravan eRačun) | ~ **3.980 – 66.360 €** | ~ **660 – 6.630 €** | ~ **3.980 – 39.810 €** |
| Lakši prekršaji (nepotpune prijave, propušteni rokovi) | ~ **1.320 – 26.540 €** | — | ~ **660 – 13.270 €** |
| Kupac (nedržanje/nepredočenje računa) | — | — | ~ **30 – 260 €** |

Dodatno: moguća mjera **privremene zabrane rada** (zatvaranja poslovnog prostora)
do nekoliko dana za teže/ponovljene prekršaje.

> ⚠️ Iznosi i razvrstavanje po člancima (navode se čl. 71.–73., uz mogući čl. 66.
> za zabranu rada) **nisu pouzdano usklađeni** među izvorima. Ovo su orijentacijski
> rasponi; **obavezno** provjeriti mjerodavni tekst NN 89/25 prije citiranja.

### 2.10. Nadležnost

- **Ministarstvo financija** — donosi provedbene propise (pravilnike) u zakonom
  propisanom roku i uređuje tehničke detalje.
- **Porezna uprava** (u sastavu MF-a) — provodi fiskalizaciju, vodi CIS/sustav
  eRačuna i eIzvještavanja, obavlja nadzor.
- **Carinska uprava** — sudjeluje u nadzoru (inspekcijski nadzor) u dijelu svojih
  ovlasti.

---

## 3. Razlika: „fiskalizacija gotovinskih računa" vs „obvezno e-fakturiranje"

| Značajka | Fiskalizacija 1.0 (gotovinski računi) | Fiskalizacija 2.0 / eRačun (e-fakturiranje) |
|---|---|---|
| Segment | **B2C** — krajnja potrošnja | **B2B / B2G** (+ zadržana B2C fiskalizacija) |
| Okidač | Naplata **gotovinom/karticom** i sl. | **Izdavanje računa** drugom poreznom obvezniku / javnom tijelu, neovisno o načinu plaćanja |
| Format | Račun iz naplatnog uređaja (papir/PDF) s **JIR + ZKI** | **Strukturirani eRačun** (EN 16931 / HR CIUS, npr. UBL/CII XML) razmijenjen preko posrednika / Peppol |
| Tehnika | SOAP → CIS Porezne uprave, XML-DSIG, ZKI (RSA-SHA1+MD5), JIR | eRačun kroz **informacijskog posrednika** / MIKROeRAČUN + **fiskalizacija eRačuna** i **eIzvještavanje** prema Poreznoj upravi |
| Svrha | Kontrola gotovinskog prometa (siva ekonomija) | Digitalizacija računa, automatsko PDV-izvještavanje, EU trend (VAT in the Digital Age / ViDA) |
| Na snazi | 2013.–2025. (sada u okviru novog zakona) | Od 1.1.2026. (PDV) / 1.1.2027. (ne-PDV) |

Ključno: to **nisu** dvije odvojene stvari koje se biraju — od 2026. većina
obveznika ima **oboje**: nastavlja fiskalizirati B2C račune **i** izdaje/zaprima
fiskalizirane eRačune u B2B/B2G.

### 3.1. Kripto/stablecoin plaćanja = transakcijski način plaćanja

> Izvor: Matija (2026-07-06), na temelju službenih mišljenja Porezne uprave o
> kriptovalutama/stablecoinima. ⚠️ Bez konkretnog URL-a mišljenja — potvrditi s
> knjigovođom/PU prije oslanjanja u produkcijskim tokovima.

Plaćanje u **stablecoinu** (EURe, USDC, USDT…) na javnim blockchain mrežama
(npr. Gnosis Chain) Porezna uprava tretira kao **transakcijsku uplatu**
(virmansko plaćanje, "račun na račun"), **ne** kao gotovinu ni karticu:

- **Nije gotovina/kartica:** zakonska definicija "gotovine" obuhvaća novčanice
  i kovanice, kartice (uz kartičnu kuću koja autorizira kroz bankarski sustav)
  i čekove. Kripto/stablecoin novčanik (Metamask, Safe multisig…) nema kartičnu
  kuću ni autorizaciju kroz bankarski sustav → ne ulazi u tu definiciju.
- **Jest transakcijska uplata:** on-chain prijenos tokena s adrese na adresu
  ekvivalentan je prijenosu s računa na račun → pravni status **bezgotovinskog
  (virmanskog) plaćanja**.

**Posljedice za izdavanje računa (od 2026.):**

| Kupac | Plaćeno stablecoinom / transakcijski | Obveza |
|---|---|---|
| **B2B** (porezni obveznik) | transakcijska uplata → **čl. 39 iznimka NE vrijedi** (ona pokriva samo gotovinu/kartice) | Račun **mora** ići kao **eRačun (Fiskalizacija 2.0)**. Fiskalizacija 1.0 (JIR/ZKI) tu **zakonski ne prolazi**. |
| **B2C** (građanin) | neovisno o načinu plaćanja (gotovina, kartica, transakcijski — uklj. stablecoin) | Od 2026. **svi B2C računi** prolaze fiskalizaciju računa (JIR, ZKI, QR). |

Praktično za domovina-fiskal: naplata preko pay.domovina.ai raila (SEPA →
Monerium → **EURe na Gnosisu**) prema B2B kupcu znači **obvezu eRačuna**, ne
transakcijskog PDF računa ni FISKALNI_B2C — vidi `17-licenca-onboarding.md` §1.

---

## 4. Poveznice na druge propise

### 4.1. Zakon o porezu na dodanu vrijednost (PDV) — obvezni sadržaj računa

- **Zakon o PDV-u**, NN **73/13** (+ brojne izmjene) —
  [zakon.hr/z/1455](https://www.zakon.hr/z/1455/zakon-o-porezu-na-dodanu-vrijednost),
  [NN 73/13](https://narodne-novine.nn.hr/clanci/sluzbeni/2013_06_73_1451.html).
- **Članak 79.** propisuje **obvezni sadržaj računa** (obvezne elemente),
  npr.: broj računa i datum izdavanja; naziv/OIB izdavatelja i primatelja;
  količina i vrsta isporuke; datum isporuke; jedinična cijena bez PDV-a;
  popusti; porezna osnovica po stopi; primijenjena stopa PDV-a; iznos PDV-a; te
  **napomena/uputa na odredbu** kad je isporuka oslobođena PDV-a
  ([čl. 79., PDV aktualno](https://www.pdvaktualno.hr/33/clanak-79-obvezni-sadrzaj-racuna-uniqueidmRRWSbk196E4DjKFq6pChG6vuuclhFodfepYl11cGkqiKebrrbyYXg/?uri_view_type=19)).
- **Mali porezni obveznici** (izvan sustava PDV-a) izdaju račune s obveznim
  elementima iz čl. 79. te navode **klauzulu o oslobođenju** (npr. „PDV nije
  obračunan temeljem čl. 90. st. 2. Zakona o PDV-u")
  ([TEB — klauzula o oslobođenju od 1.1.2025.](https://www.teb.hr/novosti/2025/klauzula-o-oslobodenju-od-placanja-pdv-a-na-racunima-malih-poreznih-obveznika-od-112025/)).
- Provedba: **Pravilnik o porezu na dodanu vrijednost**, NN **79/13**
  ([tekst](https://narodne-novine.nn.hr/clanci/sluzbeni/2013_06_79_1633.html)).

Za naš servis: struktura eRačuna (EN 16931 / HR CIUS) mora nositi sve elemente iz
čl. 79. — mapiranje polja opisano je u `docs/knowledge/06-*` (KPD/eRačun shema).

### 4.2. Zakon o računovodstvu

- **Novi Zakon o računovodstvu**, NN **85/24** — stupio na snagu i **stavio izvan
  snage** raniji Zakon o računovodstvu (NN 78/15, 134/15, 120/16, 116/18, 42/20,
  47/20, 114/22, 82/23)
  ([TEB — Novi Zakon o računovodstvu NN 85/24](https://www.teb.hr/novosti/2024/novi-zakon-o-racunovodstvu-nar-nov-br-8524/)).
- Uređuje knjigovodstvene isprave (uključujući račune kao vjerodostojne isprave),
  poslovne knjige, financijske izvještaje i **rokove čuvanja** dokumentacije.
- Poveznica na fiskalizaciju: eRačun je istovremeno **knjigovodstvena isprava** —
  mora zadovoljiti i računovodstvene i fiskalne (PDV + fiskalizacija) zahtjeve;
  rokovi čuvanja po Zakonu o računovodstvu mogu biti **dulji** od fiskalnog roka
  od 6 godina, pa se primjenjuje dulji.

> ⚠️ NN broj ranijeg Zakona o računovodstvu (78/15) je potvrđen; činjenicu da je
> **NN 85/24** aktualni akt provjeriti izravno na
> [narodne-novine.nn.hr](https://narodne-novine.nn.hr) / [mfin.gov.hr](https://mfin.gov.hr)
> jer se sekundarni izvori razlikuju u datumu početka primjene.

---

## 5. Praktične implikacije za `domovina-fiskal`

- Naš servis mora podržati **oba** svijeta: (a) fiskalizaciju B2C računa (JIR/ZKI,
  CIS) i (b) **eRačun** (izdavanje/zaprimanje, fiskalizacija eRačuna, eIzvještavanje).
- **Rok koji nas vremenski pritišće:** od **1.1.2026.** PDV obveznici izdaju
  eRačune i svi zaprimaju eRačune → to je već **na snazi** na dan 2026-07-04.
- Ne-PDV korisnici (mali obrtnici) postaju **izdavatelji** eRačuna tek od
  **1.1.2027.** — do tada trebaju barem **zaprimati** i (za B2C) fiskalizirati.
- Model „izdavatelj = server-side (tenant iza API ključa), payload = kupac+stavke+tip"
  (vidi `docs/reference/fira-custom-webshop-api.md`) ostaje ispravan; zakon ne
  nalaže drukčiju arhitektonsku podjelu.

---

## Izvori

- [Narodne novine — Zakon o fiskalizaciji, NN 89/25 (službeni tekst)](https://narodne-novine.nn.hr/clanci/sluzbeni/2025_06_89_1233.html) — novi zakon, matični izvor (pristup 2026-07-04)
- [zakon.hr — Zakon o fiskalizaciji (z/3960)](https://www.zakon.hr/z/3960/zakon-o-fiskalizaciji) — radni/pročišćeni tekst novog zakona (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija eRačuna (7716)](https://porezna-uprava.gov.hr/hr/fiskalizacija-eracuna-7716/7716) — službeni pregled Fiskalizacije 2.0 (pristup 2026-07-04)
- [Porezna uprava — Vlada RH usvojila Prijedlog Zakona o fiskalizaciji](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/vlada-rh-usvojila-prijedlog-zakona-o-fiskalizaciji) — datumi stupanja/primjene (pristup 2026-07-04)
- [Narodne novine — Zakon o fiskalizaciji u prometu gotovinom, NN 133/12](https://narodne-novine.nn.hr/clanci/sluzbeni/2012_12_133_2822.html) — osnovni tekst starog zakona (pristup 2026-07-04)
- [Narodne novine — ZID Zakona o fiskalizaciji u prometu gotovinom, NN 138/20](https://narodne-novine.nn.hr/clanci/sluzbeni/2020_12_138_2628.html) — izmjene 2020. (pristup 2026-07-04)
- [Narodne novine — ZID Zakona o fiskalizaciji u prometu gotovinom, NN 114/23](https://narodne-novine.nn.hr/clanci/sluzbeni/2023_10_114_1612.html) — izmjene 2023. (pristup 2026-07-04)
- [zakon.hr — Zakon o fiskalizaciji u prometu gotovinom (z/548)](https://www.zakon.hr/z/548/zakon-o-fiskalizaciji-u-prometu-gotovinom) — pročišćeni tekst starog zakona (pristup 2026-07-04)
- [RRiF — Rokovi za prilagodbu Fiskalizaciji 2.0](https://www.rrif.hr/rokovi_za_prilagodbu_fiskalizaciji_2_0-4175-misljenje/) — fazni rokovi po statusu PDV-a (pristup 2026-07-04)
- [Hrvatska obrtnička komora — Na snagu je stupio novi Zakon o fiskalizaciji](https://www.hok.hr/aktualno/na-snagu-je-stupio-novi-zakon-o-fiskalizaciji-koji-donosi-velike-promjene-u-poslovanju) — promjene za obrtnike, rokovi 2026./2027. (pristup 2026-07-04)
- [RRiF — Objavljen je novi Zakon o fiskalizaciji](https://www.rrif.hr/objavljen_je_novi_zakon_o_fiskalizaciji-2439-vijest/) — datum objave/donošenja (pristup 2026-07-04)
- [Narodne novine — Zakon o PDV-u, NN 73/13](https://narodne-novine.nn.hr/clanci/sluzbeni/2013_06_73_1451.html) — obvezni elementi računa (čl. 79.) (pristup 2026-07-04)
- [zakon.hr — Zakon o porezu na dodanu vrijednost (z/1455)](https://www.zakon.hr/z/1455/zakon-o-porezu-na-dodanu-vrijednost) — pročišćeni tekst PDV zakona (pristup 2026-07-04)
- [PDV aktualno — Članak 79. Obvezni sadržaj računa](https://www.pdvaktualno.hr/33/clanak-79-obvezni-sadrzaj-racuna-uniqueidmRRWSbk196E4DjKFq6pChG6vuuclhFodfepYl11cGkqiKebrrbyYXg/?uri_view_type=19) — razrada obveznih elemenata računa (pristup 2026-07-04)
- [TEB — Klauzula o oslobođenju od PDV-a na računima malih poreznih obveznika (od 1.1.2025.)](https://www.teb.hr/novosti/2025/klauzula-o-oslobodenju-od-placanja-pdv-a-na-racunima-malih-poreznih-obveznika-od-112025/) — sadržaj računa ne-PDV obveznika (pristup 2026-07-04)
- [Narodne novine — Pravilnik o PDV-u, NN 79/13](https://narodne-novine.nn.hr/clanci/sluzbeni/2013_06_79_1633.html) — provedba PDV zakona (pristup 2026-07-04)
- [TEB — Novi Zakon o računovodstvu (NN 85/24)](https://www.teb.hr/novosti/2024/novi-zakon-o-racunovodstvu-nar-nov-br-8524/) — aktualni Zakon o računovodstvu (pristup 2026-07-04)
- [Narodne novine — Zakon o računovodstvu, NN 78/15](https://narodne-novine.nn.hr/clanci/sluzbeni/2015_07_78_1493.html) — raniji Zakon o računovodstvu (pristup 2026-07-04)

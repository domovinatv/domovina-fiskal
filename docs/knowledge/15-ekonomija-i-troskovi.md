# 15 — Ekonomija i troškovi: "ako sam sam posrednik, dostava eRačuna ne košta ništa"?

> Stanje / provjera izvora: **2026-07-04**. Prioritet: Porezna uprava, FINA, javni cjenici posrednika.
> Dopunjuje `12-vlastita-pristupna-tocka.md` (tehnika/pravni teret PT/IP) i `13-provideri-krajolik.md` (krajolik, cijene).
> Cilj: pošteno razložiti **marginalni** (varijabilni) vs **fiksni + compliance** trošak dostave eRačuna,
> i odgovoriti na korisnikovu pretpostavku.

---

## 0. TL;DR — je li pretpostavka točna?

**Djelomično točna, i to samo na marginalnoj razini.** "Dostava jednog dodatnog eRačuna" preko vlastite
pristupne točke (PT) je **blizu 0 €** — jer:
- **Porezna uprava NE naplaćuje** ni po eRačunu ni po poruci: AMS (discovery), MPS (metapodaci), fiskalizacija
  eRačuna i eIzvještavanje (CIS `evidentiraj*`) su **besplatna državna infrastruktura**. ⚠️ Nigdje u NN 89/2025
  ni na PU stranicama nema tarife po transakciji (potvrđeno izostankom bilo kakve naknade na službenim stranicama).
- Domaća razmjena je **direktan 4-corner AS4** (point-to-point između PT-ova), **bez** središnjeg clearinga /
  interchange naknade. Nema "Peppol-stila" obračuna po dokumentu prema mreži. → marginalni trošak = ~bandwidth ≈ 0.

**ALI pretpostavka je zavaravajuća** jer ignorira **fiksni CAPEX/OPEX i compliance teret**, koji je za vlastitu
PT **visok** i **ne ovisi o broju računa**. Podijeliti trošak na 3 računa mjesečno → dostava "košta" desetke eura
po računu; podijeliti na 10.000 → gotovo ništa. **Trošak dostave nije 0 — samo je gotovo sav FIKSAN.**

Poštena formulacija: **marginalno da (~0 €/račun), ali uz visok fiksni ulazak i (za puni status posrednika)
trajni compliance trošak koji čini vlastitu PT skupljom od korištenja posrednika za sve osim visokih volumena
ili multi-tenant preprodaje.**

---

## 1. Naknade Porezne uprave / državne mreže — naplaćuje li se dostava?

### 1.1. PU infrastruktura = BESPLATNA
Ne postoji naknada Porezne uprave po eRačunu ni po poruci. Državni slojevi koji su besplatni:

| Sloj | Što radi | Naplata PU |
|---|---|---|
| **AMS** (Adresar metapodatkovnih servisa) | DNS/BDXL discovery adrese primatelja | **0 €** (vodi MinFin/PU) |
| **MPS** poziv (`ManageBusinessIdentifier`, `SignedServiceMetadata`) | objava/dohvat metapodataka | **0 €** (PU ne naplaćuje pozive) |
| **Fiskalizacija eRačuna** (CIS `evidentirajERacun` …) | fiskalna evidencija izlaznog/ulaznog eR | **0 €** |
| **eIzvještavanje** (`evidentirajNaplatu`, `evidentirajOdbijanje` …) | izvještaji o naplati/odbijanju | **0 €** |
| **FiskAplikacija** | uvid u statuse, draft PDV-a | **0 €** ([PU vodič](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149)) |
| **MIKROeRAČUN** | besplatna PU aplikacija za male (ne-PDV) obveznike | **0 €** |

Državna namjera je eksplicitno da **temeljni kanal bude besplatan** (postoji čak i besplatna PU aplikacija
MIKROeRAČUN i besplatna FiskAplikacija). Naknade koje plaćate posredniku su **komercijalna marža posrednika**
za njegovu PT/uslugu, a **ne** državni namet.

### 1.2. Domaća AS4 mreža vs Peppol tarife
- **Domaći promet (HR↔HR):** razmjena ide **direktno** između pristupnih točaka preko `eRačun-AS4` (One-Way/Push,
  port 443). **Nema** središnje mrežne naknade po dokumentu — trošak prijenosa jedne poruke je praktički samo
  bandwidth i CPU za potpis. → **marginalni trošak dostave ≈ 0**. (Vidi `12-*` §2.1–2.2.)
- **Peppol (prekogranično):** tamo pojedini Access Point provideri interno mjere/naplaćuju po dokumentu, ali za
  **domaći** HR kanal Peppol se **ne koristi** (FINA je Peppol AP samo za prekogranično; vidi `12-*` §5). Dakle
  domaći scenarij nema ni Peppol tarifu.

**Zaključak §1:** marginalni (varijabilni) trošak dostave dodatnog eRačuna preko **vlastite** PT je **~0 €**.
Korisnik je u tome u pravu. Sve što košta je **fiksno** (§2).

---

## 2. Fiksni / setup / OPEX troškovi vlastite PT / IP

Ovdje leži cijela istina. Dijelimo na (A) "**PT za sebe**" (samo vlastiti OIB, bez ISO/NIS2 — vidi `12-*` §9 faza 2)
i (B) "**puni informacijski posrednik**" (usluga drugima — sav compliance teret).

### 2.1. Tablica fiksnih troškova

| Stavka | Jednokratno (CAPEX) | Godišnje (OPEX) | Nužno za "PT za sebe"? | Nužno za puni IP? | Izvor / napomena |
|---|---|---|---|---|---|
| **Kvalificirani aplikacijski certifikat** (FINA) | ~**49,78 €** (izdavanje 39,82 + registracija 10,62) za 5 god. | **~8–10 €/god** (amortizirano) | **DA** | DA | [FINA cjenik certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/cijene-digitalnih-certifikata-za-fiskalizaciju) — bez PDV-a; AKD alternativa slična ⚠️ |
| **VPS/hosting Domibus + DomiSMP 24/7** (JVM + baza, javni :443, TLS, backup) | ~0–100 € (setup) | **~200–800 €/god** ⚠️ procjena (1 modest VPS ~15–40 €/mj; redundancija skuplje) | **DA** | DA | Tržišna procjena; Domibus traži Tomcat/WildFly + MySQL/Oracle (`12-*` §4) |
| **Monitoring / uptime / SLA** (alerting, logovi) | — | ~0–300 €/god ⚠️ (self-host jeftino, managed skuplje) | DA (de facto) | **DA** (SLA obveza) | operativa 24/7 |
| **Razvojni napor** (AS4/XAdES/mTLS/SBDH, MPS, AMS discovery, CIS fiskal klijent, UBL/CIUS) | **mjeseci rada** — daleko najveći stvarni trošak ⚠️ | održavanje uz promjene PU spec-a (verzije 1.x kroz 2025.) | **DA** | DA | `12-*` §2.6, §8 — "visoko" i za PT za sebe |
| **ISO/IEC 27001** (implementacija + certifikacija) | **~10.000–25.000 €** ⚠️ (konzalting 5–20k + audit) | **~2.000–5.000 €/god** nadzorni auditi + reobnova | **NE** | **DA** (čl. 61) | [zadar-ict.hr vodič 2025](https://zadar-ict.hr/edukacija/iso-sustavi/koliko-kosta-implementacija-iso-27001/); obnova: PU u 60 dana od isteka (`12-*` §1.6) |
| **NIS2 / kibernetička sigurnost** (status "ključnog subjekta") | procjena rizika, politike, mjere ⚠️ (tisuće €) | trajni program: incident reporting, nadzor, revizije | **NE** | **DA** | Zakon o kibernetičkoj sigurnosti; `12-*` §1.4 — "najveća pojedinačna prepreka" |
| **GDPR čl. 32 dokument + EU-data izjava** | pravni rad ⚠️ | ažuriranje | NE | DA | čl. 61 NN 89/2025 |
| **PTS testiranje / certifikacija** | vrijeme (bez PU naknade) | reobnova pri promjenama | DA (za svoje scenarije) | DA (svi scenariji) | `12-*` §3 — PU ne naplaćuje PTS |

### 2.2. Interpretacija
- **"PT za sebe"** fiksni realni novčani izdatak je **iznenađujuće nizak** u eurima: cert (~10 €/god) + VPS
  (~200–800 €/god). Glavni trošak je **skriveni**: mjeseci inženjerskog rada na AS4/XAdES/mTLS/CIS + trajno
  održavanje. **Nema ISO/NIS2** (to je ključna ušteda faze 2 iz `12-*`).
- **Puni IP** dodaje **ISO 27001 (~10–25k € + ~2–5k €/god)** i **NIS2 program** — to su troškovi koji vlastitu PT
  čine ekonomski neopravdanom osim ako je razmjena **core proizvod** koji se preprodaje mnogima.

---

## 3. Usporedba: biti posrednik vs koristiti posrednika

### 3.1. Javni cjenici postojećih posrednika (2026-07-04, iznosi bez PDV-a osim gdje navedeno)

| Posrednik | Mjesečno / paket | Uključeno | Po dodatnom eR | Zaprimanje | Napomena |
|---|---|---|---|---|---|
| **ePoslovanje (Pondi)** postpaid | **4,00 €/mj** | 50 rač/mj | **0,08 €** | **besplatno** | fiskal+eizvještavanje uklj.; nema ugovorne obveze — [cjenik](https://eposlovanje.hr/cjenik/) |
| **ePoslovanje** prepaid | min. depozit 4,00 € / 6 mj | — | **0,08 €** | besplatno | plati-po-potrošnji |
| **doku (monoform)** | **~5 €/mj** (s PDV-om) | 50 rač/mj | **0,10 €** | uklj. | besplatno 3 rač/mj; >2000 custom ([`13-*` §2](./13-provideri-krajolik.md)) |
| **FINA e-Račun** | **0,93 €/mj** po certifikatu | 0 (plati sve) | **0,30 €** | **besplatno** | + cert 39,82 €/5g; opunomoćenik 0,93 €/subj — [cjenik](https://www.fina.hr/digitalizacija-poslovanja/e-racun/cjenik-fina-e-racuna) |
| **Sveračun** ugovor | **17,50 €/mj** do 50 | 50 rač/mj | 0,33→0,25 € (skala) | uklj. | prepaid godišnji: MINI 120 rač/54 € — [cjenik](https://www.sveracun.hr/cjenik) |
| **Moj-eRačun (mer)** | paketi (BASIC MICRO 10/20/50…) ⚠️ | ovisno o paketu | ovisno | uklj. | brza aktivacija 1.199 kn; [cjenik](https://portal.moj-eracun.hr/podrska/cjenik/) |

**Najjeftiniji varijabilni trošak na tržištu: ePoslovanje 0,08 €/eR** (postpaid 4 €/mj za 50). doku 0,10 €.
FINA je skuplja po komadu (0,30 €) ali s niskim paušalom.

### 3.2. Godišnji trošak "korištenja posrednika" po volumenu (primjer: ePoslovanje postpaid)

| Računa/mj | Formula (4 € + višak×0,08) | €/mj | **€/god** |
|---|---|---|---|
| 3 | 4,00 (unutar 50) | 4,00 | **48 €** |
| 50 | 4,00 | 4,00 | **48 €** |
| 100 | 4 + 50×0,08 | 8,00 | **96 €** |
| 300 | 4 + 250×0,08 | 24,00 | **288 €** |
| 500 | 4 + 450×0,08 | 40,00 | **480 €** |
| 1.000 | 4 + 950×0,08 | 80,00 | **960 €** |

### 3.3. Točka pariteta (break-even) vs "PT za sebe"
Uspoređujemo **OPEX vlastite PT** (cert ~10 €/god + VPS ~200–800 €/god ⚠️ = grubo **~300–600 €/god**, **bez**
vrednovanja inženjerskog rada) protiv gornje tablice:

- Pri **~300–600 rač/mj** godišnji trošak ePoslovanja (288–~550 €) tek **sustiže** goli OPEX vlastite PT.
- **Ispod toga (tipičan mali/srednji obveznik, do par stotina rač/mj): posrednik je jeftiniji ili jednak** — i
  bez ikakvog razvojnog/održavanja troška.
- Čim u račun uključite **mjesece razvoja + održavanje + rizik promjena spec-a**, break-even se pomiče na **vrlo
  visok volumen** ili se **nikad** ne isplati za jednog obveznika.

**Ključni uvid:** vlastita PT za **jedan OIB** gotovo nikad se ne isplati čisto troškovno — jer je varijabilni
trošak kod posrednika ionako minijaturan (0,08 €), a fiksni trošak vlastite PT (osobito rad) je velik. Isplati se
tek kad **jedan fiksni trošak dijelite na MNOGO tenanata** (postajete posrednik i preprodajete) — ali tada
upadate u ISO 27001 + NIS2 (§2), što opet diže fiksni prag.

---

## 4. Zaključak i preporuka

**Je li pretpostavka "ako sam sam posrednik, dostava eRačuna ne košta ništa" točna?**

- **Na marginalnoj razini: DA.** Država (PU) ne naplaćuje ni po eRačunu ni po poruci; AMS/MPS/fiskalizacija/
  eIzvještavanje su besplatni; domaći AS4 je direktan bez mrežne tarife. **Dostava dodatnog računa ≈ 0 €.**
- **Na ukupnoj razini: NE.** Trošak nije nula — on je gotovo **potpuno fiksan** (certifikat, 24/7 hosting, i
  prije svega **mjeseci razvoja**; za puni IP još **ISO 27001 ~10–25k € + NIS2**). Podijeljeno na mali volumen,
  efektivni trošak po računu je **veći** nego kod posrednika.

**Preporuka po volumenu (uz `12-*` §9 fazni pristup):**

| Profil | Preporuka |
|---|---|
| **Do ~par stotina rač/mj, jedan obveznik** | **Koristi posrednika** (ePoslovanje 0,08 € / doku 0,10 € / FINA). Jeftinije, nula compliance, brzo. |
| **Visok vlastiti volumen ILI strateška neovisnost** | **"PT za sebe"** (Domibus+DomiSMP, Završno testiranje za vlastite potrebe, bez ISO/NIS2). Marginalno 0 €, ali platiš razvoj jednom. |
| **Preprodaja usluge drugima (SaaS/ERP, multi-tenant)** | **Puni IP** — tek kad volumen tenanata amortizira **ISO 27001 + NIS2**; inače graditi NAD tuđim posrednikom (model FIRA/`13-*`). |

**Poštena rečenica za korisnika:** "Da, dostava jednog eRačuna preko vlastite PT košta praktički ništa — jer je
država besplatna i mreža je direktna. Ali *imati* vlastitu PT košta fiksno (cert + 24/7 server + mjeseci koda; a
za pružanje drugima još ISO 27001 i NIS2). Za tvoj volumen posrednik s 0,08–0,10 € po računu je gotovo sigurno
jeftiniji nego da taj fiksni trošak nosiš sam."

---

## Izvori

- [Porezna uprava — Popis informacijskih posrednika (8019)](https://porezna-uprava.gov.hr/hr/popis-informacijskih-posrednika/8019) — **34 posrednika na 2026-07-04**; stranica je samo popis, **bez** poveznice na postupak/zahtjev i **bez** ikakvih naknada (pristup 2026-07-04)
- [Porezna uprava — Vodič kroz Fiskalizaciju 2.0 (8149)](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149) — besplatna FiskAplikacija i MIKROeRAČUN, uloga AMS/MPS (pristup 2026-07-04)
- [Porezna uprava — Izdavanje i primanje eRačuna i fiskalizacija (8047)](https://porezna-uprava.gov.hr/hr/izdavanje-i-primanje-eracuna-i-fiskalizacija-eracuna/8047) — model razmjene (pristup 2026-07-04)
- [FINA — Cjenik Fina e-Računa](https://www.fina.hr/digitalizacija-poslovanja/e-racun/cjenik-fina-e-racuna) — paušal 0,93 €/mj/cert, slanje 0,30 €/eR, **zaprimanje besplatno**, ovlaštenja 0,33–1,59 € (pristup 2026-07-04)
- [FINA — Cijene digitalnih certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/cijene-digitalnih-certifikata-za-fiskalizaciju) — aplikacijski cert 39,82 € (5 god.), registracija 10,62 €, ukupno 49,78 € (pristup 2026-07-04)
- [ePoslovanje (Pondi) — Cjenik](https://eposlovanje.hr/cjenik/) — postpaid 4 €/mj (50 rač) + 0,08 €/eR, prepaid 0,08 €/eR, **zaprimanje i arhiva besplatni**, bez ugovorne obveze (pristup 2026-07-04)
- [Sveračun — Cjenik](https://www.sveracun.hr/cjenik) — prepaid MINI 120 rač/54 €; ugovor do 50 rač 17,50 €/mj, skala 0,33→0,25 €; pohrana 1 €/GB/mj (pristup 2026-07-04)
- [Moj-eRačun — Cjenik](https://portal.moj-eracun.hr/podrska/cjenik/) — paketi BASIC MICRO; aktivacija ⚠️ (pristup 2026-07-04)
- [zadar-ict.hr — Koliko košta implementacija ISO 27001 (2025)](https://zadar-ict.hr/edukacija/iso-sustavi/koliko-kosta-implementacija-iso-27001/) — ~10.000–25.000 € implementacija + godišnji nadzorni auditi ⚠️ (pristup 2026-07-04)
- [advisera 27001academy — Koliko košta ISO 27001](https://advisera.com/27001academy/hr/blog/2011/02/08/koliko-kosta-implementacija-iso-27001/) — faktori cijene, konzalting (pristup 2026-07-04)
- doku.hr cjenik (~5 €/50 rač + 0,10 €) — preneseno iz `13-provideri-krajolik.md` (pristup 2026-07-04)

> Interne reference: `12-vlastita-pristupna-tocka.md` (§2 tehnika, §8 truda/rizik, §9 fazni pristup),
> `13-provideri-krajolik.md` (§2 doku cjenik, §4 usporedba modela, §5 krajolik).

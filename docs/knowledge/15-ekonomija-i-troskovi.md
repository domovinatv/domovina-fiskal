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

---

## Razrješenje otvorenih ⚠️ (krug 2 — 2026-07-04)

- ✅ **VPS/24-7 hosting za produkcijski Domibus+DomiSMP (JVM+baza, s redundancijom) — tržišni rasponi 2026.** Potvrđeno na razini goliih cloud/VPS ponuda. Hetzner Cloud (srpanj 2026.): shared-vCPU **CX23 od ~5,49 €/mj**, **CPX22 (2 vCPU / 4 GB, AMD) 7,99 €/mj** (poskupljenje s 5,99 € od 1.4.2026.); **load balancer ~6,41 €/mj**; automatski backup **+20 % cijene servera**. Bitno: Hetzner **nema managed bazu ni formalni uptime SLA**, pa redundantni Domibus (2 app instance + replicirana MySQL/PostgreSQL + LB + backup) tražiš self-managed. Realan sklop za HA: grubo **~25–60 €/mj ≈ 300–720 €/god** (za jedan modest single-node bez redundancije **~8–20 €/mj ≈ 100–240 €/god**). → Potvrđuje procjenu iz §2.1 (**~200–800 €/god**). Managed baza (npr. DigitalOcean managed Postgres/Redis) diže cijenu ali skida operativni teret. Izvori: [Hetzner Cloud cjenik](https://www.hetzner.com/cloud/pricing/), [Hetzner cloud review 2026 (BetterStack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/), [Cloud VPS cost comparison 2026](https://apicalculators.com/blog/cloud-vps-cost-comparison-2026).
- ✅ **AKD / Certilia cijena kvalificiranog aplikacijskog (fiskalizacijskog) certifikata.** **20 € + PDV, jednokratno, trajanje 5 godina, format .p12** (certifikat + privatni ključ pod lozinkom, ostaje pod tvojom kontrolom); izdaje se online na temelju OIB-a bez fizičkog dolaska. → **Znatno jeftinije od FINA ~49,78 €/5 god** (FINA 39,82 € izdavanje + 10,62 € registracija). Certilia je usluga AKD-a; PU je potvrdila da Certilia izdaje fiskalizacijske certifikate. Izvori: [Certilia — poslovni korisnici (fiskalizacijski certifikat)](https://www.certilia.com/poslovni-korisnici), [PU — Certilia omogućila izdavanje fiskalizacijskih certifikata (8466)](https://porezna-uprava.gov.hr/hr/certilia-omogucila-izdavanje-fiskalizacijskih-certifikata/8466), [FiskAI — Certilia fiskalizacijski certifikat](https://www.fiskai.hr/certilia-fiskalizacijski-certifikat/).
- ⚠️ **Konkretni iznosi NIS2 / kibernetičkog usklađenja za mali tim u HR — nema javne HR cifre.** Hrvatski konzultantski vodiči (Vision Compliance, Ctrl Alt Grow, Alfatec, PwC HR) opisuju obveze i kazne, ali **ne objavljuju cjenike** usklađivanja (dostupno tek na upit/ponudu). **Najbolja javna referenca su EU/DE brojke:** njemačka vlada u obrazloženju NIS2 zakona navodi **~70.000 € jednokratno + ~30.000 €/god** po obveznom subjektu; praktični raspon **15.000 – >250.000 €** ovisno o veličini i pristupu; ENISA: odstupanje stvarnog troška 40–100 % iznad prve ponude, godišnji „tick-over" +12–15 %. **Ključno za mali tim:** NIS2 (hrv. Zakon o kibernetičkoj sigurnosti, NN 14/24) veže **samo srednje+ subjekte** (≥50 zaposlenih ili ≥10 mln € prihoda za „važne", ≥250 / ≥50 mln € za „ključne") — **mali tim tipično NIJE obveznik po pragu veličine**, osim ako uđe **preko lanca opskrbe** (ugovorni zahtjev ključnog subjekta) neovisno o veličini. → Za solo/mali PT-za-sebe scenarij NIS2 realno **ne aktivira** te troškove; postaje relevantno tek za punog IP-a koji opslužuje regulirane subjekte. Izvori: [Ctrl Alt Grow — NIS2 vodič HR](https://ctrlaltgrow.hr/blog/nis2-vodic-hrvatska/), [Kiteworks — NIS2 compliance costs](https://www.kiteworks.com/regulatory-compliance/nis2-compliance-costs/), [Kopexa — NIS2 Kosten 2026](https://kopexa.com/en/catalog/nis-2/kosten), [Cybersecurity ASEE — NIS2 for SMEs](https://cybersecurity.asee.io/blog/nis2-for-smes/).
- ✅ **Moj-eRačun (mer) paketi BASIC MICRO — detaljni iznosi iz javnog cjenika.** Svi iznosi bez PDV-a: **BASIC MICRO 10 = 8,00 €/mj (10 eR)**, **20 = 12,00 €/mj (20)**, **50 = 24,00 €/mj (50)**, **75 = 36,00 €/mj (75)**, **100 = 47,00 €/mj (100)**; **dodatni eRačun 0,25 €**; **jednokratna aktivacija 29,00 €** (za sve pakete). Postoje i viši paketi (BASIC MICRO 150 … BASIC 600); >600 rač/mj → prilagođeni paket. → Po eRačunu unutar paketa: MICRO 10 ~0,80 €/eR, MICRO 50 ~0,48 €/eR, MICRO 100 ~0,47 €/eR — **osjetno skuplje od ePoslovanje 0,08 € / doku 0,10 €** za usporedive male volumene. Izvor: [Moj-eRačun — Cjenik](https://portal.moj-eracun.hr/podrska/cjenik/).

---

## 8. Cloudflare Workers Paid plan — aktivan na accountu D.O.M. (od 2026-07-17)

Nadogradnja s Free na **Workers Paid (5 USD/mj + usage)** napravljena 2026-07-17;
okidač je bio **D1 limit od 10 baza** na Free planu (trebala nam je zasebna
`fiskal_domovina_test` za odvojeno test okruženje). Trajno uključeno u planu
(izvor: Cloudflare checkout, pristup 2026-07-17):

| Proizvod | Uključeno mjesečno | Overage |
|---|---|---|
| Workers/Pages Functions zahtjevi | 10 mln | 0,30 USD/mln |
| CPU vrijeme | 30 s/zahtjev, 30 mln ms/mj | 0,02 USD/mln CPU ms |
| Workers Builds | 6 slotova, 6.000 min/mj | 0,005 USD/min |
| Durable Objects | 1 mln zahtjeva, 400K GB-s, 1 GB | 0,15 USD/mln zahtjeva |
| KV | 10 mln čitanja, 1 mln pisanja/brisanja | 0,50 USD/mln operacija |
| **D1** | **25 mlrd čitanja redaka, 50 mln pisanja, 5 GB** (limit baza raste s 10 na tisuće) | 0,001 USD/mln redaka |
| Queues | 1 mln operacija | 0,40 USD/mln |
| Workers AI | 10K neurona/dan | po modelu |
| Vectorize | 50 mln queried / 10 mln stored dimenzija | 0,01 USD/mln upita |
| Workers Logs | 20 mln eventova, retencija 7 dana | 0,05 USD/mln |
| Hyperdrive, Workers Assets, Images+Stream | uključeno | transformacije 0,50 USD/tis. |

Posljedice za fiskal projekt: CPU limit po zahtjevu raste s 10 ms na 30 s
(bitno za XML-DSIG/subtls prema CIS-u), 100→500 workera, 5→250 cron triggera,
D1 bez straha od limita baza. Za projekcije troška po tenantu vidi §4.

# 09 — PDF račun i QR kod

> Stanje na dan **2026-07-04**. Dokument pokriva: obvezne elemente računa (Zakon o
> PDV-u čl. 79), dodatne elemente **fiskaliziranog** računa (JIR, ZKI, operater,
> poslovni prostor, naplatni uređaj), **QR kod** (sadržaj + tehnička specifikacija),
> vizualizaciju **eRačuna 2.0** te praktično generiranje PDF-a i slanje e-mailom na
> **Cloudflare Workers**.
>
> ⚠️ Napomena o kontekstu 2026: paralelno postoje **dva režima**:
> 1. **Fiskalizacija 1.0 / „u krajnjoj potrošnji" (B2C, gotovina)** — račun s
>    JIR/ZKI/QR kodom, papirnati/PDF ispis. I dalje na snazi.
> 2. **Fiskalizacija 2.0 / eRačun (B2B, bezgotovinski)** — strukturirani UBL 2.1 XML
>    (EN 16931), obvezan od **1. 1. 2026.** za PDV obveznike (vidi rokove niže).
>
> Za „PDF račun" bitno je razlikovati: u 1.0 je čitljivi ispis (papir/PDF) **primarni
> pravni dokument**; u 2.0 je **XML** pravni dokument, a PDF je samo **vizualizacija /
> prilog**.

---

## 1. Obvezni elementi računa — Zakon o PDV-u, čl. 79. st. 1.

Sadržaj računa propisuje **čl. 79. Zakona o porezu na dodanu vrijednost**. Račun mora
sadržavati sljedeće (parafraza zakonskog teksta):

| # | Element | Napomena |
|---|---------|----------|
| 1 | **Broj računa i datum izdavanja** | Jedinstveni redni broj u nizu |
| 2 | **Ime i prezime (naziv), adresa, OIB ili PDV ID broj isporučitelja** (prodavatelja) | Za tuzemne — OIB; za EU transakcije — PDV ID (`HR` + OIB) |
| 3 | **Ime i prezime (naziv), adresa, OIB ili PDV broj primatelja** (kupca) | Kod B2C maloprodaje često se ne navodi kupac (vidi pojednostavljeni račun) |
| 4 | **Količina i uobičajeni trgovački naziv** isporučenih dobara / vrsta i opseg usluga | |
| 5 | **Datum isporuke** dobara/usluga ili datum primitka predujma | Ako je odrediv i razlikuje se od datuma izdavanja |
| 6 | **Jedinična cijena bez PDV-a**, odnosno iznos naknade **razvrstan po stopi PDV-a** | |
| 7 | **Popusti / rabati**, ako nisu uključeni u jediničnu cijenu | |
| 8 | **Stopa PDV-a** za predmetnu transakciju | HR stope: 25 %, 13 %, 5 %, 0 % |
| 9 | **Iznos PDV-a razvrstan po stopama** | Osim kod posebnih postupaka |
| 10 | **Ukupni iznos naknade i PDV-a** | Sveukupno za platiti |

Izvor teksta čl. 79.: [pdvaktualno.hr — Članak 79.](https://www.pdvaktualno.hr/33/clanak-79-obvezni-sadrzaj-racuna-uniqueidmRRWSbk196E4DjKFq6pChG6vuuclhFodfepYl11cGkqiKebrrbyYXg/)
i [zakon.hr — Zakon o PDV-u](https://www.zakon.hr/z/186/Zakon-o-porezu-na-dodanu-vrijednost).

### 1.1. Obvezne napomene (klauzule) na računu

Ako se primjenjuje **oslobođenje ili poseban postupak**, na računu se mora navesti
odgovarajuća napomena (čl. 79. st. 1. t. 11.–15.):

| Slučaj | Napomena na računu |
|--------|--------------------|
| Oslobođenje od PDV-a | Uputa na odredbu Zakona/Direktive (npr. „oslobođeno prema čl. 39. Zakona o PDV-u") |
| **Prijenos porezne obveze** | **„prijenos porezne obveze"** ili **„reverse charge"** |
| Putničke agencije (posebni postupak) | „posebni postupak oporezivanja – putničke agencije" |
| Rabljena dobra / umjetnine (marža) | „posebni postupak oporezivanja – rabljena dobra" i sl. |
| Samoizdavanje računa | **„samoizdavanje računa"** |
| **Mali porezni obveznik** (nije u sustavu PDV-a) | Napomena da PDV nije obračunat (npr. „PDV nije obračunat temeljem čl. 90. st. 2. Zakona o PDV-u") — vidi [TEB, 2025.](https://www.teb.hr/novosti/2025/klauzula-o-oslobodenju-od-placanja-pdv-a-na-racunima-malih-poreznih-obveznika-od-112025/) |

> ⚠️ Ako izdavatelj na računu iskaže **veći PDV** nego što je zakonski dužan, duguje taj
> veći iznos dok se račun ne ispravi (čl. 79. u vezi s postupkom ispravka).

### 1.2. Pojednostavljeni račun (čl. 79. st. 5.–7.)

Za male iznose (do zakonskog praga, tipično za B2C maloprodaju) dopušten je
**pojednostavljeni račun** s užim skupom podataka (bez podataka o kupcu, s ukupnim
iznosom i iznosom PDV-a). U praksi je to najčešći „fiskalni račun iz blagajne".

> Za točan prag i uvjete provjeriti Pravilnik o PDV-u i aktualni Zakon — **ne citiram
> konkretan iznos praga jer se mijenjao** (uvođenjem eura i kroz izmjene). Označeno kao
> nesigurno.

---

## 2. Dodatni obvezni elementi FISKALIZIRANOG računa (1.0 / B2C)

Uz elemente iz čl. 79., **fiskalizirani račun u gotovinskom prometu** (Zakon o
fiskalizaciji, Pravilnik o fiskalizaciji) mora sadržavati:

| Element | Oznaka / opis |
|---------|---------------|
| **JIR** — Jedinstveni identifikator računa | UUID (36 znakova) koji vraća CIS Porezne uprave nakon uspješne fiskalizacije. **Nema ga ako je račun izdan u „offline" načinu** — tada se ispisuje samo ZKI i naknadno dostavlja. |
| **ZKI** — Zaštitni kôd izdavatelja | 32-znamenkasti hex (MD5 od RSA-SHA1 potpisa konkateniranih polja). Uvijek se generira lokalno prije slanja. Vidi `docs/knowledge/02-*`. |
| **Oznaka operatera** | OIB/oznaka osobe (djelatnika) koja je izdala račun na naplatnom uređaju |
| **Oznaka poslovnog prostora** | Šifra poslovnog prostora prijavljena u ePorezna |
| **Oznaka naplatnog uređaja** | Redni broj blagajne/uređaja unutar poslovnog prostora |
| **Broj računa** (fiskalni) | Struktura **`BrRačuna/OznakaPoslovnogProstora/OznakaNaplatnogUređaja`** (npr. `1523/POSL1/2`) |
| **Način plaćanja** | Gotovina (`G`), kartica (`K`), ček (`C`), transakcijski račun (`T`), ostalo (`O`) |
| **Vrijeme izdavanja** | Datum i vrijeme s minutama |
| **QR kod** | Vidi poglavlje 3. — obvezan od 1. 1. 2021. |

Izvor: [Porezna uprava — Račun](https://porezna-uprava.gov.hr/hr/racun/4595),
[Fiskalizacija — Tehnička specifikacija za korisnike (v2.x)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf).

---

## 3. QR kod na fiskalnom računu

### 3.1. Je li obvezan?

**DA — od 1. 1. 2021.** QR kod je obvezni sastavni dio računa **u krajnjoj potrošnji
(B2C)**, i to za račune naplaćene sredstvima koja se smatraju **prometom gotovine**
(gotovina, kartica, ček...). Za čisto bezgotovinske (transakcijski račun / virman) QR
nije obvezan.

Izvori: [HOK — Uvodi se QR kod kao sastavni dio računa](https://www.hok.hr/novosti-iz-hok/podsjetnik-fiskalizacija-uvodi-se-qr-kod-kao-sastavni-dio-racuna),
[LIBUSOFT CICOM (SPI) — Obveza ispisa QR koda](https://www.spi.hr/obveza-ispisa-qr-koda-na-fiskaliziranim-racunima/).

### 3.2. Sadržaj QR koda

QR kod **kodira URL** web-servisa Porezne uprave za provjeru računa, s parametrima:

| Parametar | Sadržaj | Duljina |
|-----------|---------|---------|
| `jir` **ili** `zki` | JIR (UUID) **ili** ZKI izdavatelja | JIR = 36 znakova, ZKI = 32 znaka |
| `datv` | Datum i vrijeme izdavanja u formatu **`GGGGMMDD_HHMM`** | 13 znakova |
| `izn` | **Ukupni iznos računa** | do 10 znakova |

> ⚠️ **Format iznosa se promijenio kroz verzije tehničke specifikacije.** U ranijim
> verzijama iznos je bio s decimalama (npr. `1000000,00`), a u novijim se navodi kao
> **cijeli broj u lipama/centima** (npr. `10000` = 100,00 EUR). **Provjeri aktualnu
> verziju tehničke specifikacije prije implementacije** — ovo je česta greška. Označeno
> kao nesigurno/promjenjivo.

**URL baze za provjeru:** `https://porezna.gov.hr/rn` (ranije se koristio i drugi host;
danas je kanonski `porezna.gov.hr/rn`).

**Primjer punog sadržaja QR koda (URL):**

```
https://porezna.gov.hr/rn?jir=12345678-1234-1234-1234-123456789012&datv=20260704_1230&izn=10000
```

(Alternativno, ako JIR nije dostupan — offline izdavanje — koristi se `zki`:)

```
https://porezna.gov.hr/rn?zki=abcdef01234567890abcdef012345678&datv=20260704_1230&izn=10000
```

Izvori: [Porezna — Provjeri fiskalni račun](https://porezna.gov.hr/fiskalizacija/gotovinski-racuni/provjeri-fiskalni-racun),
[Porezna — QR kod](https://porezna-uprava.gov.hr/hr/qr-kod/4619),
[Mišljenje: Dopuna podataka na QR kodu](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2513).

### 3.3. Tehnička specifikacija QR koda

| Zahtjev | Vrijednost |
|---------|-----------|
| **Minimalna veličina** | **2 × 2 cm** |
| **Prazan rub (quiet zone)** | minimalno **2 mm** sa svih strana |
| **Razina korekcije greške (ECC)** | minimalno **„L"** |
| **Standard kvalitete** | usklađen s **ISO/IEC 15415** |
| **QR verzija (model)** | najmanja moguća (tipično Version 1 ili 2) |
| **Zabrane** | QR se **ne smije** ispisivati preko slika, logotipa niti sadržavati ugrađenu grafiku (mora biti čist, čitljiv) |

Izvor: [HOK](https://www.hok.hr/novosti-iz-hok/podsjetnik-fiskalizacija-uvodi-se-qr-kod-kao-sastavni-dio-racuna),
[Porezna — QR kod](https://porezna-uprava.gov.hr/hr/qr-kod/4619).

### 3.4. Provjera računa (građanin)

- **mPorezna** mobilna aplikacija — skeniranje QR koda.
- **Web** — ručni unos JIR / ZKI + iznos + datum na `https://porezna.gov.hr/rn/`.
- **Prigovor / fizički dolazak** — za račune ne starije od 30 dana.
- Nagradna igra **„Svaki račun se računa!"** (pokrenuta 1. 7. 2026.) potiče građane na
  skeniranje/provjeru računa — vidi [porezna-uprava.gov.hr](https://porezna-uprava.gov.hr/).

> ⚠️ **SMS provjera:** stariji izvori spominju provjeru SMS-om, ali novija službena
> stranica navodi samo mPorezna + web. **Ne oslanjati se na SMS kao aktualni kanal** bez
> dodatne potvrde. Označeno kao proturječno.

---

## 4. eRačun 2.0 — vizualizacija i PDF

### 4.1. Što je pravni dokument?

U **Fiskalizaciji 2.0** pravno valjan eRačun je **strukturirani XML (UBL 2.1, usklađen s
EN 16931 / HR CIUS)**. **PDF nije pravni dokument** — on je samo **čitljiva
vizualizacija** za ljudsko oko.

Izvor: [Porezna — eRačun](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun),
[EY — eRačun i Fiskalizacija 2.0](https://www.ey.com/content/dam/ey-unified-site/ey-com/hr-hr/insights/tax/documents/ey-eracun-i-fiskalizacija-2-0.pdf).

### 4.2. Obveza čitljive vizualizacije

Iako je XML nositelj podataka, sustavi za razmjenu (npr. **MIKROeRAČUN**) osiguravaju
**potpun, jasan i standardiziran prikaz** svih strukturiranih podataka eRačuna primatelju,
**neovisno o tome je li priložen PDF**. Praktično: primatelj mora moći **pročitati** račun
bez XML alata. Preporuka za naš servis: uvijek generirati i vizualizaciju (HTML/PDF), čak
i kad je pravni nositelj XML.

### 4.3. PDF kao prilog u UBL-u

PDF vizualizacija (i drugi prilozi — otpremnica, ugovor, 2D barkod za plaćanje) ugrađuje
se u UBL kroz element **`cac:AdditionalDocumentReference`** →
**`cac:Attachment`** → **`cbc:EmbeddedDocumentBinaryObject`** (base64):

```xml
<cac:AdditionalDocumentReference>
  <cbc:ID>racun-vizualizacija.pdf</cbc:ID>
  <cac:Attachment>
    <cbc:EmbeddedDocumentBinaryObject
        mimeCode="application/pdf"
        filename="racun-vizualizacija.pdf">
      JVBERi0xLjcKJ... (base64 sadržaj PDF-a) ...
    </cbc:EmbeddedDocumentBinaryObject>
  </cac:Attachment>
</cac:AdditionalDocumentReference>
```

> ⚠️ **Prilog je opcionalan, ne obvezan** — obvezan je samo ispravan XML. Neki
> posrednici (npr. mvv.hr/HrFiskalizator) nude automatsko generiranje PDF vizualizacije
> preko parametra (`?pdfname=invoice.pdf`) i umetanje u XML. Provjeri konkretnog
> posrednika. Vidi [mvv.hr — HrFiskalizator dokumentacija](http://mvv.hr/hrfiskalizator/web/pluginssetup/eposlovanje/dokumentacija.php).

Detaljna tehnička specifikacija: [Tehnička specifikacija — Fiskalizacija eRačuna i
eIzvještavanje (PDF)](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf).

### 4.4. Rokovi (stanje 2026-07-04)

| Datum | Obveza |
|-------|--------|
| **1. 1. 2026.** | **PDV obveznici** — obveza **izdavanja i zaprimanja** eRačuna (B2B, tuzemstvo). **Ne-PDV obveznici** — obveza **zaprimanja**. |
| **1. 1. 2027.** | Ne-PDV obveznici (koji su 2026. samo zaprimali) počinju i **izdavati** eRačune. |

> Napomena: obveza se odnosi na **tuzemne B2B** transakcije. Računi prema
> inozemstvu / iz inozemstva **nisu** obuhvaćeni. B2C ostaje u režimu fiskalizacije 1.0
> (JIR/ZKI/QR).

Izvori: [Porezna — Vodič kroz Fiskalizaciju 2.0](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149),
[Expertise.hr](https://expertise.hr/fiskalizacija-2-0-kljucne-promjene-rokovi-i-obveze-za-eracune-od-2026/).

---

## 5. Praktično: generiranje PDF-a na Cloudflare Workers

Cilj: iz podataka računa (D1/KV) proizvesti **čitljivu vizualizaciju** (PDF ili HTML) —
za B2C ispis i/ili kao prilog eRačunu. Naš runtime je **Cloudflare Worker (workerd)** koji
**ne može pokrenuti native binarije niti spawn-ati procese** → klasične Node PDF knjižnice
s headless Chromiumom lokalno ne rade.

### 5.1. Opcije

| Pristup | Kako | Prednosti | Mane |
|---------|------|-----------|------|
| **`pdf-lib`** (čisti JS/WASM) | Programatsko crtanje PDF-a u Workeru | Nema vanjske ovisnosti, radi u workerd, jeftino, brzo | Ručno pozicioniranje, nema HTML/CSS layouta, mučno za složene tablice |
| **`@react-pdf/renderer`** / `pdfkit` | JS generiranje | Deklarativniji od pdf-lib | Bundle veći, dio API-ja oslonjen na Node |
| **Cloudflare Browser Rendering** (`@cloudflare/puppeteer` + binding) | `page.setContent(html)` → `page.pdf()` | **Puni HTML/CSS** → najlakši pixel-perfect layout, isti HTML za web i PDF | Zahtijeva Browser Rendering binding (plaćeno/limiti), sporije, hladni start |
| **Browser Rendering REST `/pdf`** (Quick Action) | POST HTML/URL → PDF | Bez upravljanja puppeteerom | Manje kontrole nad renderiranjem |
| **Vanjski servis: Gotenberg / PDF API** | HTTP poziv na self-hosted/SaaS | Odvaja teški render iz Workera | Vanjska ovisnost, mrežni trošak, privatnost podataka |

Izvori: [Cloudflare — Generate PDFs Using HTML and CSS](https://developers.cloudflare.com/browser-run/how-to/pdf-generation/),
[Cloudflare — `/pdf` endpoint](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/),
[PDF4.dev — PDF generation on Cloudflare Workers: every option in 2026](https://pdf4.dev/blog/pdf-generation-cloudflare-workers).

### 5.2. Preporuka za naš servis

- **Vizualizacija (HTML→PDF)**: koristiti **Browser Rendering** (`@cloudflare/puppeteer`)
  jer HTML/CSS predložak istovremeno služi za web-prikaz i PDF. Isti Handlebars/JSX
  predložak → jedan izvor istine za layout.
- **QR kod**: generirati kao **SVG/PNG data-URI** unutar HTML-a. QR se može izračunati
  čistim JS-om (npr. `qrcode`/`qr-code-styling` u WASM/JS varijanti) koji radi u workerd —
  bez native ovisnosti. Ugraditi kao `<img src="data:image/png;base64,...">`.
- **Fallback**: za jednostavan B2C isječak (fiskalni račun blagajne) `pdf-lib` je dovoljan
  i najjeftiniji; QR sliku ubaci kao embedded PNG.

Skica (Browser Rendering):

```ts
import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(req: Request, env: Env) {
    const browser = await puppeteer.launch(env.BROWSER); // Browser Rendering binding
    const page = await browser.newPage();
    await page.setContent(renderInvoiceHTML(data)); // naš HTML predložak + QR data-URI
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return new Response(pdf, { headers: { "content-type": "application/pdf" } });
  },
};
```

`wrangler.toml`:

```toml
browser = { binding = "BROWSER" }
```

---

## 6. Slanje računa e-mailom

### 6.1. Obveza

- **B2C fiskalni račun (1.0):** e-mail dostava **nije zakonski obvezna** — dovoljan je
  ispis (papir) ili elektronički prikaz kupcu. FIRA-in konektor (vidi
  `docs/reference/fira-custom-webshop-api.md`) šalje PDF e-mailom **opcionalno**, čitajući
  `email` iz `billingAddress` ako je postavka uključena.
- **eRačun (2.0, B2B):** **primarni kanal dostave NIJE e-mail**, nego **razmjena preko
  informacijskog posrednika / pristupne točke (Peppol-slično, HR mreža)**. Slanje PDF-a
  e-mailom **ne zadovoljava** obvezu izdavanja eRačuna — pravni put je strukturirani XML
  kroz posrednika. E-mail se može koristiti kao dodatna, neobvezna kopija.

> ⚠️ Ne miješati: „poslati PDF na mail" ≠ „izdati eRačun". Za 2.0 mora ići XML kroz
> ovlaštenog posrednika/pristupnu točku.

### 6.2. Slanje e-maila iz Workera + deliverability

- **Cloudflare Email Sending / Email Routing** ili vanjski SMTP/API (Resend, Postmark,
  SES) — Worker šalje preko bindinga ili REST-a.
- **Deliverability (kritično za račune):** postaviti **SPF**, **DKIM**, **DMARC** za
  domenu pošiljatelja; koristiti provjerenu domenu, jasan `From`, PDF kao prilog (ne samo
  link), izbjegavati „spam" okidače. Za transakcijske mailove koristiti odvojenu
  poddomenu (npr. `racuni.domena.hr`) da se odvoji reputacija.
- **Unicode:** koristiti **UTF-8 / `utf8mb4`** svugdje (naziv, napomene) — poučeni FIRA
  bugom gdje su emoji/š-č-ž srušili backend na `utf8` kolaciji (vidi
  `docs/reference/fira-custom-webshop-api.md`).

---

## 7. Primjer rasporeda (layout) B2C fiskalnog računa

```
┌─────────────────────────────────────────────┐
│  DOMOVINA TV d.o.o.                          │  ← naziv + adresa izdavatelja
│  Ulica 1, 10000 Zagreb                       │
│  OIB: 12345678901                            │  ← OIB izdavatelja
│  Poslovni prostor: POSL1  Uređaj: 2          │  ← oznaka PP + naplatnog uređaja
├─────────────────────────────────────────────┤
│  RAČUN br. 1523/POSL1/2                       │  ← fiskalni broj računa
│  Datum/vrijeme: 04.07.2026. 12:30            │  ← datum + vrijeme
│  Operater: Ivan Horvat (OIB 98765432109)     │  ← oznaka operatera
├─────────────────────────────────────────────┤
│  Naziv       Kol.  Cij.(bez)  Stopa  Iznos   │
│  Usluga A     1     80,00     25%    80,00    │  ← naziv, količina, jed. cijena, stopa
│  Proizvod B   2     10,00     13%    20,00    │
├─────────────────────────────────────────────┤
│  Osnovica 25%: 80,00   PDV 25%: 20,00        │  ← rekapitulacija po stopi
│  Osnovica 13%: 20,00   PDV 13%:  2,60        │
│  ─────────────────────────────────────       │
│  UKUPNO BEZ PDV-a:            100,00 EUR      │
│  UKUPNO PDV:                   22,60 EUR      │
│  ZA PLATITI:                  122,60 EUR      │  ← ukupno s PDV-om
│  Način plaćanja: Kartica (K)                 │  ← način plaćanja
├─────────────────────────────────────────────┤
│  ZKI: abcdef01234567890abcdef012345678       │  ← 32-znamenkasti ZKI
│  JIR: 12345678-1234-1234-1234-123456789012   │  ← JIR (UUID)
│                                              │
│           ┌───────────────┐                  │
│           │   [ QR KOD ]  │  ← ≥2×2 cm,      │
│           │  porezna.gov  │    ECC „L",       │
│           │  .hr/rn?jir=… │    quiet zone 2mm │
│           └───────────────┘                  │
│  Napomena: (npr. „prijenos porezne obveze")  │  ← klauzula ako primjenjivo
└─────────────────────────────────────────────┘
```

---

## 8. Sažetak / checklist za implementaciju

- [ ] Svi elementi čl. 79. (broj, datum, izdavatelj+OIB, kupac+OIB, stavke, stopa+iznos PDV po stopi, ukupno).
- [ ] Obvezne klauzule (oslobođenje / prijenos porezne obveze / mali obveznik).
- [ ] Fiskalni dodaci (JIR, ZKI, operater, PP, naplatni uređaj, način plaćanja) — samo B2C 1.0.
- [ ] QR kod: URL `porezna.gov.hr/rn` + `jir`/`zki` + `datv` (`GGGGMMDD_HHMM`) + `izn` **(provjeriti lipe vs. decimale u aktualnoj spec!)**, ≥2×2 cm, ECC „L", ISO/IEC 15415.
- [ ] eRačun 2.0: XML je pravni dokument; PDF samo vizualizacija (opcionalno kao `EmbeddedDocumentBinaryObject`).
- [ ] PDF generiranje: Browser Rendering (HTML→PDF) ili pdf-lib; QR kao data-URI.
- [ ] E-mail: SPF/DKIM/DMARC; UTF-8/utf8mb4; PDF kao prilog. eRačun ide kroz posrednika, ne mailom.

---

## Izvori

- [Porezna uprava — Račun (obvezni sadržaj)](https://porezna-uprava.gov.hr/hr/racun/4595) — dodatni elementi fiskalnog računa (pristup 2026-07-04)
- [Porezna uprava — QR kod](https://porezna-uprava.gov.hr/hr/qr-kod/4619) — službena stranica o QR kodu (pristup 2026-07-04)
- [Porezna — Provjeri fiskalni račun](https://porezna.gov.hr/fiskalizacija/gotovinski-racuni/provjeri-fiskalni-racun) — načini provjere, `porezna.gov.hr/rn` (pristup 2026-07-04)
- [Porezna — Mišljenje: Dopuna podataka na QR kodu](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2513) — službeno mišljenje o sadržaju QR (pristup 2026-07-04)
- [Fiskalizacija — Tehnička specifikacija za korisnike v2.6 (PDF)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf) — službena tehnička spec 1.0 (pristup 2026-07-04)
- [Porezna — Vodič kroz Fiskalizaciju 2.0](https://porezna-uprava.gov.hr/hr/vodic-kroz-fiskalizaciju-2-0/8149) — rokovi i obveze (pristup 2026-07-04)
- [Porezna — eRačun (Fiskalizacija 2.0)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/eracun) — eRačun, UBL 2.1, validator (pristup 2026-07-04)
- [Tehnička specifikacija — Fiskalizacija eRačuna i eIzvještavanje (PDF)](https://fiskalizacija2.hr/wp-content/uploads/2025/07/Tehnicka_specifikacija_Fiskalizacija_eRacuna_i_eIzvjestavanje.pdf) — spec 2.0 (pristup 2026-07-04)
- [pdvaktualno.hr — Članak 79. ZPDV](https://www.pdvaktualno.hr/33/clanak-79-obvezni-sadrzaj-racuna-uniqueidmRRWSbk196E4DjKFq6pChG6vuuclhFodfepYl11cGkqiKebrrbyYXg/) — obvezni sadržaj računa (pristup 2026-07-04)
- [zakon.hr — Zakon o PDV-u](https://www.zakon.hr/z/186/Zakon-o-porezu-na-dodanu-vrijednost) — pravni izvor čl. 79. (pristup 2026-07-04)
- [TEB — Klauzula o oslobođenju malih obveznika (2025)](https://www.teb.hr/novosti/2025/klauzula-o-oslobodenju-od-placanja-pdv-a-na-racunima-malih-poreznih-obveznika-od-112025/) — napomena za male obveznike (pristup 2026-07-04)
- [HOK — Uvodi se QR kod kao sastavni dio računa](https://www.hok.hr/novosti-iz-hok/podsjetnik-fiskalizacija-uvodi-se-qr-kod-kao-sastavni-dio-racuna) — obveza i tehnički zahtjevi QR (pristup 2026-07-04)
- [LIBUSOFT CICOM (SPI) — Obveza ispisa QR koda](https://www.spi.hr/obveza-ispisa-qr-koda-na-fiskaliziranim-racunima/) — sadržaj QR koda (pristup 2026-07-04)
- [EY — eRačun i Fiskalizacija 2.0 (PDF)](https://www.ey.com/content/dam/ey-unified-site/ey-com/hr-hr/insights/tax/documents/ey-eracun-i-fiskalizacija-2-0.pdf) — pregled 2.0, XML kao pravni dokument (pristup 2026-07-04)
- [mvv.hr — HrFiskalizator ePoslovanje dokumentacija](http://mvv.hr/hrfiskalizator/web/pluginssetup/eposlovanje/dokumentacija.php) — PDF prilog u XML, `pdfname` (pristup 2026-07-04)
- [Expertise.hr — Fiskalizacija 2.0: rokovi i obveze 2026](https://expertise.hr/fiskalizacija-2-0-kljucne-promjene-rokovi-i-obveze-za-eracune-od-2026/) — rokovi 2026/2027 (pristup 2026-07-04)
- [Cloudflare — Generate PDFs Using HTML and CSS](https://developers.cloudflare.com/browser-run/how-to/pdf-generation/) — Browser Rendering PDF (pristup 2026-07-04)
- [Cloudflare — `/pdf` REST endpoint](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/) — Quick Action PDF (pristup 2026-07-04)
- [PDF4.dev — PDF generation on Cloudflare Workers 2026](https://pdf4.dev/blog/pdf-generation-cloudflare-workers) — usporedba opcija (pristup 2026-07-04)

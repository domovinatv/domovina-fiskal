# Fira.finance — UI obilazak (IA, ekrani, polja, tokovi)

> Iz prve ruke: read-only obilazak `app.fira.finance` (prijavljen račun), **2026-07-04**.
> Svrha: UI/IA temelj za naše ekrane + validacija podatkovnog modela (`docs/knowledge/05-*`).
> Bez screenshotova (privatni podaci na ekranima); dokumentirana su imena polja/tokovi.
> Dopunjuje poslovnu analizu u `docs/knowledge/07-fira-analiza.md` i API u
> `docs/reference/fira-custom-webshop-api.md`.

## 1. Glavna navigacija (lijevi meni) i rute

| Stavka | Ruta | Napomena |
|---|---|---|
| Početna | `/user/home` | dashboard |
| Ponude | `/user/offers` | ponude/predračuni |
| Računi | `/user/invoices` | (ne-fiskalni + eRačun) |
| Fiskalni računi | `/user/invoices/fiscal` | B2C fiskalizacija 1.0 |
| Bankarstvo | `/user/accounts` | |
| Troškovi `Novo` | `/user/expenses` | auto-uvoz ulaznih eRačuna kao troškova |
| Unos sati | `/user/time-tracker` | |
| Klijenti | `/user/clients` | |
| Proizvodi | `/user/products` | katalog s KPD |
| Skladište `Novo` | `/user/warehouse` | |
| Izvješća | `/user/reports` | |
| Postavke | `/user/sme-settings/*` | (pod-navigacija niže) |
| Odjava | `/logout` | |

Dodatno: „Video upute", „Pozovite prijatelja", Erste Bank integracija (banner).

**Postavke — pod-navigacija:** Osnovni podaci (`/sme-settings/basic-data`), Postavke računa,
Slijedovi računa (`/sme-settings/invoice-number-settings`), Korisnici, FIRA paketi
(`/sme-settings/pricing-plan`), **Fiskalizacija** (`/sme-settings/fiscal`), **eRačun**
(`/sme-settings/einvoice`), Webshop, Teya POS Integracija, Pozovi prijatelja.

## 2. Dashboard (`/user/home`)
- Pozdrav + brojači: **Plaćeni / Nedospjeli / Dospjeli računi**.
- Gumbi: „Pregled računa/eRačuna", „Pregled fiskalnih računa".
- Lista računa po mjesecu (filter razdoblja).
- Notifikacije: automatski **preuzeti ulazni eRačuni** → kreiraju se kao **troškovi**.

## 3. Lista računa (`/user/invoices`)
- Filteri razdoblja: Danas / Trenutni mjesec / Prethodni mjesec / Trenutna godina / Razdoblje.
- Filteri: **Vrsta**, **Status**.
- **Vrste računa** (iz URL filtera): `RAČUN_ZA_PREDUJAM`, `RAČUN`, `STORNO_RAČUN`, `E_RAČUN`.
- Stupci: **Klijent · Vrsta · Datum računa · Broj računa · Ukupno · PDV · Osnovica · Datum dospijeća · Detalji · Akcije**.
- Gumb „Novi račun".

## 4. Forma novog računa/eRačuna (`/user/invoices/details`) — KLJUČNO
Naslov: „Novi račun/eRačun — Za poslovne subjekte i javnu nabavu".
Vrh: tražilica „upiši ime klijenta ili broj dokumenta" (kopiranje postojećeg), gumb
**Spremi** (+ **Spremi kao skicu**), akcijske ikone: **PDF · email · eRačun (e) · download · postavke**.

**Zaglavlje računa:**
- `Vrsta *` (Račun / …), `Jezik` (Hrvatski), `Valuta` (EUR), `Sastavio/la *`, `Mjesto isporuke`.
- `Broj računa *` → **„Odaberi slijed računa"** (bira slijed, vidi §8), `Datum računa *`,
  `Vrijeme računa *` (HH:mm), `Datum dospijeća`.
- `IBAN za primanje uplate *`, `Uvjeti plaćanja`, `Datum isporuke` (+ „Dodaj razdoblje isporuke").
- `Model poziva na broj *` (HR00), `Poziv na broj *`, `BIC/SWIFT`, ☐ `Sakrij podatke za naplatu`.

**Vaš Poslovni Subjekt** (izdavatelj — automatski iz Osnovnih podataka).

**Primatelj računa:** `OIB`, `Klijent *` (odaberi postojećeg ili upiši), `Broj PDV-a`,
`Email primatelja računa`, `Ulica`, `Poštanski broj`, `Grad`, `Zemlja` (Hrvatska).

**Bilješke** (interno — „nije vidljivo u ponudi/predračunu/računu").

**Proizvodi (stavke):** stupci **Naziv · Šifra · Količina · Jedinica · Popust (%) · Osnovica · Iznos**;
opcije ☐ „Opis proizvoda", ☐ „Promijenite redoslijed proizvoda"; „Dodaj novi red";
`Popust na sve (%)`; **Ukupno** (EUR).
> Napomena: PDV stopa nije zaseban stupac stavke na ovoj formi (izdavatelj ITalk je *izvan
> sustava PDV-a*, pa je PDV skriven). Kod PDV-obveznika stopa je vjerojatno po stavci/proizvodu.

**Uvjeti** („Primjeri" link) — **rich-text** editor, po jeziku (tab Hrvatski/…).
**Datoteke** — privitci uz slanje računa, **maks. 6 MB**.

## 5. eRačun 2.0 postavljanje (`/user/sme-settings/einvoice`) — „F2 eRačun - Vodič"
**Fira eRačun ide preko partnera `Pondi d.o.o. (eposlovanje.hr)` kao pristupne točke/posrednika.**
Slanje eRačuna uključeno u sve pakete; primanje + eArhiva bez dodatnih troškova.

Čarobnjak (4 koraka):
1. **Registrirajte se za eRačun** — „Registracija prvi put" / „Već imam ePoslovanje račun".
   FIRA šalje prijavu Pondiju → Pondi šalje **ugovor na mail** → nakon potpisa račun aktiviran
   → eRačun se šalje direktno iz FIRA-e. (Aktivacija **2–3 radna dana**.)
2. **Odabir ePoslovanja kao pristupne točke (PT)** — treba pristup **ePoreznoj**:
   - (1) **Odabir ePoslovanja kao PT za primanje** računa u **FiskAplikaciji** PU
     (ePoslovanje je već poslalo zahtjev za registraciju PT-a). Uputa „Odabir PT za primanje".
   - (2) **Davanje punomoći** da ePoslovanje **u tvoje ime potpisuje fiskalizacijske i
     eIzvještavanje poruke koristeći NJIHOV certifikat**. Uputa „Davanje punomoći".
   - Gumb **„Provjerite AMS status"** (AMS = Adresar metapodatkovnih servisa).
3. **Postavke automatske fiskalizacije ulaznih i izlaznih računa** (auto-fiskalizacija).
4. **Pošaljite svoj prvi eRačun**.

> **Arhitektonska poanta za nas:** preko posrednika (punomoć) **tenant NE treba vlastiti
> certifikat** za 2.0 kanal — posrednik potpisuje svojim. Potvrđuje „faza 1 preko posrednika"
> iz `docs/knowledge/03-*` §11 i `11-*` §3. AMS/PT/punomoć su realni, imenovani koraci.

## 6. Fiskalizacija 1.0 postavljanje (`/user/sme-settings/fiscal`) — „F1 Fiskalizacija - Vodič"
Uvod: ako izdaješ krajnjem potrošaču (fizičkoj osobi), **dužan si izdati fiskalni račun —
neovisno o načinu plaćanja** (kartica/gotovina/transakcijski). Koraci:
1. **F1 Fiskalni certifikat** — „potreban F1 digitalni certifikat (**FINA, AKD/Certilla**…),
   učita se **uz lozinku** u postavke". Format **`.p12` ili `.pfx`**. Gumbi: „FINA stranica",
   „ePoslovanje certifikat", **„Postavi certifikat"**.
2. **Prijavite poslovni prostor ePoreznoj + napravite interni akt** — „prijava poslovnog
   prostora ide preko **ePorezne**, dok **interni akt čuvate kod sebe**".
3. **Izdajte svoj prvi fiskalni račun**.

> Potvrđuje `docs/knowledge/04-*` (FINA/AKD, .p12/.pfx + lozinka) i `05-*` (poslovni prostor).

## 7. Slijedovi računa (`/user/sme-settings/invoice-number-settings`) — KLJUČNO za model
- Tabovi: **Računi · Fiskalni računi · Ponude/Predračuni** (odvojeni slijedovi po tipu).
- Više slijedova (npr. „2-1", „0-0", „1-1") + „Dodaj novi slijed".
- **Format broja = `{redniBroj}-{poslovniProstor}-{naplatniUređaj}`** (npr. „Sljedeći broj: **11-2-1**").
- Polja slijeda: `Redni broj`, `Poslovni prostor *`, `Naplatni uređaj *`, „Prikaži dodatne postavke".
- **Webshopovi:** slijed se veže na webshop (izvor API ključa; kod korisnika: `fira-forms-connector`).
- **Operateri za slijed:** `Ime i prezime`, `OIB operater - fizička osoba`, `Ime ili oznaka operatera`; „Dodaj operatera".

> **Direktna validacija `docs/knowledge/05-*`:** apiKey/webshop → **slijed** (redni broj) +
> poslovni prostor + naplatni uređaj + **operater (OIB)**. Točno naš `sekvenca` + `poslovni_prostor`
> + `naplatni_uredaj` + `operater`, povezan na `api_kljuc`.

## 8. Proizvodi (`/user/products`)
- Prazan katalog → „Novi proizvod" ili **„Uvezi proizvode u obliku excel datoteke"**.
- **Forma proizvoda** (`/user/products/details`): `Naziv proizvoda / usluge *`, `Šifra proizvoda`,
  `Jedinica` (default „kom"), **`KPD šifra proizvoda *`** s ugrađenom tražilicom
  **„Pretražite KPD 2025. klasifikaciju"**, `Ukupna cijena *`, `Pripada klijentu?` (proizvod
  može biti vezan uz klijenta), `Opis` (rich-text).

> **KPD 2025 je OBAVEZAN po proizvodu** i Fira nudi KPD picker — moramo replicirati
> (validacija + pretraga KPD-a). Potvrđuje `docs/knowledge/06-*`.

## 9. Osnovni podaci / tenant (`/user/sme-settings/basic-data`)
Polja izdavatelja (= naš `tenant`): `Naziv poslovnog subjekta *`, `OIB *`, `Broj PDV-a`,
`Logo` (maks. 2MB), `Broj telefona *`, `Email poslovnog subjekta *`, **`U sustavu PDVa`**
(toggle), `Odaberi jezik`, `Ulica poslovnog subjekta *`, `Grad poslovnog subjekta *` (+ dodatna
polja niže). Zaglavlje svake postavke prikazuje karticu tvrtke (naziv, OIB, adresa).

## 10. Puni pregled svih modula (cijeli obilazak)

### 10.1 Dokumenti (izdavanje)
- **Ponude** (`/user/offers`) — vrste `PONUDA`, `PREDRAČUN`. Lista + forma **identična** formi računa (§4), samo `Vrsta`. „Nova ponuda".
- **Računi** (`/user/invoices`) — vrste `RAČUN_ZA_PREDUJAM`, `RAČUN`, `STORNO_RAČUN`, `E_RAČUN` (§3–§4).
- **Fiskalni računi** (`/user/invoices/fiscal`) — vrste `FISKALNI_RAČUN`, `FISKALNI_STORNO_RAČUN`.
  Dodatni filteri: **Fiskalni status** (odražava JIR/uspjeh fiskalizacije) i **Način plaćanja**. „Novi fiskalni račun".
- Sve liste dijele stupce: Klijent · Vrsta · Datum · Broj · Ukupno · PDV · Osnovica · Dospijeće · Detalji · Akcije; filteri razdoblja + Vrsta + Status.

### 10.2 Klijenti (`/user/clients`)
Kartični prikaz: **Naziv, OIB, Adresa (grad, zemlja), Email**. „+" novi klijent. (= naš `kupac`.)

### 10.3 Proizvodi (`/user/products`) — vidi §8 (KPD 2025 obavezan, Excel uvoz).

### 10.4 Troškovi (`/user/expenses`)
Ulazni računi/troškovi; **auto-uvoz zaprimljenih eRačuna** kao troškova (notifikacije „Preuzet je novi ulazni eRačun"). Filteri Status/Datum, „Novi trošak". Osnova za pretporez + eIzvještavanje o naplati/odbijanju.

### 10.5 Bankarstvo (`/user/banking`)
**Open Banking (PSD2)** preko **GoCardless** portala — poveži bankovni račun (Agram, BKS, Erste, HPB, Istarska, OTP, POBA, PBZ…) za dohvat transakcija i **usklađivanje plaćanja** (naplata računa). Napredni upsell.

### 10.6 Unos sati (`/user/time-tracker`)
Tjedni **timesheet** (Klijent × Proizvod × dani u tjednu → Ukupno sati). Za naplatu po satu → pretače se u račun. Upsell (freelanceri/agencije).

### 10.7 Skladište (`/user/warehouse`) `Novo`
Više **skladišta**, svako sa svojom listom praćenih proizvoda (stanje zaliha). Upsell.

### 10.8 Izvješća (`/user/reports`)
Financijski dashboard (EUR): **Prihodi i rashodi** (bar chart po mjesecu; Prihodi=izlazni računi, Rashodi=troškovi), „Prihodi i rashodi detaljno", **PDV prognoza**.

### 10.9 Postavke — pod-moduli
- **Osnovni podaci** (`/basic-data`) — tenant (§9).
- **Postavke računa** (`/invoice-settings`) — defaults: `Vrijeme dospijeća (dana)` (30), `Broj decimalnih mjesta kod proizvoda` (2), ☐ `Dvojezični računi`, ☐ `Opisi proizvoda na računima`, ☐ **`Uvijek printaj fiskalne račune u POS formatu`** (termalni ispis), izbor **PDF predloška** (thumbnail pokazuje **QR kod na dnu** fiskalnog računa).
- **Slijedovi računa** (`/invoice-number-settings`) — numeriranje + operateri + webshop veza (§7).
- **Korisnici** (`/users`) — višekorisnički pristup s **ulogama** (npr. „FIRA Pro **Vlasnik**"); „+" poziv korisnika.
- **FIRA paketi** (`/pricing-plan`) — pretplatnički paketi (cjenik u `docs/knowledge/07-fira-analiza.md`).
- **Fiskalizacija** (`/fiscal`) — F1 setup + certifikat (§6).
- **eRačun** (`/einvoice`) — F2 setup preko posrednika (§5).
- **Webshop** (`/webshop`) — API integracija (§10.10).
- **Teya POS Integracija** — integracija s **Teya** POS/kartičnim terminalom (fiskalizacija na blagajni).
- **Pozovi prijatelja** (`/invite-friends`) — referral.

### 10.10 Webshop / API integracija (`/user/sme-settings/webshop`) — KLJUČNO
- Integracije: **Shopify · WooCommerce · Custom** webshop. Više webshopova („+").
- Po webshopu: **`Webshop domena *`** + **`Tajni ključ *`** (API secret, UUID).
- Endpoint (potvrđuje `fira-custom-webshop-api.md`): **`https://app.fira.finance/api/v1/webshop/order/custom`** — tajni ključ ide u HTTP zaglavlje.
- Webshop se veže na **slijed računa** (§7) → time na poslovni prostor/naplatni uređaj/operatera.
- „API dokumentacija →" (live referenca).

> **Multi-tenant lanac (potvrđen):** `Webshop(domena + tajni ključ/apiKey)` → `Slijed računa`
> → `Poslovni prostor` + `Naplatni uređaj` + `Operater(OIB)` → `Račun`. Ovo je točno naš model.

## 11. Funkcionalna analiza — što je jezgra, što upsell (za naš opseg)

| Modul | Fira | Nama za MVP? |
|---|---|---|
| Ponude/Računi/Fiskalni/eRačun | ✅ jezgra | **DA** (jezgra) |
| Klijenti | ✅ | **DA** |
| Proizvodi + KPD 2025 picker | ✅ | **DA** (KPD obavezan) |
| Postavke: certifikat, poslovni prostor, slijedovi, operateri | ✅ | **DA** |
| Webshop/API (tajni ključ) | ✅ | **DA** (naš primarni ulaz) |
| PDF predložak + QR + POS format | ✅ | **DA** (PDF/QR), POS kasnije |
| Troškovi (ulazni eRačuni) + eIzvještavanje | ✅ | **DA za 2.0** (zaprimanje/izvještavanje) |
| Korisnici/uloge | ✅ | Kasnije (MVP: 1 vlasnik) |
| Izvješća (Prihodi/rashodi, PDV prognoza) | ✅ | Kasnije |
| Bankarstvo (GoCardless PSD2) | ✅ | **Ne** (upsell) |
| Unos sati (timesheet) | ✅ | **Ne** (upsell) |
| Skladište | ✅ | **Ne** (upsell) |
| Teya POS integracija | ✅ | **Ne** (kasnije) |

**Zaključak:** Firina širina (Bankarstvo/Unos sati/Skladište/POS) su **upsell moduli**, ne jezgra
fiskalizacije. Naš MVP = **izdavanje (ponuda/račun/fiskalni/eRačun) + klijenti + proizvodi(KPD) +
postavke izdavatelja (certifikat/poslovni prostor/slijedovi/operateri) + Webshop API + PDF/QR/email +
zaprimanje eRačuna/eIzvještavanje**. Admin ostaje **server-rendered i jednostavan** (`CLAUDE.md`);
preuzimamo **IA + inventar polja + UX detalje** (skica, kopiranje dokumenta, višejezični Uvjeti,
privitci ≤6 MB, KPD picker, POS format, PDF predložak s QR).

## 11. Zaključci za `domovina-fiskal` (UI/IA + arhitektura)
- **eRačun 2.0 = preko posrednika (ePoslovanje/Pondi) + punomoć** → tenant bez vlastitog
  certa za 2.0. Naša faza 1 identična; možemo ponuditi izbor posrednika.
- **F1 (B2C) = tenantov vlastiti FINA/AKD `.p12` + lozinka** → naš potpis (edge/sidecar, `11-*`).
- **Numeriranje** `{br}-{pp}-{nu}` + operater(OIB) + veza na webshop/apiKey → naš model 05 stoji.
- **KPD 2025 picker obavezan** → dodati KPD pretragu/validaciju (šifrarnik iz `06-*`).
- **Skala Fire** (Skladište, Unos sati, Bankarstvo, Troškovi, POS) su **upsell**, ne MVP.
  Naš MVP jezgra: Klijenti · Proizvodi(KPD) · Ponude/Računi/Fiskalni/eRačun · Postavke
  (certifikat, poslovni prostor, slijedovi, operateri) · API/Webshop. Admin je server-rendered
  i jednostavan (vidi `CLAUDE.md`), ne kloniramo Firin SPA — preuzimamo **IA i inventar polja**.
- **UX detalji za preuzeti:** „Spremi kao skicu", kopiranje postojećeg dokumenta, višejezični
  Uvjeti (RTE), privitci (≤6 MB), akcijske ikone (PDF/email/eRačun/download), Excel uvoz proizvoda.

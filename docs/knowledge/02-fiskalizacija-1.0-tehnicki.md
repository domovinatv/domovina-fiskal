# Fiskalizacija 1.0 — tehnička specifikacija (CIS Porezne uprave)

> Domenska dokumentacija za projekt `domovina-fiskal`.
> Stanje na dan **2026-07-04**. Pisano na temelju službene *Fiskalizacija — Tehnička
> specifikacija za korisnike*, verzija **v2.6** (APIS IT / Porezna uprava), plus
> WSDL/XSD iz prakse i službenih obavijesti PU/FINA.
> Sve netrivijalne tvrdnje potkrijepljene su izvorom u sekciji [Izvori](#izvori).

---

## 0. Kontekst 2026: je li Fiskalizacija 1.0 još živa?

**DA — Fiskalizacija 1.0 (fiskalni račun / CIS gotovinske fiskalizacije) i dalje
radi u 2026. i nije ukinuta.** Novi *Zakon o fiskalizaciji* (NN 89/2025) stupio je
na snagu **01.09.2025.**, a obvezna primjena Fiskalizacije 2.0 / eRačuna kreće
**01.01.2026.** (I. faza) i **01.01.2027.** (II. faza). No za **B2C (krajnja
potrošnja)** i dalje se izdaje **fiskalni račun (Fiskalizacija 1.0)** — za sve
račune prema građanima, neovisno o načinu plaćanja (gotovina, kartica,
transakcijski račun i dr.). Dakle CIS shema opisana u ovom dokumentu (ZKI/JIR,
`RacunZahtjev`, XML-DSIG, endpoint `:8449`) ostaje operativna.

Ključne promjene relevantne za tehniku 1.0 u 2025./2026.:
- **Od 01.09.2025.** ukida se način plaćanja **`C` (ček)** u svim metodama →
  dozvoljeni načini plaćanja su sada **`G`, `K`, `T`, `O`** (bez `C`).
- **Od 01.01.2026.** fiskaliziraju se i **transakcijski računi u krajnjoj
  potrošnji** (ranije izuzeti), te se uvodi **promjena podataka računa** (način
  plaćanja i/ili OIB primatelja).
- **Od 01.09.2025.** poruke zahtjeva mogu se potpisivati **aplikacijskim
  certifikatima koji sadrže OIB**, izdanima od pouzdanih izdavatelja u RH (ne samo
  FINA-inim „fiskal" certifikatom).

> ⚠️ **Istek poslužiteljskog certifikata siječanj 2026.** — PU/APIS IT su
> **12.01.2026. ~05:00** zamijenili poslužiteljski certifikat `cis.porezna-uprava.hr`
> (test `cistest.apis-it.hr` već **29.12.2025.**). Klijent MORA imati preuzet novi
> javni ključ CIS-a inače TLS/validacija odgovora puca. Kontakt: `certifikati-fiskalizacija@fina.hr`,
> `fiskalizacija.help@apis-it.hr`. (Ovo je periodičan događaj — certifikat se mijenja ~svakih par godina.)

---

## 1. Rječnik pojmova

| Pojam | Značenje |
|---|---|
| **CIS** | Centralni informacijski sustav Porezne uprave (pristupna točka fiskalizacije, hosta APIS IT) |
| **ZKI** | Zaštitni kod izdavatelja — 32-znamenkasti hex kod koji **generira obveznik** i ispisuje na račun |
| **JIR** | Jedinstveni identifikator računa — UUID (36 znakova) koji **vraća CIS** kao potvrdu fiskalizacije |
| **Obveznik** | Obveznik fiskalizacije (izdavatelj računa) |
| **Aplikativni certifikat** | Digitalni certifikat obveznika kojim se potpisuje ZKI i XML poruka (FINA „fiskal" ili drugi pouzdani izdavatelj s OIB-om) |
| **Poslužiteljski certifikat** | Certifikat CIS-a (`cis.porezna-uprava.hr` / `cistest.apis-it.hr`) kojim se PU predstavlja u TLS-u |

---

## 2. Zaštitni kod izdavatelja (ZKI) — točan algoritam

ZKI je alfanumerički zapis kojim se potvrđuje veza između obveznika i izdanog
računa. **Formira ga obveznik** (ne CIS), ispisuje na račun i šalje u
`RacunZahtjev` kao obavezni element `<tns:ZastKod>`.

### 2.1 Ulazni parametri i redoslijed konkatenacije

Ulazni string (`medjurezultat`) nastaje **konkatenacijom (bez separatora)** sljedećih
polja, točno ovim redoslijedom:

```
medjurezultat =
    OIB                              (11 znamenki, OIB obveznika)
  + datum i vrijeme izdavanja        (format 'dd.MM.yyyy HH:mm:ss'  ← RAZMAK, NE 'T')
  + brojčana oznaka računa (BrOznRac)
  + oznaka poslovnog prostora (OznPosPr)
  + oznaka naplatnog uređaja (OznNapUr)
  + ukupni iznos računa (IznosUkupno, decimalni separator TOČKA, npr. 1245.56)
```

> ⚠️ **KRITIČNO — dva različita formata datuma:**
> - U **ZKI konkatenaciji** datum je `dd.MM.yyyy HH:mm:ss` s **razmakom** između
>   datuma i vremena (npr. `01.10.2012 16:04:25`).
> - U **XML poruci** (`<DatVrijeme>`, `<DatumVrijeme>`) datum je
>   `dd.MM.ggggThh:mm:ss` s velikim **`T`** (npr. `01.09.2012T21:10:34`).
> Miješanje ova dva formata je najčešća greška koja daje pogrešan ZKI.

Kodiranje je **UTF-8**. (Napomena: službeni C# primjer koristi `Encoding.ASCII`, a Java
`getBytes()` bez argumenta; za polja koja su OIB/broj/iznos/oznake ASCII i UTF-8 daju
isti bajtni niz — no specifikacija propisuje UTF-8, pa koristite UTF-8.)

### 2.2 Kriptografski koraci

```
1. medjurezultat = konkatenacija gore navedenih polja
2. potpisano     = RSA-SHA1( medjurezultat )   // potpis PRIVATNIM ključem aplik. certifikata
                                                //  (algoritam "SHA1withRSA")
3. zki           = MD5( potpisano )             // MD5 nad BAJTOVIMA potpisa (RFC 1321)
4. zki           = hex(zki), lowercase          // 32 znaka, samo 0-9 a-f
```

Rezultat je **32-znamenkasti heksadecimalni** broj, samo mala slova i znamenke
(`0-9`, `a-f`). Primjer iz specifikacije: `a1e6b1428f0cc755f0c82aa7a1327e35`.

Sažeti prikaz iz specifikacije (poglavlje 12):

> `MD5 hash (Elektronički potpis privatnim ključem (OIB + datum i vrijeme izdavanja +
> brojčana oznaka računa + oznaka poslovnog prostora + oznaka naplatnog uređaja +
> ukupni iznos računa))`

### 2.3 Pseudokod (iz spec., poglavlje 12.1)

```
početak
  pročitaj(oib);                 medjurezultat = oib
  pročitaj(datVrij);             medjurezultat += datVrij   // 'dd.MM.gggg HH:mm:ss'
  pročitaj(bor);                 medjurezultat += bor       // brojčana oznaka računa
  pročitaj(opp);                 medjurezultat += opp       // oznaka poslovnog prostora
  pročitaj(onu);                 medjurezultat += onu       // oznaka naplatnog uređaja
  pročitaj(uir);                 medjurezultat += uir       // ukupni iznos računa
  potpisano   = RSA-SHA1(medjurezultat)
  rezultatIspis = izračunajMD5(potpisano)   // 32 hex znaka
kraj
```

### 2.4 Referentne implementacije iz specifikacije

**Java (APIS IT primjer, skraćeno):**
```java
String oib = "00169331406";
String medjurezultat = oib;
String datVrij = new SimpleDateFormat("dd.MM.yyyy HH:mm:ss").format(new Date());
medjurezultat += datVrij;
medjurezultat += "12345";    // bor
medjurezultat += "blag001";  // opp
medjurezultat += "11245";    // onu
medjurezultat += "1245.56";  // uir
Signature biljeznik = Signature.getInstance("SHA1withRSA");
biljeznik.initSign((PrivateKey) privatni);
biljeznik.update(medjurezultat.getBytes());
byte[] potpisano = biljeznik.sign();
String zki = DigestUtils.md5Hex(potpisano);   // 32-znamenkasti hex
```

**.NET / C# (APIS IT primjer, skraćeno):**
```csharp
string medjurezultat = "00169331406" + "01.10.2012 16:04:25" + "12345"
                     + "blag001" + "11245" + "1245.56";
byte[] podaci = Encoding.ASCII.GetBytes(medjurezultat);
byte[] potpisano = ((RSACryptoServiceProvider)cert.PrivateKey)
                     .SignData(podaci, new SHA1CryptoServiceProvider());
string zki = BitConverter... // MD5.ComputeHash(potpisano) -> ToString("x2") po bajtu
```

**Node.js ekvivalent (za naš stack; nije iz spec., izveden iz algoritma):**
```js
import { createSign, createHash } from "node:crypto";
const data = oib + datVrij + bor + opp + onu + uir; // datVrij = 'dd.MM.yyyy HH:mm:ss'
const potpis = createSign("RSA-SHA1").update(data, "utf8").sign(privateKeyPem); // Buffer
const zki = createHash("md5").update(potpis).digest("hex"); // 32 hex, lowercase
```
> Na Cloudflare Workers WebCrypto: `RSASSA-PKCS1-v1_5` + `SHA-1` za potpis, zatim
> MD5 nad potpisom. WebCrypto **nema MD5** — treba čisti-JS MD5 (npr. mala biblioteka).
> Vidi otvoreno arhitektonsko pitanje u `docs/knowledge/11-arhitektura-runtime.md`.

---

## 3. JIR (Jedinstveni identifikator računa)

- JIR **vraća CIS** u poruci `RacunOdgovor` nakon uspješne fiskalizacije.
- Format: **UUID, 36 znakova** (`Char(36)`), npr.
  `2cf55235-9470-4b5c-a539-463f52b109d2`.
- U poruci **zahtjeva** JIR je opcionalan/prazan; obveznik NE generira JIR.
- Kad CIS vrati JIR, obveznik ga (naknadno) ispisuje na račun. Račun **smije se
  izdati i bez JIR-a** (npr. nedostupan CIS) — tada se koristi ZKI kao identifikator,
  a poruka se dostavlja naknadno (`NakDost=true`, vidi §8).
- CIS treba obraditi poruku i vratiti odgovor u **max 2 sekunde** (mjereno od ulaska
  zahtjeva do izlaska odgovora iz CIS-a). Time-out na strani klijenta određuje obveznik.

---

## 4. XML poruke i XSD shema

### 4.1 Namespace i shema

- **Ciljni namespace tipova:** `http://www.apis-it.hr/fin/2012/types/f73`
  (prefiks u primjerima: `tns`; sufiks `f73` je verzija sheme — u starijim
  verzijama bio je npr. `f33`/`f73`, uvijek provjeriti aktualni WSDL/XSD).
- **XSD:** `FiskalizacijaSchema.xsd` (referencira se preko
  `xsi:schemaLocation="http://www.apis-it.hr/fin/2012/types/f73 ../schema/FiskalizacijaSchema.xsd"`).
- **WSDL targetNamespace:** `http://www.apis-it.hr/fin/2012/services/FiskalizacijaService`.

### 4.2 Popis poruka (root elementi)

| Poruka (zahtjev) | Poruka (odgovor) | Namjena |
|---|---|---|
| `RacunZahtjev` | `RacunOdgovor` (vraća `Jir` ili `Greske`) | Fiskalizacija računa |
| `ProvjeraZahtjev` | `ProvjeraOdgovor` | Provjera računa (**samo TEST okolina**) |
| `EchoRequest` | `EchoResponse` | Provjera dostupnosti servisa (echo teksta) |
| `PromijeniNacPlacZahtjev` | `PromijeniNacPlacOdgovor` | Promjena načina plaćanja / podataka računa |
| `ProstorZahtjev` / `PoslovniProstor` | `ProstorOdgovor` | Prijava poslovnog prostora *(zasebna metoda; vidi napomenu)* |

> Napomena o nazivu poslovnog prostora: u v2.6 poruke oko poslovnog prostora
> najviše se tiču **radnih vremena** (`prijaviRadnoVr`, brisanje, dohvat), a sam
> element nosi ime `<PoslovniProstor>`. Inicijalna prijava/verifikacija poslovnog
> prostora obavlja se i kroz zasebnu aplikaciju/servis. Točan root element za
> prijavu prostora provjeriti u aktualnom `FiskalizacijaSchema.xsd`.

### 4.3 Struktura `RacunZahtjev` (glavna polja)

| Element | Obavezan | Tip | Napomena |
|---|---|---|---|
| `Zaglavlje/IdPoruke` | DA | Char(36) | UUID, **različit za svaku poruku** (i kod ponovnog slanja!) |
| `Zaglavlje/DatumVrijeme` | DA | DateTime | `dd.mm.ggggThh:mm:ss` (slanje poruke) |
| `Racun/Oib` | DA | Char(11) | OIB obveznika (mora = OIB iz certifikata) |
| `Racun/USustPdv` | DA | Boolean | `true`/`false` (u sustavu PDV-a) |
| `Racun/DatVrijeme` | DA | DateTime | `dd.mm.ggggThh:mm:ss` (izdavanje računa) |
| `Racun/OznSlijed` | DA | Char(1) | `P` = na nivou poslovnog prostora, `N` = na nivou naplatnog uređaja |
| `Racun/BrRac/BrOznRac` | DA | Varchar(20) | Numerički broj računa, **bez vodećih nula** |
| `Racun/BrRac/OznPosPr` | DA | Varchar(20) | Oznaka posl. prostora (`0-9 a-z A-Z`), jedinstvena po OIB-u |
| `Racun/BrRac/OznNapUr` | DA | Varchar(20) | Broj naplatnog uređaja, **bez vodećih nula** |
| `Racun/Pdv/Porez[]` | NE | — | `Stopa`, `Osnovica`, `Iznos` po stopi PDV-a |
| `Racun/Pnp/Porez[]` | NE | — | Porez na potrošnju |
| `Racun/OstaliPor/Porez[]` | NE | — | `Naziv`, `Stopa`, `Osnovica`, `Iznos` |
| `Racun/IznosOslobPdv` | NE | — | Iznos oslobođen PDV-a |
| `Racun/IznosMarza` | NE | — | Iznos u posebnom postupku oporezivanja marže |
| `Racun/IznosNePodlOpor` | NE | — | Iznos koji ne podliježe oporezivanju |
| `Racun/Naknade/Naknada[]` | NE | — | `NazivN`, `IznosN` (npr. povratna naknada) |
| `Racun/IznosUkupno` | DA | — | Ukupni iznos, **decimalna točka** |
| `Racun/NacinPlac` | DA | Char(1) | `G`/`K`/`T`/`O` (vidi §5) |
| `Racun/OibOper` | DA | Char(11) | OIB operatera (blagajnika) |
| `Racun/ZastKod` | DA | Char(32) | **ZKI** (vidi §2) |
| `Racun/NakDost` | DA | Boolean | Oznaka naknadne dostave (`true`/`false`) |
| `Racun/ParagonBrRac` | NE | — | Broj paragon računa (ako se naknadno fiskalizira) |
| `Racun/SpecNamj` | NE | Varchar(1000) | Specifična namjena |
| `Racun/OibPrimateljaRacuna` | NE | Char(11) | OIB primatelja (B2B u krajnjoj potrošnji; od nov. 2025.) |

### 4.4 Primjer `RacunZahtjev` (iz spec., v2.6)

```xml
<tns:RacunZahtjev
 xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <tns:Zaglavlje>
  <tns:IdPoruke>f81d4fae-7dec-11d0-a765-00a0c91e6bf6</tns:IdPoruke>
  <tns:DatumVrijeme>01.09.2012T21:10:34</tns:DatumVrijeme>
 </tns:Zaglavlje>
 <tns:Racun>
  <tns:Oib>98765432198</tns:Oib>
  <tns:USustPdv>true</tns:USustPdv>
  <tns:DatVrijeme>01.09.2012T21:10:34</tns:DatVrijeme>
  <tns:OznSlijed>P</tns:OznSlijed>
  <tns:BrRac>
    <tns:BrOznRac>123456789</tns:BrOznRac>
    <tns:OznPosPr>POSL1</tns:OznPosPr>
    <tns:OznNapUr>12</tns:OznNapUr>
  </tns:BrRac>
  <tns:Pdv>
    <tns:Porez>
     <tns:Stopa>25.00</tns:Stopa>
     <tns:Osnovica>10.00</tns:Osnovica>
     <tns:Iznos>2.50</tns:Iznos>
    </tns:Porez>
    <tns:Porez>
     <tns:Stopa>10.00</tns:Stopa>
     <tns:Osnovica>10.00</tns:Osnovica>
     <tns:Iznos>1.00</tns:Iznos>
    </tns:Porez>
  </tns:Pdv>
  <tns:Pnp>
    <tns:Porez>
     <tns:Stopa>3.00</tns:Stopa>
     <tns:Osnovica>10.00</tns:Osnovica>
     <tns:Iznos>0.30</tns:Iznos>
    </tns:Porez>
  </tns:Pnp>
  <tns:IznosOslobPdv>12.00</tns:IznosOslobPdv>
  <tns:IznosMarza>13.00</tns:IznosMarza>
  <tns:Naknade>
    <tns:Naknada>
      <tns:NazivN>Povratna naknada</tns:NazivN>
      <tns:IznosN>1.00</tns:IznosN>
    </tns:Naknada>
  </tns:Naknade>
  <tns:IznosUkupno>30.00</tns:IznosUkupno>
  <tns:NacinPlac>K</tns:NacinPlac>
  <tns:OibOper>01234567890</tns:OibOper>
  <tns:ZastKod>e4d909c290d0fb1ca068ffaddf22cbd0</tns:ZastKod>
  <tns:NakDost>false</tns:NakDost>
  <tns:ParagonBrRac>123/458/5</tns:ParagonBrRac>
  <tns:SpecNamj>Navedeno kao primjer</tns:SpecNamj>
  <tns:OibPrimateljaRacuna>12345678901</tns:OibPrimateljaRacuna>
 </tns:Racun>
</tns:RacunZahtjev>
```

### 4.5 Primjer `RacunOdgovor` (uspjeh — vraća JIR)

```xml
<tns:RacunOdgovor xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <tns:Zaglavlje>
   <tns:IdPoruke>f81d4fae-7dec-11d0-a765-00a0c91e6bf6</tns:IdPoruke>
   <tns:DatumVrijeme>01.09.2012T21:10:34</tns:DatumVrijeme>
 </tns:Zaglavlje>
 <tns:Jir>2cf55235-9470-4b5c-a539-463f52b109d2</tns:Jir>
</tns:RacunOdgovor>
```

### 4.6 Primjer `RacunOdgovor` (greška)

```xml
<tns:RacunOdgovor xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <tns:Zaglavlje>
   <tns:IdPoruke>f81d4fae-7dec-11d0-a765-00a0c91e6bf6</tns:IdPoruke>
   <tns:DatumVrijeme>01.09.2012T21:10:34</tns:DatumVrijeme>
 </tns:Zaglavlje>
 <tns:Greske>
   <tns:Greska>
    <tns:SifraGreske>s002</tns:SifraGreske>
    <tns:PorukaGreske>Certifikat nije izdan od strane produkcijskog potpisnika
      pouzdanog izdavatelja certifikata u RH ili je istekao ili je ukinut.</tns:PorukaGreske>
   </tns:Greska>
 </tns:Greske>
</tns:RacunOdgovor>
```

### 4.7 `EchoRequest` / `EchoResponse` (nije potpisano)

```xml
<tns:EchoRequest xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">proizvoljan tekst</tns:EchoRequest>

<tns:EchoResponse xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">proizvoljan tekst</tns:EchoResponse>
```
Echo vraća isti tekst — koristi se za provjeru dostupnosti/veze. **Ne** zahtijeva
XML-DSIG potpis.

### 4.8 `ProvjeraZahtjev` (samo TEST)

Podatkovni skup identičan je `RacunZahtjev/Racun` (bez `IznosNePodlOpor`/`OibPrimatelja`
u starijim primjerima). Root element je `<tns:ProvjeraZahtjev>` s istim `Zaglavlje`
i `Racun` blokom. `ProvjeraOdgovor` vraća **prepisane originalne podatke računa** +
šifru `v100` („Poruka je ispravna") ili popis grešaka (`v1xx`, poglavlje 13. spec.).
**Metoda je dostupna samo u testnoj okolini.**

---

## 5. Način plaćanja (`NacinPlac`) i slijednost (`OznSlijed`)

### 5.1 `NacinPlac` — Char(1)

| Šifra | Značenje | Napomena |
|---|---|---|
| `G` | Gotovina | uklj. i drugo što se smatra gotovinom |
| `K` | Kartice | |
| `T` | Transakcijski račun | |
| `O` | Ostalo | default ako nije jednoznačno; ako ih je više → `O` |
| ~~`C`~~ | ~~Ček~~ | **UKINUT od 01.09.2025.** — više se ne smije koristiti |

Kod promjene načina plaćanja koristi se dodatni element
`<tns:PromijenjeniNacinPlac>` (u metodi `PromijeniNacPlac...`).

### 5.2 `OznSlijed` — Char(1)

| Šifra | Značenje |
|---|---|
| `P` | Brojevi računa slijedni na **nivou poslovnog prostora** |
| `N` | Brojevi računa slijedni na **nivou naplatnog uređaja** unutar prostora |

---

## 6. XML-DSIG potpisivanje poruke zahtjeva

Poruka zahtjeva je **XML enveloped signature** — potpis je sadržan **unutar**
elementa koji se potpisuje. Potpisuje se uvijek **root element zahtjeva** (npr.
`RacunZahtjev`), a NE cijela SOAP envelopa. (`EchoRequest` se ne potpisuje.)

### 6.1 Fiksni algoritmi (zahtjev → CIS)

> ❗ **ISPRAVAK — EMPIRIJSKI NALAZ (2026-07-05, CIS TEST, faza 2 implementacije):**
> RSA-SHA1 + SHA1 digest iz spec. v2.6 **danas vraća `s004 Neispravan digitalni
> potpis`** na CIS TEST-u. CIS je prešao na **SHA-256**: radi kombinacija
> `SignatureMethod = http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` +
> `DigestMethod = http://www.w3.org/2001/04/xmlenc#sha256` (potvrđeno dobivenim
> JIR-om; isto koriste aktualne referentne implementacije, npr.
> `nticaric/fiskalizacija` master). **ZKI i dalje koristi RSA-SHA1 + MD5** (PU
> 4616) — to su dva neovisna potpisa. Tablica ispod je korigirana.

| Element | Vrijednost (fiksna) |
|---|---|
| `CanonicalizationMethod` | `http://www.w3.org/2001/10/xml-exc-c14n#` (**Exclusive C14N**) |
| `SignatureMethod` | `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` (**RSA-SHA256**; ~~rsa-sha1 iz spec. v2.6~~ → `s004`) |
| `Transforms[0]` | `http://www.w3.org/2000/09/xmldsig#enveloped-signature` |
| `Transforms[1]` | `http://www.w3.org/2001/10/xml-exc-c14n#` |
| `DigestMethod` | `http://www.w3.org/2001/04/xmlenc#sha256` (**SHA-256**; ~~sha1~~) |

> Napomena: **ZKI ostaje RSA-SHA1 → MD5** (v. §2) — promjena na SHA-256 vrijedi
> SAMO za XML-DSIG potpis poruke.

> Napomena: **CIS u ODGOVORU** potpisuje **inkluzivnim** C14N
> (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`), a **klijent u ZAHTJEVU mora
> koristiti Exclusive C14N** (`xml-exc-c14n#`). To je asimetrija koju treba paziti
> kod verifikacije odgovora.

### 6.2 Referenca preko `Id` atributa

Root element zahtjeva ima atribut **`Id`** (definiran u XSD), koji se referencira iz
`<Reference URI="#...">`. Preporuka spec.: vrijednost `Id` = naziv root elementa
(npr. `Id="RacunZahtjev"` → `<Reference URI="#RacunZahtjev">`). U primjeru pune
SOAP poruke koristi se `Id="racunId"` → `URI="#racunId"` — vrijednost je slobodna,
bitno je da se poklapaju.

```xml
<tns:RacunZahtjev Id="RacunZahtjev"
   xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
   ...
   <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
     <SignedInfo>
       <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
       <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
       <Reference URI="#RacunZahtjev">
         <Transforms>
           <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
           <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
         </Transforms>
         <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
         <DigestValue>VItfxY/A1BITZ/BuWpsGd9gKix4=</DigestValue>
       </Reference>
     </SignedInfo>
     <SignatureValue>0+5UDLzJuGy56HojH510+dX6VurJmL52...==</SignatureValue>
     <KeyInfo>
       <X509Data>
         <X509Certificate>MIIEyDCCA7CgAwIBAgIEPssQ2T...==</X509Certificate>
         <X509IssuerSerial>
           <X509IssuerName>OU=DEMO,O=FINA,C=HR</X509IssuerName>
           <X509SerialNumber>1053495513</X509SerialNumber>
         </X509IssuerSerial>
       </X509Data>
     </KeyInfo>
   </Signature>
 </tns:RacunZahtjev>
```

- `<SignatureValue>` — Base64 RSA-SHA1 potpis nad kanonikaliziranim `<SignedInfo>`.
- `<KeyInfo>/<X509Data>/<X509Certificate>` — Base64 (PEM) aplikacijski certifikat
  obveznika. CIS iz njega čita OIB i lanac povjerenja (mora se poklapati s `Oib` u poruci — inače greška `s005`).

### 6.3 Puna SOAP envelopa (zahtjev)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <tns:RacunZahtjev Id="racunId"
        xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.apis-it.hr/fin/2012/types/f73 ../schema/FiskalizacijaSchema.xsd">
      <tns:Zaglavlje> ... </tns:Zaglavlje>
      <tns:Racun> ... </tns:Racun>
      <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
        <SignedInfo>
          <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
          <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
          <Reference URI="#racunId"> ... </Reference>
        </SignedInfo>
        <SignatureValue>...</SignatureValue>
        <KeyInfo>...</KeyInfo>
      </Signature>
    </tns:RacunZahtjev>
  </soapenv:Body>
</soapenv:Envelope>
```
> SOAP je **document/literal**, bez WS-Security headera — potpis je unutar tijela
> na aplikacijskom elementu. `SOAPAction` header vidi §7.

---

## 7. SOAP endpoint, WSDL, mTLS, TLS

### 7.1 Endpoint URL-ovi (spec. v2.6, poglavlje 6.1)

| Okolina | Servis | URL |
|---|---|---|
| **TEST** | `FiskalizacijaServiceTest` | `https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest` |
| **PRODUKCIJA** | `FiskalizacijaService` | `https://cis.porezna-uprava.hr:8449/FiskalizacijaService` |

- **Port: `8449`** (HTTPS) za obje okoline.
- TEST okolina dostupna stalno, **osim servisnih intervala**: radnim danom
  **16:00–17:00** i nedjeljom **08:00–12:00**.
- Preporuka: min. **2 dana** neprekidnog stabilnog rada u TEST-u prije produkcije.

### 7.2 WSDL / operacije

- **WSDL targetNamespace:** `http://www.apis-it.hr/fin/2012/services/FiskalizacijaService`
- **PortType:** `FiskalizacijaPortType`, stil **document/literal**, transport SOAP/HTTP.
- Uvozi tipove iz `http://www.apis-it.hr/fin/2012/types/f73` (`FiskalizacijaSchema.xsd`).

| Operacija | SOAPAction |
|---|---|
| `racuni` | `http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/racuni` |
| `echo` | `http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/echo` |
| `provjera` | `http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/provjera` |

> Napomena: WSDL `soap:address location` u javno dostupnoj WSDL-i pokazuje na
> **produkcijski** URL (`.../FiskalizacijaService`). Za TEST se ručno preusmjerava
> na `cistest.apis-it.hr:8449/FiskalizacijaServiceTest`. Dodatne operacije
> (`promijeniNacinPlacanja`, radna vremena…) definirane su u novijim WSDL/XSD verzijama.

### 7.3 mTLS i TLS

- Komunikacija je **HTTPS (TLS)**. Prema spec.: nakon što se klijent
  „prijavi svojim certifikatom", inicira se **1-way TLS** u kojem se **poslužitelj
  PU predstavlja poslužiteljskim certifikatom** (`cis.porezna-uprava.hr`, u TEST-u
  DEMO `cistest.apis-it.hr`).
- **Autentikacija obveznika** primarno se postiže **XML-DSIG potpisom aplikacijskim
  certifikatom** (i ZKI-jem), a ne nužno klijentskim TLS certifikatom na transportu.
  U praksi se za spajanje koristi i klijentski (aplikacijski) certifikat na TLS
  razini + potpis u poruci.
  > ⚠️ Nesigurno/dvojbeno: spec. eksplicitno spominje **1-way TLS** (samo
  > poslužiteljski certifikat u TLS handshakeu), dok je stvarna autentikacija u
  > **potpisu poruke**. Praktične implementacije (npr. `soap`+`xml-crypto`) šalju i
  > klijentski certifikat kao TLS client cert. Za naš stack potvrditi u testu s DEMO
  > certifikatom je li mTLS na transportu obavezan ili je dovoljan potpis poruke.
- **TLS verzija:** spec. ne fiksira eksplicitnu TLS verziju u ekstrahiranim
  dijelovima; u produkciji CIS zahtijeva moderni TLS (**TLS 1.2+**). Točnu minimalnu
  verziju provjeriti u „Mrežni preduvjeti" (pogl. 3) i kod APIS IT — *(ostaje za potvrdu)*.
- **CA lanac:** aplikacijski certifikati produkcija = FINA **RDC CA**; test = FINA
  **DEMO CA**. Klijent mora imati preuzete CIS javne ključeve/certifikate
  (FINA RDC CA / FINA DEMO CA) za validaciju poslužitelja i potpisa odgovora.

---

## 8. Naknadna dostava (offline) i vremenska pravila

- Ako CIS nije dostupan / dogodi se greška u razmjeni (nedostupnost interneta,
  prestanak rada uređaja, greška u odgovoru), obveznik **izdaje račun bez JIR-a**
  (na računu je tada ZKI) i **naknadno ponavlja slanje** dok ne dobije ispravan
  odgovor s JIR-om. Takva poruka se šalje s **`<tns:NakDost>true</tns:NakDost>`**.
- **Bitno:** `IdPoruke` mora biti **novi/različit** kod svakog ponovnog slanja;
  poslovni podaci računa (uklj. ZKI i `DatVrijeme`) ostaju **isti** (ZKI se ne
  preračunava).
- **Rok naknadne dostave:** poruke koje nisu dobile JIR treba dostaviti „u periodu
  manjeg opterećenja". Za posebne slučajeve (npr. napojnica, promjena podataka)
  spec. navodi **rok od dva dana** od izdavanja/fiskalizacije.
  > ⚠️ Za **opći** slučaj naknadne dostave računa točan zakonski rok (povijesno
  > **48 h / 2 dana** po ranijem Zakonu/Pravilniku o fiskalizaciji) treba potvrditi
  > prema aktualnom **Zakonu o fiskalizaciji (NN 89/2025)** i pripadajućem
  > pravilniku — *(ostaje za potvrdu; ne citirati kao fiksnu vrijednost bez izvora).*
- Restriktivne kontrole datuma (poglavlje 13. spec.) relevantne za offline:
  - `176` — datum izdavanja > 30 dana **manji** od trenutnog datuma.
  - `177` — datum i vrijeme izdavanja **veći** od trenutnog (sat unaprijed).
  - `v101/v103/v104` — nesklad datuma slanja vs. fiskaliziranja (razlika > 6 sati).

---

## 9. Šifre grešaka

### 9.1 Sistemske greške (`sNNN`) — odbijaju poruku

| Šifra | Poruka |
|---|---|
| `s001` | Poruka nije u skladu s XML shemom (+ lista neispravnih elemenata) |
| `s002` | Certifikat nije izdan od produkcijskog potpisnika pouzdanog izdavatelja u RH, ili je istekao / ukinut |
| `s003` | Certifikat ne sadrži obvezan podatak |
| `s004` | Neispravan digitalni potpis |
| `s005` | OIB iz poruke zahtjeva nije jednak OIB-u iz certifikata |
| `s006` | Sistemska pogreška prilikom obrade zahtjeva |
| `s007` | (promjena nač. plaćanja) Datum izdavanja u poruci promjene ≠ trenutnom datumu |
| `s008` | (promjena nač. plaćanja) — vidi šifrarnik metode |
| `s011`, `s012` | Specifične za promjenu podataka računa |
| `s013` | Račun sadrži restriktivne greške (+ lista šifara restriktivnih grešaka) |

### 9.2 Restriktivne greške (`NNN`, unutar `s013`) — primjeri

| Šifra | Opis |
|---|---|
| `176` | Datum izdavanja > 30 dana manji od trenutnog |
| `177` | Datum i vrijeme izdavanja veći od trenutnog datuma |
| `178` | Brojčana oznaka računa ima vrijednost `0` |
| `179` | OIB operatera nije formalno ispravan |
| `180` | OIB primatelja računa nije formalno ispravan |
| `181` | OIB primatelja nije dozvoljen u kombinaciji (kontekst) |
| `164` | Iznos naknade > 135,00 EUR |
| `166` | Ukupan iznos nije ispravan po formuli (tolerancija ±0,01 EUR) |
| `167` | Max ukupni iznos za vrstu plaćanja premašen (±150.000,00 EUR) |
| `185` | Max ukupni iznos za vrstu plaćanja (10.000,00 EUR kad je Ukupni iznos …) |

**Formula kontrole ukupnog iznosa (`166`):**
```
IznosUkupno = SUM(Osnovica PDV) + SUM(Iznos PDV) + Iznos PNP
            + Iznos oslobođenja + Iznos koji ne podliježe oporezivanju
            + SUM(Iznos naknada)        (tolerancija ±0,01 EUR)
```

### 9.3 Provjera računa (`vNNN`) — samo TEST

`v100` = „Poruka je ispravna". Ostale `v1xx` su upozorenja/greške provjere
(npr. `v106` brojčana oznaka > 6 znamenki, `v160/v161` iznos PDV izvan izračuna
`Osnovica*Stopa ± 0,10`, `v164` datum > 5 radnih dana, `v176/v177` datumi). Puni
popis: poglavlje 13. specifikacije.

---

## 10. QR kod na računu

Od **01.01.2021.** obavezan je QR kod na fiskaliziranom računu (kontrola preko Weba).

**Tehnički zahtjevi:**
- QR kod model 1 ili 2, najmanja moguća inačica; min. **2×2 cm**; „quiet zone" min. 2 mm.
- Min. razina korekcije greške **`L`**; usklađen s **ISO/IEC 15415**.
- Ne smije biti na slici/logu niti sadržavati sliku/logo.

**Sadržaj QR koda** (poveznica na stranicu za provjeru):
- Bazni URL: **`https://porezna.gov.hr/rn`**
- **ili** JIR (36 znakova) **ili** ZKI (32 znaka)
- datum i vrijeme izdavanja u formatu **`GGGGMMDD_HHMM`** (13 znakova s podvlakom)
- ukupni iznos (u **eurima i centima**, bez vodećih nula i separatora; predznak `-` za storno)
- separatori: `?jir=`/`?zki=`, `&datv=`, `&izn=`

**Primjeri (iz spec.):**
```
# JIR:
https://porezna.gov.hr/rn?jir=12345678-1234-1234-1234-123456789012&datv=20200921_0630&izn=152599

# JIR, stornirani (negativan iznos):
https://porezna.gov.hr/rn?jir=12345678-1234-1234-1234-123456789012&datv=20210110_1400&izn=-10550

# ZKI (kad račun nema JIR):
https://porezna.gov.hr/rn?zki=12345678123412341234123456789012&datv=20210205_0801&izn=510
```
> Napomena o valuti: primjeri iznosa u starijoj spec. su u kunama radi ilustracije;
> **od 01.01.2023.** iznos se iskazuje u **eurima i centima** (npr. `izn=152599`
> znači 1.525,99). Ključno: **bez decimalne točke/zareza i bez vodećih nula** u
> QR polju `izn` (iznos u centima kao cijeli broj + eventualni predznak).

---

## 11. Praktični sažetak za implementaciju (naš stack)

1. **Priprema računa** → izračunaj **ZKI** (§2): konkatenacija (pazi format datuma
   s razmakom) → RSA-SHA1 potpis privatnim ključem → MD5 hex lowercase.
2. **Sastavi `RacunZahtjev`** (§4) s `ZastKod`, `IdPoruke` (novi UUID), datumi s `T`.
3. **XML-DSIG** (§6): enveloped, Exclusive C14N, RSA-SHA1, SHA1 digest, `Reference`
   po `Id` root elementa, `KeyInfo/X509Certificate` = aplikacijski cert.
4. **Zamotaj u SOAP** (`soapenv:Envelope/Body`), postavi `SOAPAction` za `racuni`.
5. **POST** na TEST `https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest`
   (prod `https://cis.porezna-uprava.hr:8449/FiskalizacijaService`) preko TLS 1.2+.
6. **Parsiraj odgovor**: `Jir` (uspjeh) ili `Greske/Greska/SifraGreske` (npr. `s004`).
7. Kod nedostupnosti → offline: izdaj s ZKI, `NakDost=true`, retry s **novim `IdPoruke`**.
8. **QR kod** (§10) na račun s JIR/ZKI + `datv` + `izn`.

> ⚠️ Runtime napomena (Cloudflare Workers): WebCrypto podržava RSASSA-PKCS1-v1_5+SHA-1
> i SHA-1 digest, ali **nema MD5** (za ZKI treba JS-MD5) i **nema ugrađen mTLS klijent
> ni gotov XML-DSIG/C14N**. Realno je potreban „signing sidecar" (Node `crypto` +
> `xml-crypto`) ili pažljiva ručna Exclusive-C14N implementacija. Odluka → `docs/knowledge/11-arhitektura-runtime.md`.

---

## 12. Empirijski nalazi faze 2 (2026-07-05, CIS TEST, FINA DEMO cert)

Nalazi iz stvarne implementacije (`backend/src/fiskal/*`) protiv
`cistest.apis-it.hr:8449` — razrješavaju ⚠️ stavke iz §7.3 i `99-gap` R3:

1. **XML-DSIG = RSA-SHA256 + SHA-256 digest** (v. ispravak u §6.1). SHA1 → `s004`.
2. **Transportni mTLS NIJE obavezan** — klijentski certifikat se NE šalje na
   TLS razini; XML-DSIG potpis u poruci je dovoljan (Echo i `RacunZahtjev`
   prošli, JIR dobiven). Time otpada i zadnji tehnički razlog za sidecar (11-* §2).
3. **CIS poslužiteljski certifikat izdaje Fina** (test: `Fina Demo CA 2020`,
   prod: `Fina RDC 2020`) — privatni CA, NIJE u javnim trust storeovima. Server
   ne šalje lanac (samo leaf). Posljedica za Workers: `fetch()` ne dopušta port
   8449, a `connect()`/`node:tls` odbijaju certifikat bez opcije vlastitog CA →
   transport ide **sirovi TCP (`cloudflare:sockets`) + TLS 1.3 u JS-u (`subtls`)**
   s bundlanim Fina sub-CA PEM-om kao trust anchorom. CIS TEST i PROD podržavaju
   TLS 1.3 + `TLS_AES_128_GCM_SHA256` + P-256 (jedina subtls kombinacija).
   AIA URL za produkcijski CA: `http://rdc.fina.hr/RDC2020/FinaRDCCA2020.cer`.
4. **Exclusive C14N "po konstrukciji" radi**: XML se serijalizira izravno u
   kanonskom obliku (bez whitespacea, xmlns prije atributa, escape `&<>`,
   prazni elementi kao par tagova) pa nije potreban `xml-crypto`; provjereno
   bajt-za-bajt protiv `lxml` exc-C14N i prihvaćeno od CIS-a.
5. **Prijava poslovnog prostora**: SOAP metoda ne postoji u aktualnoj shemi —
   prijava ide kroz ePoreznu; u TEST okolini CIS ne provjerava prostor.

## Izvori

- **Fiskalizacija — Tehnička specifikacija za korisnike, v2.6** (APIS IT / Porezna
  uprava) — primarni izvor za ZKI algoritam (pogl. 12), XML poruke, XML-DSIG (pogl. 7),
  endpointe (pogl. 6.1), šifre grešaka, QR kod (pogl. 2.7):
  https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf (pristup 2026-07-04)
- **Fiskalizacija — Tehnička specifikacija za korisnike, v2.5 (23.10.2023.)** — starija
  usporedna verzija:
  https://porezna-uprava.gov.hr/UserDocsImages/arhiva/HR_Fiskalizacija/Documents/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.5._23_10_23pdf.pdf (pristup 2026-07-04)
- **FiskalizacijaService.wsdl** (tgrospic/Cis.Fiscalization, GitHub) — WSDL: endpoint,
  targetNamespace, operacije `racuni`/`echo`/`provjera`, SOAPAction, uvoz sheme `f73`:
  https://github.com/tgrospic/Cis.Fiscalization/blob/master/src/Fiscalization/Cis/Generator/wsdl/FiskalizacijaService.wsdl (pristup 2026-07-04)
- **Porezna uprava — Istek poslužiteljskog certifikata (siječanj 2026.)** — zamjena
  `cis.porezna-uprava.hr`/`cistest.apis-it.hr` certifikata, kontakti:
  https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni/bezgotovinski-racuni-novosti/o/istek-posluziteljskog-certifikata (pristup 2026-07-04)
- **Porezna uprava — Fiskalizacija računa u krajnjoj potrošnji (B2C)** — status 1.0 u 2026.:
  https://porezna-uprava.gov.hr/hr/fiskalizacija-racuna-u-krajnjoj-potrosnji-b2c-poslovanje/8033 (pristup 2026-07-04)
- **Porezna uprava — Pitanja i odgovori vezani uz Zakon o fiskalizaciji (NN 89/2025)** —
  rokovi 01.01.2026./01.01.2027., odnos 1.0 i 2.0:
  https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Fiskalizacija_eRacun/Pitanja%20i%20odgovori%20vezani%20uz%20Zakon%20o%20fiskalizaciji.pdf (pristup 2026-07-04)
- **Hrvatska obrtnička komora — novi Zakon o fiskalizaciji** (kontekst 2.0, ukidanje `C`):
  https://www.hok.hr/aktualno/na-snagu-je-stupio-novi-zakon-o-fiskalizaciji-koji-donosi-velike-promjene-u-poslovanju (pristup 2026-07-04)

### Napomene o pouzdanosti
- ZKI algoritam, XML-DSIG algoritmi (RSA-SHA1/SHA1/exc-c14n), namespace `f73`,
  endpointi `:8449`, šifre grešaka `s001–s013`, QR format — **visoka pouzdanost**
  (izravno iz službene spec. v2.6, verbatim citirano).
- **Otvoreno / za potvrdu:** (a) je li mTLS klijentski certifikat na transportu
  obavezan ili je dovoljan potpis poruke (spec. spominje 1-way TLS); (b) točna
  minimalna TLS verzija; (c) točan zakonski rok opće naknadne dostave računa po
  NN 89/2025; (d) točan root element/shema za prijavu poslovnog prostora u aktualnom
  `FiskalizacijaSchema.xsd` (verzija `f73` vs. novije).

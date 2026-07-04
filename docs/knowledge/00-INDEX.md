# Single Point of Truth — Hrvatska fiskalizacija (indeks)

Master indeks činjenične baze znanja za `domovina-fiskal`. Cilj: sve što treba za
izgradnju sustava za izdavanje fiskaliziranih računa (1.0) i eRačuna (2.0), na jednom
mjestu, s izvorima. Stanje: **research u tijeku** (dokumente popunjava N-subagent
istraživanje; ovaj indeks se finalizira nakon kontrole potpunosti).

> Konvencija: svaka tvrdnja u dokumentima ima izvor (URL + datum pristupa). Nesigurno
> je označeno upozorenjem. Verificirati prije implementacije: vidi `99-gap-analiza.md`.

## Dokumenti

| # | Dokument | Sadržaj |
|---|---|---|
| 01 | [`01-pravni-okvir.md`](./01-pravni-okvir.md) | Zakoni, obveznici, rokovi, kazne (1.0 + 2.0) |
| 02 | [`02-fiskalizacija-1.0-tehnicki.md`](./02-fiskalizacija-1.0-tehnicki.md) | ZKI, JIR, XML sheme, SOAP/CIS endpointi, XML-DSIG, QR |
| 03 | [`03-fiskalizacija-2.0-eracun.md`](./03-fiskalizacija-2.0-eracun.md) | Obvezni eRačun, e-izvještavanje, Peppol, EN 16931, UBL/CII |
| 04 | [`04-certifikati-fina-akd.md`](./04-certifikati-fina-akd.md) | FINA/AKD certifikati, demo/prod, pohrana ključeva |
| 05 | [`05-podatkovni-model-multitenant.md`](./05-podatkovni-model-multitenant.md) | Entiteti, multi-tenant, DB shema, numeriranje |
| 06 | [`06-sifrarnici-pdv-kpd-jedinice.md`](./06-sifrarnici-pdv-kpd-jedinice.md) | PDV stope, KPD, jedinice mjere, načini plaćanja |
| 07 | [`07-fira-analiza.md`](./07-fira-analiza.md) | Analiza fira.finance (značajke, cjenik, prilike) |
| 08 | [`08-postojece-implementacije.md`](./08-postojece-implementacije.md) | senko/fiskal-hr + druge open-source/komercijalne |
| 09 | [`09-pdf-racun-i-qr-kod.md`](./09-pdf-racun-i-qr-kod.md) | Obvezni elementi računa, PDF, QR, email |
| 10 | [`10-edge-cases-validacije.md`](./10-edge-cases-validacije.md) | OIB, storno, offline, zaokruživanje, reverse charge… |
| 11 | [`11-arhitektura-runtime.md`](./11-arhitektura-runtime.md) | Worker vs signing sidecar, WebCrypto/mTLS, PDF, Peppol |
| 99 | [`99-gap-analiza.md`](./99-gap-analiza.md) | Nedostaci, proturječja, nepotvrđeno, pitanja za korisnika |

## Reference (iz prve ruke)

- [`../reference/fira-custom-webshop-api.md`](../reference/fira-custom-webshop-api.md) — Fira API dizajn (uzor za naš API)
- [`../reference/lokalni-artefakti.md`](../reference/lokalni-artefakti.md) — postojeći kod/repoi

## Destilat — ključne činjenice i odluke (stanje 2026-07-04)

### Regulatorni okvir
- **Novi Zakon o fiskalizaciji — NN 89/2025** (objavljen 13.06.2025., na snazi **01.09.2025.**),
  zamijenio stari Zakon o fiskalizaciji u prometu gotovinom.
- **Fiskalizacija 2.0 / eRačun — rokovi:** od **01.01.2026.** PDV-obveznici **izdaju i
  zaprimaju** eRačun (B2B/B2G); ne-PDV obveznici **zaprimaju** 2026., **izdaju od 01.01.2027.**
- **eIzvještavanje** o naplati: **do 20. u mjesecu** za prethodni mjesec.
- **B2C (krajnja potrošnja)** ostaje na „1.0 logici": **ZKI + JIR + QR**, sada obvezno
  **neovisno o načinu plaćanja** (i transakcijski od 2026.). `C` (ček) **ukinut** 01.09.2025.

### Dvije odvojene staze izdavanja (NE miješati)
| | B2C (fiskalizacija 1.0) | B2B/B2G (eRačun 2.0) |
|---|---|---|
| Kanal | **CIS SOAP** `:8449`, XML-DSIG | **AS4 / posrednik**, UBL 2.1 (HR CIUS) |
| ZKI/JIR/QR na dokumentu | **DA** | **NE** |
| Fiskalizacija | u trenutku naplate | izdvajanje podataka (izdavatelj + primatelj) + eIzvještavanje |
| Kripto | RSA-SHA1 + MD5 (ZKI), SHA1 XML-DSIG | XAdES / kval. certifikat, AS4 |

### Tehnika 1.0 (visoka pouzdanost, spec. v2.6)
- **ZKI** = `md5( rsa_sha1( OIB + datVrij + brRac + oznPP + oznNU + iznos ) )` → 32 hex, lowercase.
  Datum u ZKI: `dd.MM.yyyy HH:mm:ss` (**razmak**); u XML: `dd.MM.ggggThh:mm:ss` (**`T`**).
- **XML-DSIG:** enveloped, **Exclusive C14N**, **RSA-SHA1**, **SHA1** digest.
- **Endpointi:** TEST `cistest.apis-it.hr:8449/FiskalizacijaServiceTest`,
  PROD `cis.porezna-uprava.hr:8449/FiskalizacijaService` (⚠️ potvrditi u aktualnom WSDL-u).
- **QR:** `https://porezna.gov.hr/rn?jir=…&datv=GGGGMMDD_HHMM&izn=<centi>`.

### Certifikati
- **Aplikacijski (soft) certifikat na OIB**, **PKCS#12 (.p12/.pfx)**; FINA „fiskal" (prod)
  i **FINA DEMO** (test, besplatan). Od 09/2025 dopušteni i drugi pouzdani izdavatelji s OIB-om (npr. AKD/Certilia).
- Pohrana: **enkriptirano at-rest**, plaintext ključa **samo u sidecaru** (vidi 11).

### Arhitektonska odluka (revidirano nakon web-verifikacije — vidi `11-*`)
- **Cloudflare Worker (Hono + D1)** = API/DB/admin/QR/PDF/e-mail/orkestracija.
- **Kripto NIJE razlog za sidecar:** MD5 **jest** podržan na Workers (WebCrypto + `node:crypto`
  uz `nodejs_compat`), pa su ZKI (RSA-SHA1→MD5) i XML-DSIG **tehnički izvedivi na edge-u**.
- **Uvjetni Node „fiskal-sidecar"** potreban samo ako: (a) CIS traži **per-tenant transportni
  mTLS** (binding je statičan, ne per-request), ILI (b) sigurnosno **ne želimo dešifrirati
  privatni ključ na edge-u** (least-exposure). Oboje su svjesne odluke, ne prisila platforme.
- **eRačun 2.0 (AS4/UBL):** preko **informacijskog posrednika** (faza 1) → vlastita PT kasnije.
- **Async queue + sinkroni ZKI** (offline/naknadna dostava).
- **API dizajn** po Fira modelu: payload = **kupac + stavke + tip**; sve o izdavatelju
  **server-side** vezano na API ključ (tenant).

### Što tek treba potvrditi → vidi [`99-gap-analiza.md`](./99-gap-analiza.md)
CIS endpointi (WSDL), točan KPD/AS4/CIUS format, CF Workers ograničenja, rokovi
naknadne dostave, članci NN 89/2025. **Prioritetne odluke za Matiju** su u §4 gap-analize.

# 04 — Certifikati za fiskalizaciju (FINA i AKD/Certilia)

> Stanje na dan **2026-07-04**. Fiskalizacija 2.0 / eRačun je na snazi (Zakon o
> fiskalizaciji **NN 89/25**, stupio na snagu 01.09.2025., primjena od 01.01.2026.).
> Svaku netrivijalnu tvrdnju potkrepljujemo URL-om u sekciji **Izvori**.
> Nesigurne/proturječne točke označene su s ⚠️.

---

## 1. Što je "certifikat za fiskalizaciju" i čemu služi

Za komunikaciju sa sustavom fiskalizacije Porezne uprave (CIS — Centralni
informacijski sustav) obveznik treba **poslovni aplikacijski (aplikacijski)
digitalni certifikat**, poznat i kao "certifikat za fiskalizaciju" ili
"fiskalizacijski certifikat". To je **soft certifikat** (datoteka, ne kartica),
izdan na **OIB poslovnog subjekta** (ne na osobu vlasnika), i koristi se u ime
tvrtke.

Certifikat obavlja **dvije odvojene kriptografske funkcije**:

1. **Potpis ZKI-ja (Zaštitni kôd izdavatelja).** Privatnim ključem certifikata
   (RSA) potpisuje se konkatenacija obveznih polja računa (OIB, datum/vrijeme,
   broj računa, oznaka poslovnog prostora, naplatnog uređaja, ukupni iznos);
   rezultat se hashira u MD5 → 32-znamenkasti hex ZKI. (Detaljan algoritam ZKI-ja
   vidi u `docs/knowledge/02-*`.)
2. **mTLS / potpis SOAP poruke prema CIS-u.** Isti certifikat služi za
   **međusobnu (dvosmjernu) TLS autentikaciju** klijenta prema CIS servisu **i**
   za **XML-DSIG potpis** SOAP zahtjeva (`RacunZahtjev`, `EchoRequest` itd.).
   CIS svojim vlastitim certifikatom potpisuje odgovor koji sadrži **JIR**
   (Jedinstveni identifikator računa) i vraća ga naplatnom uređaju.

> Napomena: mTLS i XML-DSIG potpis su tehnički **dvije razine** — TLS handshake
> (transport) koristi certifikat/ključ za klijentsku autentikaciju, a unutar
> SOAP envelope se dodatno stavlja XML potpis nad tijelom poruke istim ključem.

---

## 2. FINA produkcijski (aplikacijski) certifikat

### 2.1. Osnovne karakteristike

| Svojstvo | Vrijednost |
|---|---|
| Naziv | Poslovni aplikacijski certifikat za fiskalizaciju |
| Izdavatelj | FINA (Financijska agencija), kao QTSP |
| Vezan na | OIB poslovnog subjekta |
| Trajanje | **5 godina** |
| Format isporuke | **soft certifikat, PKCS#12 (`.p12` / `.pfx`)** |
| Kriptouređaj | nije obavezan |
| Namjena | potpis ZKI + mTLS/potpis poruka prema CIS-u |

Izvor: [FINA — Poslovni certifikati za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju).

### 2.2. Cijene (produkcija) — na dan 2026-07-04

| Stavka | Iznos |
|---|---|
| Izdavanje certifikata (5 god.) | **39,82 EUR** |
| Jednokratna naknada za prvu registraciju u FINA PKI | **10,62 EUR** (naplaćuje se samo prvi put) |
| Oporavak (recovery) certifikata | 2,52 EUR — **samo u prvoj godini** |
| **Ukupno prvi put** | **≈ 49,78 EUR** |

Podaci za uplatu (prema FINA stranici cijena):
- IBAN: `HR4223900011100017042`
- Model: `HR05`
- Poziv na broj: `7544103-OIB` (zamijeniti OIB obveznika)

Dodatni modul **XmlSigner / XML Signer** (FINA-ino programsko rješenje za
integraciju potpisivanja, .NET i Java) naplaćuje se zasebno, mjesečno po licenci,
stepenasto (npr. 1–2 licence ≈ 46,45 EUR/lic., 30+ ≈ 19,91 EUR/lic.). **Nije
obavezan** — potpis možemo raditi vlastitim kodom (WebCrypto/OpenSSL/xml-crypto).

Izvor: [FINA — Cijene digitalnih certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/cijene-digitalnih-certifikata-za-fiskalizaciju).

⚠️ Cijene i modeli plaćanja se mijenjaju — uvijek provjeriti na FINA stranici
prije citiranja klijentu.

### 2.3. Naručivanje (postupak izdavanja, RDC)

**Registar digitalnih certifikata (RDC)** je FINA-in PKI sustav koji upravlja
izdavanjem i vodi evidenciju o certificiranim subjektima. Postupak:

1. **Registracija u PKI.** FINA automatski registrira tvrtku iz službenih
   registara (sudski registar, obrtni registar, OPG, registar udruga/zaklada/
   vjerskih zajednica). Ako subjekt nije upisan, prilaže se Rješenje o osnivanju.
2. **Prikupljanje dokumentacije:**
   - popunjeni **Zahtjev za izdavanje** certifikata,
   - **Ugovor** o pružanju usluga certificiranja,
   - dokaz o uplati naknade,
   - preslika osobne iskaznice (obje strane) ili putovnice **skrbnika
     certifikata**.
3. **Predaja** — digitalno preko **OSPD** platforme (Osobni servis za digitalne
   potpise) ili osobno u FINA poslovnici / LRA uredu.
4. **Preuzimanje** — skrbnik dobiva **aktivacijske podatke odvojeno e-mailom i
   SMS-om**, i njihovom kombinacijom preuzima certifikat kroz portal za
   preuzimanje (produkcija: FINA portal za preuzimanje user-cert).

**Važno:** certifikat može zatražiti **samo obveznik fiskalizacije** (ovlaštena
osoba za zastupanje) — informatička tvrtka/integrator **ne može** zatražiti
produkcijski certifikat umjesto obveznika.

Izvori:
[FINA — Izdavanje certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/izdavanje-certifikata-za-fiskalizaciju),
[Procedura zahtijevanja produkcijskog aplikacijskog certifikata (FINA PDF)](https://www.fina.hr/ngsite/content/download/9423/169030/1).

---

## 3. FINA DEMO (TEST) aplikacijski certifikat — besplatan

Za razvoj i testiranje protiv CIS **test** okruženja koristi se **Demo
aplikacijski certifikat za fiskalizaciju**.

| Svojstvo | Vrijednost |
|---|---|
| Cijena | **besplatno** (ne naplaćuje se izdavanje) |
| Trajanje | **2 godine** ⚠️ (kraće od produkcijskog; provjeriti pri izdavanju) |
| Format | PKCS#12 (`.p12`) |
| Tko može tražiti | i informatičke tvrtke/integratori (za testiranje vlastitog sustava) |
| Funkcionalno | tehnički identičan produkcijskom |

### 3.1. Postupak (demo)

1. Preuzeti i popuniti **"Zahtjev za izdavanje Demo certifikata za
   fiskalizaciju"** + preslika OI/putovnice skrbnika (obje strane).
2. Poslati na **`certifikati-fiskalizacija@fina.hr`** ili predati u FINA
   poslovnici.
3. Nakon obrade skrbnik dobiva aktivacijske podatke odvojeno (e-mail + SMS) i
   preuzima certifikat na demo portalu: **`https://demo-usercert.fina.hr`**.

Izvor: [FINA — Izdavanje Demo aplikacijskog certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/izdavanje-demo-aplikacijskog-certifikata-za-fiskalizaciju),
[FINA — Certifikati za testiranje i demonstraciju](https://www.fina.hr/finadigicert/certifikati-za-testiranje-i-demonstraciju).

> ⚠️ Naziv "fiskalcistest": u internetskim vodičima se demo/test fiskalizacijski
> certifikat i test okruženje često nazivaju "fiskalcistest". Nisam našao FINA
> službenu stranicu koja taj točan naziv koristi kao ime certifikata — vrlo
> vjerojatno se odnosi na naziv **test CIS servisa / OIB test subjekta**, ne na
> zaseban proizvod. Ne oslanjati se na taj naziv bez provjere.

---

## 4. CA lanac povjerenja (chain / truststore)

FINA PKI je hijerarhijski: **Root CA → subordinirani (RDC) CA → aplikacijski
certifikat**. Za validaciju je potreban cijeli lanac.

### 4.1. Produkcija

- **Fina Root CA** (korijenski, self-signed) — vrh povjerenja.
- **Fina RDC 2015 CA** / **Fina RDC 2020 CA** — subordinirani (intermediate) CA
  koji izdaju aplikacijske certifikate i vremenske žigove.
- Aplikacijski certifikat obveznika — list (leaf).

Produkcijski CA certifikati preuzimaju se s FINA stranice CA certifikata
(dostupni u DER/PEM/TXT, s SHA-1 i SHA-256 otiscima). Za truststore/verifikaciju
lanca spajaju se u bundle:

```bash
cat FinaRootCA.pem FinaRDC2015CA.pem > fina-production-bundle.pem
```

Izvor: [FINA — CA certifikati (RDC)](https://www.fina.hr/finadigicert/cjenik-digitalnih-certifikata-i-vremenskih-zigova) i FINA "CA Certificates" stranica.
⚠️ Točan skup subordiniranih CA (2015 vs 2020) ovisi o datumu izdavanja tvog
certifikata — provjeri `Issuer` polje vlastitog certifikata (`openssl x509 -issuer`).

### 4.2. Demo / test

Demo user-certifikate izdaje **Fina Demo CA**, potpisani privatnim ključem Fina
Demo CA (različit od produkcijskih ključeva). Za demo truststore potrebni su:

- **Fina Demo Root CA** (RSA, originalni) ili **Fina Demo Root CA G2** (ECC),
- **Fina Demo CA 2014** i **Fina Demo CA 2020** (subordinirani RSA),
- (za ECC/nove: Fina Demo Q-CA 2024, Ad-CA 2024, TLS CA 2024).

Preuzimanje: **`https://demo-pki.fina.hr/`** — svaki certifikat u DER, PEM i TXT,
s SHA-1/SHA-256 otiscima.

Izvor: [FINA — Fina Demo CA certifikati](https://www.fina.hr/finadigicert/certifikati-za-testiranje-i-demonstraciju/fina-demo-ca-certifikati).

---

## 5. AKD / Certilia — alternativni QTSP

**AKD (Agencija za komercijalnu djelatnost)** kroz uslugu **Certilia** izdaje
poslovne digitalne certifikate koji se mogu koristiti za **potpisivanje
elemenata fiskaliziranog računa** — dakle **alternativa FINA-i** kao
kvalificirani pružatelj usluga povjerenja (QTSP).

| Svojstvo | Certilia (AKD) | FINA |
|---|---|---|
| Cijena izdavanja | **20,00 EUR + PDV** | 39,82 EUR (+ ~10,62 EUR reg. prvi put) |
| Trajanje | 5 godina | 5 godina |
| Format | `.p12` (ostaje pod kontrolom korisnika) | `.p12` |
| Vezan na | OIB poslovnog subjekta | OIB poslovnog subjekta |
| Postupak | zahtjev iz aplikacije/portala, identifikacija kod Certilie | FINA poslovnica / OSPD |

**Razlika u praksi:** funkcionalno je certifikat isti (X.509 na OIB, `.p12`);
AKD/Certilia je jeftiniji i nudi digitalniji onboarding. **Lanac povjerenja je
drugačiji** — Certilia/AKD ima vlastiti CA (AKD CA / Certilia), pa truststore
mora sadržavati AKD-ove root/intermediate certifikate umjesto FINA-inih.

Izvori: [FiskAI — Certilia fiskalizacijski certifikat](https://www.fiskai.hr/certilia-fiskalizacijski-certifikat/),
[AKD](https://www.akd.hr/), [Fiskalopedija — Fiskalni certifikat](https://fiskalopedija.hr/baza-znanja/fiskalni-certifikat).

⚠️ Ključno pravilo Porezne: **od 01.09.2025.** XML poruke zahtjeva prema
fiskalizaciji smiju se potpisivati aplikacijskim certifikatima **bilo kojeg**
hrvatskog QTSP-a (FINA, AKD/Certilia i drugi), **uz obavezan OIB** u certifikatu.
Prije toga (Fiskalizacija 1.0) u praksi je dominirao FINA certifikat.

### 5.1. Empirijski nalazi (2026-07-05, faza 2 — AKD certi ITalk d.o.o., CIS TEST)

Kupnja kroz **https://developer.certilia.com/services/fiscal** (self-service,
DEMO besplatan, produkcijski ~duplo jeftiniji od FINA-e, **besplatna
regeneracija**). Oba certa (demo + prod) **5 godina**, ključ **RSA 3072-bit**
(FINA: RSA 2048). **E2E potvrđeno: CIS TEST prihvaća AKD demo (TESTCERTILIA)
potpis — JIR dobiven** kroz `domovina-fiskal` backend.

Tehničke razlike vs. FINA bitne za implementaciju:
- **OIB je u `organizationIdentifier` (OID 2.5.4.97)** subjecta, format
  **`VATHR-<OIB>`** (FINA ga drži u `O` polju kao `… HR<OIB>`). Parser mora
  pokriti oba oblika.
- **Leaf je ECDSA-potpisan, intermediate (TESTCERTILIA/CERTILIA) ima EC ključ** —
  node-forge PKCS12 put zato ne popuni `bag.cert` za leaf (pada na computeHash)
  i uopće ne zna parsirati EC intermediate; treba fallback
  `certificateFromAsn1(bag.asn1)` bez hasha + preskakanje neparsabilnih
  (implementirano u `backend/src/fiskal/certifikat.ts`).
- P12: standardni `pbeWithSHA1And3-KeyTripleDES` — **ne treba OpenSSL `-legacy`**
  (za razliku od starijih FINA P12).
- Issuer DN: demo `CN=TESTCERTILIA,…,O=AKD d.o.o.,C=HR`, prod `CN=CERTILIA,…`.

---

## 6. Fiskalizacija 2.0 / eRačun — koji certifikat?

Ovo je česta točka zabune, pa razdvajamo tri "kanala":

1. **Fiskalna poruka prema CIS-u (izvještavanje Poreznoj).**
   Koristi se **aplikacijski/fiskalizacijski certifikat** (FINA ili AKD/Certilia,
   uz OIB) — isti *tip* kao za Fiskalizaciju 1.0. Njime se potpisuje kratki
   XML izvadak fiskalne poruke i radi mTLS prema CIS-u.
2. **Potpis samog eRačuna (UBL 2.1 / EN 16931).**
   Prema izvorima, u tijeku slanja eRačuna kroz kanal (AS4) poruka se također
   potpisuje digitalnim certifikatom QTSP-a. Tehnička specifikacija eRačuna to
   uređuje.
3. **Peppol transport (B2G obavezno, B2B dobrovoljno).**
   Za razmjenu preko **Peppol** mreže sudjeluje se preko **Peppol pristupne
   točke (Access Point)**; sam Peppol koristi **Peppol AS4 / Peppol PKI** (Peppol
   Authority izdaje transportne certifikate pristupnim točkama). Za većinu
   obveznika to je **odgovornost informacijskog posrednika / pristupne točke**,
   ne krajnjeg obveznika.

> ⚠️ Proturječje u izvorima: neki vodiči (npr. Fiskalopedija) tvrde da "za
> eRačune certifikat obično nije potreban". To je **djelomično točno** — misli se
> na to da krajnji korisnik ne treba **Peppol transportni** certifikat (to nosi
> posrednik). **Ali** za **fiskalizaciju eRačuna** (izvještavanje CIS-u) i za
> potpis fiskalne poruke aplikacijski certifikat s OIB-om **jest** potreban.
> Zaključak: **isti aplikacijski certifikat** (FINA/AKD) je temelj i za
> Fiskalizaciju 2.0; poseban "Peppol certifikat" treba pristupna točka, ne SME.

### 6.1. Relevantni rokovi (stanje 2026-07-04)

- **01.09.2025.** — Zakon NN 89/25 na snazi; dopušteni QTSP certifikati uz OIB.
- **01.01.2026.** — primjena Fiskalizacije 2.0; obavezno **dostavljanje OIB-a
  primatelja** za B2B transakcije plaćene gotovinom/karticom.
- B2G eRačun preko Peppol-a — obavezan kanal za javne naručitelje.

Izvori: [Porezna — Fiskalizacija (bezgotovinski računi / eRačun)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni),
[Tehnička specifikacija eRačuna — Fiskalizacija 2.0](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/),
[Monri — Fiskalizacija 2.0 i eRačuni 2026](https://monri.hr/fiskalizacija-2-0-i-eracuni-sto-se-mijenja-u-2026/),
[Europska komisija — eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia).

---

## 7. CIS endpointi (test / produkcija)

| Okruženje | Endpoint (SOAP) |
|---|---|
| **TEST / demo** | `https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest` |
| **Produkcija** | `https://cis.porezna-uprava.hr:8449/FiskalizacijaService` |

WSDL se preuzima s Porezna uprava → Fiskalizacija → Tehničke specifikacije
(zasebne verzije za demo i produkciju; aktualna serija tehničke specifikacije
za korisnike v2.x). Servis koristi X.509 certifikate; **odvojeni certifikati za
test i produkciju**.

Izvori: [Porezna — Tehničke specifikacije (v2.6 PDF)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf),
[tgrospic/Cis.Fiscalization (WSDL, referentna implementacija)](https://github.com/tgrospic/Cis.Fiscalization).
⚠️ Portovi/hostovi se povremeno mijenjaju — potvrditi u aktualnoj tehničkoj
specifikaciji prije hardkodiranja.

---

## 8. Tehnički detalji: P12 → PEM, izvlačenje ključa, lozinka

Preuzeti certifikat je **PKCS#12** kontejner (`.p12`/`.pfx`): sadrži **privatni
ključ + leaf certifikat (+ opcionalno CA lanac)**, sve enkriptirano lozinkom koju
je korisnik zadao pri preuzimanju. Za rad izvan .NET/Java (npr. Node/OpenSSL) tipično
se konvertira u PEM.

> ⚠️ **OpenSSL 3.x + `-legacy`:** FINA `.p12` datoteke često koriste stariji
> RC2/3DES enkripcijski algoritam kojeg OpenSSL 3 defaultno odbija. Zato je
> potreban flag **`-legacy`**.

### 8.1. Sve u jednu PEM datoteku (ključ + cert, nešifrirano)

```bash
# -nodes = privatni ključ bez enkripcije (SAMO za test / u sigurnom okruženju)
openssl pkcs12 -legacy -in fiskal.p12 -nodes -out combined.pem
# tražit će "Enter Import Password:" -> lozinka P12 kontejnera
```

### 8.2. Odvojeno izvlačenje (preporuka za produkciju)

```bash
# 1) Samo klijentski (leaf) certifikat
openssl pkcs12 -legacy -in fiskal.p12 -clcerts -nokeys -out client.crt

# 2) Samo privatni ključ — ZAŠTIĆEN novom lozinkom (bez -nodes!)
openssl pkcs12 -legacy -in fiskal.p12 -nocerts -out client.key
#   -> Import Password (P12) + zatim PEM pass phrase (nova lozinka ključa)

# 3) CA lanac iz kontejnera (ako ga sadrži)
openssl pkcs12 -legacy -in fiskal.p12 -cacerts -nokeys -out ca-chain.crt
```

### 8.3. Inspekcija / provjera

```bash
# Pregled sadržaja P12 (subject, issuer, valjanost)
openssl pkcs12 -legacy -in fiskal.p12 -info -nodes | openssl x509 -noout -subject -issuer -dates

# Issuer (da znaš koji CA bundle trebaš)
openssl x509 -in client.crt -noout -issuer

# OIB je u Subjectu (serialNumber / CN) — provjeri da odgovara obvezniku
openssl x509 -in client.crt -noout -subject
```

### 8.4. Skidanje lozinke s ključa (ako baš treba)

```bash
openssl rsa -in client.key -out client-nopass.key
```

⚠️ `client-nopass.key` je **plaintext privatni ključ** — nikad ga ne commitati,
ne logirati, i ne pisati na disk u produkciji (vidi §9).

---

## 9. Sigurna pohrana u multi-tenant SaaS-u

U našem servisu certifikat = identitet tenanta (SME). Ključni zahtjevi:

1. **Nikad plaintext na disku ni u repou.** Repo je javan → tajne isključivo
   preko `wrangler secret put` / `.dev.vars` lokalno (vidi
   `docs/reference/lokalni-artefakti.md`). Sam certifikat NE ide u secrets store
   kao globalna varijabla jer je **per-tenant**.
2. **Enkripcija at-rest, per-tenant.** P12/PEM se pohranjuje **enkriptiran**
   (envelope encryption): podatkovni ključ (DEK) po tenantu, DEK omotan glavnim
   ključem (KEK) iz KMS/HSM-a. Na Cloudflare stacku (Worker + D1) glavni ključ
   živi kao Worker Secret / vanjski KMS, a šifrirani blob (ključ + cert) u D1 ili
   R2. WebCrypto `AES-GCM` za omatanje.
3. **Per-tenant izolacija.** DEK-ovi i lozinke strogo odvojeni po `tenant_id`;
   nikad zajednički ključ za više tenanta; row-level pristup u D1 vezan na tenant.
4. **HSM/KMS za potpisivanje (idealno).** Najbolje da privatni ključ **nikad ne
   napusti** KMS/HSM — potpis se radi unutar servisa koji drži ključ. U praksi,
   budući da CIS traži RSA potpis + mTLS klijentski ključ, ključ mora biti
   dostupan runtime-u u trenutku potpisa → dekriptirati **u memoriji**, koristiti,
   odbaciti; nikad ga ne perzistirati dekriptiranog.
5. **Lozinka P12** tretira se kao zasebna tajna (odvojeno od bloba), također
   enkriptirana per-tenant.
6. **Rotacija i istek.** Pratiti `notAfter` (5 god. FINA/AKD, 2 god. demo) i
   proaktivno upozoriti tenanta prije isteka — istekli certifikat = prekid
   fiskalizacije.

> ⚠️ Arhitektonsko otvoreno pitanje (vidi `docs/knowledge/11-arhitektura-runtime.md`):
> Cloudflare Workers (WebCrypto) nemaju izravan **mTLS klijentski** stack ni Node
> `crypto`/`xml-crypto`. mTLS prema CIS-u i XML-DSIG potpis vjerojatno traže mali
> **Node "signing sidecar"** koji drži ključ i radi TLS+potpis, dok Worker
> orkestrira. Odluku dokumentirati ondje.

---

## 10. Sažetak (cheat-sheet)

- Trebaš **aplikacijski certifikat na OIB** (`.p12`), 5 god. — FINA (~49,78 €
  prvi put) ili **AKD/Certilia (20 € + PDV, jeftinije)**.
- **Demo/test** certifikat je **besplatan**, ~2 god., traži se na
  `certifikati-fiskalizacija@fina.hr`, preuzima na `demo-usercert.fina.hr`.
- Funkcije: **potpis ZKI** + **mTLS/XML-DSIG** prema CIS-u.
- Za validaciju treba **CA lanac**: FINA Root CA + RDC 2015/2020 (prod) ili Fina
  Demo Root CA + Demo CA 2014/2020 (test); AKD ima vlastiti lanac.
- **Fiskalizacija 2.0**: isti *tip* aplikacijskog certifikata (bilo koji HR QTSP,
  uz OIB) za fiskalnu poruku; **Peppol transportni certifikat** je stvar
  pristupne točke, ne SME-a.
- Konverzija: `openssl pkcs12 -legacy ...` (obavezan `-legacy` za FINA P12).
- Pohrana: envelope encryption per-tenant, KMS/HSM za KEK, ključ dekriptiraj samo
  u memoriji.

---

## Izvori

- [FINA — Poslovni certifikati za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju) — svrha, vrste, trajanje 5 god., format soft/P12, demo (pristup 2026-07-04)
- [FINA — Cijene digitalnih certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/cijene-digitalnih-certifikata-za-fiskalizaciju) — 39,82 € izdavanje, 10,62 € registracija, 49,78 € ukupno, IBAN/model/PnB (pristup 2026-07-04)
- [FINA — Izdavanje certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/izdavanje-certifikata-za-fiskalizaciju) — postupak, dokumenti, RDC/OSPD, tko može tražiti (pristup 2026-07-04)
- [FINA — Procedura zahtijevanja produkcijskog aplikacijskog certifikata (PDF)](https://www.fina.hr/ngsite/content/download/9423/169030/1) — koraci zahtjeva (pristup 2026-07-04)
- [FINA — Izdavanje Demo aplikacijskog certifikata za fiskalizaciju](https://www.fina.hr/poslovni-digitalni-certifikati/poslovni-certifikati-za-fiskalizaciju/izdavanje-demo-aplikacijskog-certifikata-za-fiskalizaciju) — besplatno, email certifikati-fiskalizacija@fina.hr, demo-usercert.fina.hr (pristup 2026-07-04)
- [FINA — Certifikati za testiranje i demonstraciju](https://www.fina.hr/finadigicert/certifikati-za-testiranje-i-demonstraciju) — demo certifikati, 2 god. (pristup 2026-07-04)
- [FINA — Fina Demo CA certifikati](https://www.fina.hr/finadigicert/certifikati-za-testiranje-i-demonstraciju/fina-demo-ca-certifikati) — Demo Root CA, CA 2014/2020, G2/2024, DER/PEM/TXT, demo-pki.fina.hr (pristup 2026-07-04)
- [FINA — Cjenik digitalnih certifikata i vremenskih žigova](https://www.fina.hr/finadigicert/cjenik-digitalnih-certifikata-i-vremenskih-zigova) — CA / RDC kontekst (pristup 2026-07-04)
- [FiskAI — Certilia fiskalizacijski certifikat](https://www.fiskai.hr/certilia-fiskalizacijski-certifikat/) — AKD/Certilia 20 €+PDV, 5 god., .p12, na OIB (pristup 2026-07-04)
- [AKD — Agencija za komercijalnu djelatnost](https://www.akd.hr/) — izdavatelj (QTSP) (pristup 2026-07-04)
- [Fiskalopedija — Fiskalni certifikat](https://fiskalopedija.hr/baza-znanja/fiskalni-certifikat) — FINA vs Certilia cijene, P12, 5 god., napomena o eRačunu (pristup 2026-07-04)
- [Porezna uprava — Fiskalizacija (bezgotovinski računi / eRačun)](https://porezna.gov.hr/fiskalizacija/bezgotovinski-racuni) — Fiskalizacija 2.0, zakon, rokovi (pristup 2026-07-04)
- [Tehnička specifikacija eRačuna — Fiskalizacija 2.0](https://fiskalizacija2.hr/rjecnik-fiskalizacije-2-0/tehnicka-specifikacija-eracuna/) — UBL 2.1, potpis eRačuna (pristup 2026-07-04)
- [Monri — Fiskalizacija 2.0 i eRačuni: što se mijenja 2026.](https://monri.hr/fiskalizacija-2-0-i-eracuni-sto-se-mijenja-u-2026/) — rokovi, Peppol B2G/B2B (pristup 2026-07-04)
- [Europska komisija — eInvoicing in Croatia](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108879/eInvoicing+in+Croatia) — EN 16931, Servis eRačun za državu (FINA), Peppol (pristup 2026-07-04)
- [Porezna — Tehnička specifikacija za korisnike v2.6 (PDF)](https://porezna-uprava.gov.hr/UserDocsImages/Fiskalizacija/Tehni%C4%8Dke%20specifikacije/Fiskalizacija%20-%20Tehnicka%20specifikacija%20za%20korisnike_v2.6.pdf) — SOAP/WSDL, certifikati (pristup 2026-07-04)
- [GitHub — tgrospic/Cis.Fiscalization](https://github.com/tgrospic/Cis.Fiscalization) — CIS endpointi, WSDL, referentna .NET implementacija (pristup 2026-07-04)
- [GitHub — KevinBdev/fiskal-hr-kb (integration.md)](https://github.com/KevinBdev/fiskal-hr-kb/blob/main/doc/integration.md) — CA chain, mTLS, openssl pkcs12 -legacy, P12→PEM (pristup 2026-07-04)
- [Zakon o fiskalizaciji NN 89/25](https://narodne-novine.nn.hr/) — pravni okvir Fiskalizacije 2.0 (na snazi 01.09.2025.) ⚠️ točan link/broj potvrditi (pristup 2026-07-04)

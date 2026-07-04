# Arhitektura i runtime odluke

> Domenski dokument za `domovina-fiskal`. Stanje **2026-07-04**.
> Cilj: odlučiti **gdje živi koja komponenta** (Cloudflare edge vs. self-hosted sidecar)
> s obzirom na tehnička ograničenja potpisivanja (ZKI/XML-DSIG), mTLS prema CIS-u,
> generiranja PDF-a i AS4 razmjene za eRačun 2.0.
> Napisano ručno (istraživački agent za ovu temu nije dovršio zbog session-limita);
> tvrdnje o WebCrypto/Workers označene su pouzdanošću, a nesigurne s ⚠️ za potvrdu.

---

## 0. TL;DR — preporučena arhitektura

**Hibrid: Cloudflare Worker (edge) + self-hosted "fiskal-sidecar" (Node).**
Isti mentalni model kao `pipeline.domovina.ai` (cloud queue + lokalni bridge), ali
sidecar ovdje radi **kriptografiju i transport prema CIS-u/PT-u**, ne obradu videa.

- **Worker (Hono + D1):** javni JSON API, multi-tenant auth (API ključ), validacija
  (zod), podatkovni model, numeriranje računa, admin UI, orkestracija/queue, QR, e-mail.
- **fiskal-sidecar (Node):** sve što dira **privatni ključ** i **egzotičan transport**:
  izračun ZKI (RSA-SHA1 + MD5), XML-DSIG (Exclusive C14N), **mTLS SOAP** poziv CIS-u,
  (opcionalno) PDF, te za 2.0 **AS4/UBL** ili poziv posredniku.
- **Privatni ključevi tenanata NIKAD se ne dešifriraju na edge-u** — žive (enkriptirani)
  u bazi, a plaintext samo u memoriji sidecara u trenutku potpisa.

Zašto ne sve na Workers: tri stvarna blokera (§1–§3) — **MD5 ne postoji u WebCrypto**,
**multi-tenant dinamički mTLS klijentski certifikat nije izvediv na Workers fetch**, i
**AS4/ebMS3 (2.0) je predugačak/prekompleksan za Workers model**.

---

## 1. Kripto na Cloudflare Workers — što ide, što ne

Cloudflare Workers nude **WebCrypto** (`crypto.subtle`) + `nodejs_compat` flag za dio
Node `node:crypto` API-ja.

| Operacija (za fiskalizaciju 1.0) | Na Workers? | Bilješka |
|---|---|---|
| RSA potpis `RSASSA-PKCS1-v1_5` + **SHA-1** | ✅ (pouzdano) | WebCrypto `sign()` podržava SHA-1; točno što treba ZKI i XML-DSIG SignatureMethod `rsa-sha1` |
| SHA-1 digest (`DigestMethod`) | ✅ | `crypto.subtle.digest('SHA-1', …)` |
| **MD5** (završni korak ZKI-ja) | ❌ **NEMA** | WebCrypto ne nudi MD5; treba **čisti-JS MD5** (mala lib) ili `node:crypto` createHash('md5') uz `nodejs_compat` ⚠️ potvrditi da je md5 dostupan u CF `nodejs_compat` buildu |
| Uvoz **PKCS#12 (.p12/.pfx)** ključa | ❌ izravno | WebCrypto uvozi **PKCS#8/SPKI**, ne PKCS#12. Certifikat treba **prethodno raspakirati** (P12 → PEM privatni ključ + cert) prije uvoza |
| **Exclusive C14N** (xml-exc-c14n#) | ⚠️ nema native | Nema ugrađene kanonikalizacije; `xml-crypto`/`xmldom` mogu raditi uz `nodejs_compat`, ali C14N je najtrikastiji dio i traži pažljivo testiranje |
| **mTLS klijentski cert na `fetch()`** | ⚠️/❌ za multi-tenant | Vidi §2 |

**Zaključak za ZKI:** ZKI je *tehnički* izvediv na Workers (RSA-SHA1 preko WebCrypto +
JS-MD5), **ako** je privatni ključ već u PEM/PKCS8 obliku u memoriji. Ali to znači
**dešifrirati tuđi privatni ključ na edge-u** — što želimo izbjeći (§4). Zato ZKI
ipak radimo u sidecaru, zajedno s ostalim potpisom.

> Napomena: `xml-crypto` (koji koristi stari `fiksal-hr-nodejs`) je Node-orijentiran.
> Realno je jednostavnije i sigurnije držati XML-DSIG u Node sidecaru nego ga tjerati
> kroz `nodejs_compat` na Workers.

---

## 2. mTLS prema CIS-u — glavni razlog za sidecar

CIS SOAP endpoint (`cis.porezna-uprava.hr:8449`) je HTTPS. Otvoreno je (vidi `02-*` §7.3)
je li **klijentski** certifikat na transportu **obavezan** ili je dovoljan XML-DSIG
potpis u poruci (spec. spominje 1-way TLS). Neovisno o tome:

- **Cloudflare ima "mTLS certificates"** — Worker može predstaviti klijentski cert na
  odlaznom `fetch()` preko `mtls_certificate` bindinga. **ALI** taj cert se **statički
  uploada na Cloudflare račun** i veže na Worker konfiguraciju.
- Za **multi-tenant SaaS gdje svaki tenant ima svoj FINA certifikat**, ne možemo
  dinamički predstaviti proizvoljan (per-tenant) klijentski cert po zahtjevu. Binding
  nije per-request odabir iz baze. → **mTLS transport je fundamentalno nekompatibilan s
  našim multi-tenant modelom na Workers fetch.** ⚠️ (potvrditi ima li CF novijih
  per-request mTLS opcija — na 2026-07-04 pretpostavka je NE.)

Node sidecar to rješava trivijalno: `https.request({ key, cert, ca })` s per-tenant
ključem učitanim iz baze u memoriju. Isto vrijedi za **AS4** (2.0), koji je još
zahtjevniji (WS-Security, potpisani MIME/SOAP-with-attachments, reliable messaging).

---

## 3. eRačun 2.0 (AS4/UBL) — sidecar ili posrednik

Iz `03-*`: razmjena eRačuna ide **AS4 profilom** (ebMS3, kao Peppol eDelivery), s
UBL 2.1 (HR CIUS) i XAdES potpisom. To je **dugotrajan, stateful, kompleksan** protokol —
**nije Workers-friendly**. Dvije realne opcije (nisu isključive):

1. **Preko informacijskog posrednika** (FINA, Moj-eRačun, …) — pozovemo njihov REST/API
   iz sidecara (ili čak iz Workera ako je običan HTTPS+token). **Najbrži put do MVP-a**,
   bez vlastite certifikacije Pristupne točke. Preporuka za fazu 1.
2. **Vlastita Pristupna točka** — sidecar (ili zaseban servis, npr. Java/Node AS4 lib
   poput `phase4`/Domibus) radi AS4 + MPS/AMS + fiskalizacijsku poruku + **Završno
   testiranje na PTS-u**. Veći opseg, kasnija faza.

> Za oba slučaja: UBL generiranje (XML) može na Workers (samo string/template), ali
> **potpis i AS4 transport** idu u sidecar/posrednika.

---

## 4. Pohrana certifikata i privatnih ključeva (multi-tenant)

Načelo: **least exposure**. (Vidi i `04-*` i `05-*`.)

- Privatni ključ tenanta pohranjen **enkriptiran at-rest** u tablici `certifikat`
  (`05-*` §2.2). Enkripcija: AES-GCM s **master ključem** koji je Worker/sidecar secret
  (`wrangler secret put` / env), idealno preko KMS/Secret Store, ne u kodu.
- **Plaintext ključ nikad ne napušta sidecar** i postoji samo u memoriji tijekom potpisa.
- Lozinka P12 i izvučeni PEM tretiraju se kao tajne; log nikad ne smije sadržavati ključ.
- Razmisliti o **enkripciji po tenantu** (envelope encryption): master ključ → per-tenant
  data key → ključ certifikata. Olakšava rotaciju i opoziv.

⚠️ Ako se ikad odluči raditi ZKI na edge-u (radi latencije), tada Worker mora dešifrirati
ključ — prihvatljivo samo uz jasnu sigurnosnu procjenu. Default: **ne**.

---

## 5. PDF i e-mail

- **PDF na Workers:** `pdf-lib` (čisti JS) radi na Workers za jednostavan layout →
  dovoljno za račun. Za HTML→PDF vjernost postoji **Cloudflare Browser Rendering
  (Puppeteer)** — moćno ali teže/plaćeno. Alternativa: **Gotenberg** kao sidecar.
  Preporuka MVP: `pdf-lib` na Workers ili render u sidecaru uz PDF layout. Vidi `09-*`.
- **E-mail:** Cloudflare Email Sending / vanjski provider (Resend/SMTP) — vidi skill
  `cloudflare-email-service`. Deliverability (SPF/DKIM/DMARC) obavezno za račune.
- QR kod (`09-*`, `02-*` §10): generiranje QR-a je čisti JS → **na Workers** bez problema.

---

## 6. Predložena arhitektura (ASCII)

```
                         ┌───────────────────── CLOUD (Cloudflare) ─────────────────────┐
   klijent (webshop,     │  domovina-fiskal Worker (Hono)                                │
   Google Forms,   POST  │   • POST /api/v1/racun     Bearer <apiKey> → tenant           │
   app, cron)  ────────► │   • validacija (zod), numeriranje (tablica `sekvenca`)        │
                         │   • upiši `racun` (status=nacrt→izdano), `stavka`,`pdv_...`   │
                         │   • QR, PDF (pdf-lib), e-mail                                  │
                         │   • /admin  (Basic Auth) server-rendered HTML                 │
                         │   • D1: tenant, api_kljuc, certifikat(enc), poslovni_prostor, │
                         │         naplatni_uredaj, operater, kupac, racun, stavka,      │
                         │         pdv_raspodjela, naplata, poruka_log, sekvenca         │
                         │                                                               │
                         │   enqueue fiskalizacija-job  ─────────────┐                   │
                         └───────────────────────────────────────────┼───────────────────┘
                                     ▲  JIR/ZKI natrag (PATCH)         │ claim (Bearer)
                                     │                                 ▼
                         ┌───────────┴───────── SELF-HOSTED fiskal-sidecar (Node) ───────┐
                         │  • claim job → učitaj enc. certifikat, dešifriraj u memoriji  │
                         │  • ZKI = md5(rsa_sha1(konkat polja))      [node:crypto]       │
                         │  • sastavi RacunZahtjev + XML-DSIG (exc-C14N) [xml-crypto]    │
                         │  • mTLS SOAP POST → CIS :8449  (test/prod)                    │
                         │  • parsiraj JIR / Greske; retry+NakDost ako CIS pao           │
                         │  • [2.0] UBL 2.1 (HR CIUS) → AS4 / poziv posredniku           │
                         │  • PATCH natrag: {jir, status, greske}                        │
                         └───────────────────────────────────────────────────────────────┘
                                     │ mTLS + XML-DSIG
                                     ▼
                    ┌────────────────────────────────────────────┐
                    │  CIS Porezna uprava  (B2C: SOAP :8449)      │
                    │  Pristupna točka / posrednik (2.0: AS4)     │
                    └────────────────────────────────────────────┘
```

Gdje hostati sidecar: Mac Mini (kao pipeline bridge) ili mali VPS. Worker↔sidecar veza:
**Cloudflare Tunnel** (sidecar iza NAT-a) ili sidecar na javnom HTTPS-u s Bearer auth.

---

## 7. Sinkrono vs. asinkrono — semantika fiskalizacije

Fiskalizacija **mora** podnijeti nedostupnost CIS-a (offline → izdaj sa ZKI, JIR
naknadno; `02-*` §8). Zato je **async queue prirodan model**, ne bug:

1. `POST /api/v1/racun` → Worker izračuna/naruči **ZKI** (potreban odmah za ispis) i
   vrati **201 + {broj, zki, status:"izdano"}**. Račun je pravno izdan (ZKI dovoljan).
2. Fiskalizacija (JIR) ide **async** preko sidecara. Kad JIR stigne → `status:"fiskalizirano"`,
   webhook/poll klijentu.
3. Ako CIS padne → job ostaje u redu, retry s **novim `IdPoruke`**, `NakDost=true`.

**Dilema ZKI-latencije:** ZKI treba privatni ključ *odmah* u koraku 1. Opcije:
- (A) **Sinkroni ZKI poziv sidecaru** (brz, bez CIS-a) u koraku 1; JIR async. ✅ preporuka
  (ključ ostaje u sidecaru; latencija samo lokalni HTTP).
- (B) ZKI na edge-u (Worker dešifrira ključ) — najbrže, ali ključ na edge-u (§4). ❌ default.
- (C) Potpuno async (i ZKI) — API vraća `status:"u obradi"`, ZKI kasni. Lošiji UX/ispis.

> Odabir A: sidecar izloži interni `POST /zki` (sinkrono) + `POST /fiskaliziraj` (queue).
> Worker u koraku 1 zove `/zki`, u koraku 2 enqueue fiskalizaciju. Alternativa: jedan
> sidecar poziv koji vrati ZKI odmah i pokuša CIS u istom pozivu (ZKI uvijek, JIR ako stigne).

---

## 8. Runtime izbori — sažetak odluka

| Pitanje | Odluka (default) | Alternativa | Status |
|---|---|---|---|
| Gdje potpis (ZKI/XML-DSIG) | **sidecar (Node)** | edge WebCrypto+JS-MD5 | odlučeno |
| mTLS prema CIS | **sidecar** | CF mTLS binding (ne per-tenant) | ⚠️ potvrditi CF |
| AS4/eRačun 2.0 | **posrednik (faza 1)** → vlastita PT (kasnije) | AS4 lib u sidecaru | odluka po fazi |
| Baza | **D1 (SQLite)** za MVP | Postgres+Hyperdrive ako preraste | odlučeno |
| Enkripcija certifikata | **AES-GCM, master ključ (secret/KMS)** | envelope per-tenant | odlučeno |
| PDF | **pdf-lib na Workers** | Browser Rendering / Gotenberg sidecar | odlučeno |
| QR / e-mail | **Worker** | vanjski email provider | odlučeno |
| Model izvršenja | **async queue + sinkroni ZKI** | potpuno sinkrono | odlučeno |
| Sidecar hosting | **Mac Mini / VPS + Cloudflare Tunnel** | javni HTTPS + Bearer | za potvrdu |

---

## 9. Otvorena pitanja (za `99-gap-analiza.md`)

- ⚠️ Je li mTLS klijentski cert na CIS transportu **obavezan** (ili je dovoljan potpis
  poruke)? Ako nije obavezan, dio B2C-a mogao bi ići i s Workera (samo XML-DSIG) — ali
  MD5/C14N i dalje guraju prema sidecaru. Testirati s DEMO certifikatom.
- ⚠️ Je li `node:crypto` `createHash('md5')` dostupan u CF `nodejs_compat` (ako bismo ipak
  htjeli edge ZKI)? 
- ⚠️ Podržava li Cloudflare per-request/dinamički klijentski certifikat na `fetch()` (2026)?
- Odluka: **faza 1 = samo B2C fiskalizacija 1.0** (CIS SOAP) ili odmah i eRačun preko posrednika?
- Odluka: hosting sidecara (Mac Mini kao pipeline, ili VPS radi 24/7 dostupnosti za async retry).

## Izvori / osnova

- Interni: `docs/knowledge/02-fiskalizacija-1.0-tehnicki.md` (WebCrypto/MD5/mTLS napomene,
  RSA-SHA1/exc-C14N), `03-fiskalizacija-2.0-eracun.md` (AS4/UBL/posrednici),
  `04-certifikati-fina-akd.md` (P12→PEM, CA lanac), `05-podatkovni-model-multitenant.md`
  (tablice, enkripcija), `09-pdf-racun-i-qr-kod.md` (PDF/QR/email na Workers),
  `docs/reference/lokalni-artefakti.md` (pipeline bridge model, `xml-crypto`).
- ⚠️ Tvrdnje o Cloudflare Workers WebCrypto (nema MD5, PKCS8 uvoz), `mtls_certificate`
  bindingu i Browser Rendering-u temeljene su na poznavanju CF platforme do zn. cutoffa;
  **prije implementacije verificirati na developers.cloudflare.com** (WebCrypto supported
  algorithms, mTLS, Browser Rendering, nodejs_compat) — istraživački agent za ovu temu
  nije dovršio web-provjeru zbog session-limita.

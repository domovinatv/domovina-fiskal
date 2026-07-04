# Arhitektura i runtime odluke

> Domenski dokument za `domovina-fiskal`. Stanje **2026-07-04**.
> Cilj: odlučiti **gdje živi koja komponenta** (Cloudflare edge vs. self-hosted sidecar)
> s obzirom na tehnička ograničenja potpisivanja (ZKI/XML-DSIG), mTLS prema CIS-u,
> generiranja PDF-a i AS4 razmjene za eRačun 2.0.
>
> **Revizija 2026-07-04 (web-verifikacija):** izvorna verzija dokumenta pretpostavljala je
> tri "blokera" za Workers-only pristup. Web-provjera na `developers.cloudflare.com`
> (vidi [Izvori](#izvori)) **oborila je prvi i najvažniji bloker**: **MD5 JEST podržan na
> Cloudflare Workers** (i u WebCrypto i u `node:crypto`), a **cijeli `node:crypto` API je
> dostupan** uz `nodejs_compat` (od travnja 2025.). Time se preporuka mijenja — vidi §0.
>
> **Legenda pouzdanosti:** svaka tvrdnja o Cloudflare platformi označena je s
> **✅ POTVRĐENO** (uz URL izvora) ili **⚠️ DVOJBENO** (traži test / izvor nejasan).
> Tvrdnje o hrvatskoj fiskalizaciji preuzete su iz `02-*`/`03-*`/`05-*` (interni izvori).

---

## 0. TL;DR — preporučena arhitektura (REVIDIRANO)

**Promjena u odnosu na prvu verziju:** kriptografija **više nije razlog** za sidecar.
Nakon web-verifikacije, jedini _potencijalni_ tehnički razlog za Node sidecar kod
**Fiskalizacije 1.0 (B2C)** je **transportni (klijentski) mTLS certifikat po tenantu** —
i to **samo ako CIS taj certifikat na transportu stvarno zahtijeva** (spec. spominje
1-way TLS; vidi `02-*` §7.3, ostaje za test s DEMO certom).

Preporuka je sada **dvoslojna, po fazama**:

- **Faza 1 (MVP) — pokušati Workers-only za B2C 1.0.**
  ZKI (`RSASSA-PKCS1-v1_5`+SHA-1 → MD5), XML-DSIG (exc-C14N, RSA-SHA1) i SOAP POST na CIS
  **tehnički su izvedivi na Workers** uz `nodejs_compat` (node:crypto pun API + `xml-crypto`),
  **osim** transportnog mTLS-a ako se pokaže obaveznim. Ako transportni klijentski cert
  **nije** obavezan → **cijeli B2C na Workers, bez sidecara**.
- **Uvjetni sidecar (fallback) — samo ako CIS traži per-tenant klijentski cert na TLS-u.**
  Cloudflare `mtls_certificate` binding je **statičan (per-Worker, upload na račun)**, ne
  bira se per-request iz baze → nekompatibilan s "N tenanata, N FINA certova" bez sidecara
  (detalji §2). Tada mali Node sidecar radi **samo mTLS SOAP poziv**; ostalo ostaje na edge-u.
- **eRačun 2.0 (AS4/UBL) — preko informacijskog posrednika** (REST/HTTPS iz Workera) za
  fazu 1; **vlastita Pristupna točka** (AS4, Java `phase4`/Domibus) tek kasnije, kao
  **zaseban servis** (nije Workers-friendly; §3).

**Ključni sigurnosni izbor koji ostaje neovisno o tehnici (§4):** želimo li **dešifrirati
privatni ključ tenanta na edge-u**? Ako NE (least-exposure), sidecar ostaje poželjan
**iz sigurnosnih razloga**, ne zbog tehničke nemogućnosti. To je sada svjesna odluka, a ne
prisila platforme — bitna promjena u odnosu na prvu verziju.

> **Sažetak promjene tri "blokera":**
> 1. ~~MD5 ne postoji u WebCrypto~~ → **NETOČNO**, MD5 je podržan (✅ POTVRĐENO, §1).
> 2. Multi-tenant dinamički mTLS na Workers fetch → **i dalje ograničenje** (✅ POTVRĐENO da
>    je binding statičan), **ali uvjetno** (možda transportni cert nije ni obavezan; §2).
> 3. AS4/ebMS3 (2.0) predugačak za Workers model → **potvrđeno**, no rješava se posrednikom (§3).

---

## 1. Kripto na Cloudflare Workers — što ide, što ne (REVIDIRANO)

Cloudflare Workers nude **WebCrypto** (`crypto.subtle`) **i** — uz `nodejs_compat` flag —
**pun `node:crypto` API** (od travnja 2025.; ranije je bio djelomičan).

| Operacija (za fiskalizaciju 1.0) | Na Workers? | Status | Bilješka |
|---|---|---|---|
| RSA potpis `RSASSA-PKCS1-v1_5` + **SHA-1** | ✅ DA | **✅ POTVRĐENO** | WebCrypto tablica algoritama: `RSASSA-PKCS1-v1_5` ima `sign()/verify()/importKey()/exportKey()/generateKey()`; SHA-1 je podržan digest. Točno za ZKI i XML-DSIG `rsa-sha1`. |
| SHA-1 digest (`DigestMethod`) | ✅ DA | **✅ POTVRĐENO** | Podržani digesti: **SHA-1, SHA-256, SHA-384, SHA-512, MD5**. |
| **MD5** (završni korak ZKI-ja) | ✅ **DA** | **✅ POTVRĐENO** | **Ispravak prve verzije.** CF WebCrypto **podržava MD5** izvan standarda: *"MD5 is not part of the WebCrypto standard but is supported in Cloudflare Workers for interacting with legacy systems that require MD5."* Radi i `crypto.subtle.digest('MD5', …)` i `node:crypto` `createHash('md5')`. **Nije potreban JS-MD5 shim.** |
| `node:crypto` `createSign('RSA-SHA1')` + `createHash('md5')` | ✅ DA | **✅ POTVRĐENO** | Pun `node:crypto` uz `nodejs_compat`; iznimke su samo `generateKeyPair` DSA/DH, `ed448`/`x448`, ručni FIPS. ZKI Node-kod iz `02-*` §2.4 **radi na Workers**. |
| Uvoz **PKCS#8 / SPKI / raw / JWK** ključa | ✅ DA | **✅ POTVRĐENO** | Standardni WebCrypto `importKey` formati; `RSASSA-PKCS1-v1_5` podržava `importKey`. |
| Uvoz **PKCS#12 (.p12/.pfx)** izravno | ❌ NE | **✅ POTVRĐENO** | PKCS#12 **se ne spominje** kao WebCrypto format uvoza. Certifikat treba **prethodno raspakirati** (P12 → PEM/PKCS8 privatni ključ + cert). Napomena: preko `node:crypto` moguće je P12 parsiranje u JS-u, ali čišće je raspakirati unaprijed pri unosu certifikata. |
| **Exclusive C14N** (xml-exc-c14n#) | ⚠️ nema native | **⚠️ DVOJBENO** | Nema _ugrađene_ kanonikalizacije u platformi; `xml-crypto`/`xmldom` **mogu** raditi uz `nodejs_compat`, ali C14N je najtrikastiji dio i traži pažljivo testiranje na Workers runtimeu (potvrditi da paket radi bez Node-only ovisnosti). |
| **mTLS klijentski cert na `fetch()`** (per-tenant) | ⚠️/❌ | **✅ POTVRĐENO (ograničenje)** | Binding je statičan; vidi §2. |

**Zaključak za ZKI (revidiran):** ZKI je **potpuno izvediv na Workers** —
`RSASSA-PKCS1-v1_5`+SHA-1 potpis (WebCrypto ili `node:crypto`) → MD5 (ugrađen). Jedini
uvjet je da je privatni ključ u PEM/PKCS8 obliku u memoriji. To znači da **tehnički**
možemo raditi ZKI na edge-u; **je li to sigurnosno prihvatljivo** (dešifriranje ključa na
edge-u) zaseban je izbor — vidi §4.

> Napomena: `xml-crypto` (koji koristi stari `fiksal-hr-nodejs`, vidi `lokalni-artefakti.md` §2)
> je Node-orijentiran, ali uz pun `node:crypto` na Workers realno je **kandidat i za edge**.
> Ostaje verificirati exc-C14N ponašanje u Workers runtimeu (⚠️ DVOJBENO — testirati).

---

## 2. mTLS prema CIS-u — jedini _potencijalni_ razlog za sidecar (B2C)

CIS SOAP endpoint (`cis.porezna-uprava.hr:8449` / test `cistest.apis-it.hr:8449`) je HTTPS.
Otvoreno je (vidi `02-*` §7.3) je li **klijentski** certifikat na transportu **obavezan** ili
je dovoljan XML-DSIG potpis u poruci (spec. spominje 1-way TLS). Dvije razine:

- **✅ POTVRĐENO — Cloudflare `mtls_certificate` binding je statičan (per-Worker).**
  Certifikat se uploada na račun (`wrangler mtls-certificate upload`) i veže u konfiguraciji:
  ```jsonc
  "mtls_certificates": [
    { "binding": "MOJ_CERT", "certificate_id": "<CERTIFICATE_ID>" }
  ]
  ```
  Binding daje `env.MOJ_CERT.fetch()` koji **uvijek** predstavlja _taj_ cert. **Nema
  runtime odabira certifikata iz baze po zahtjevu.** Limit je **1000 certifikata po računu**,
  može se vezati više bindova, ali svaki je fiksiran na jedan `certificate_id` u konfiguraciji.
- **Posljedica za multi-tenant (N tenanata × FINA cert):** ne možemo per-request iz D1
  izabrati proizvoljan tenantov klijentski cert. Zaobilaznice su loše: (a) unaprijed
  upload-ati ≤1000 tenantskih certova i sve ih bind-ati uz redeploy konfiguracije pri
  svakom novom tenantu (nepraktično, limitirano), ili (b) Node sidecar. → **Ako je
  transportni mTLS obavezan, binding nije izvediv rješenje za naš model.**
- **⚠️ DVOJBENO (ključno pitanje):** je li transportni klijentski cert uopće **obavezan**?
  Spec. spominje **1-way TLS** (samo poslužiteljski cert u handshakeu), a autentikacija
  obveznika je **XML-DSIG potpis u poruci**. **Ako transportni cert NIJE obavezan →
  cijeli B2C ide s Workera** (samo poslužiteljski TLS + potpisana poruka), **bez sidecara**.
  Testirati s DEMO certom (`02-*` §7.3, `99-gap-analiza`).
- **⚠️ Napomena o CF ograničenju:** `mtls_certificate` binding **ne smije ciljati zonu
  proxied kroz Cloudflare** (vraća 520). CIS (`porezna-uprava.hr`) **nije** iza Cloudflarea,
  pa ovo ograničenje **ne** utječe na nas — ali dobro je znati. (✅ POTVRĐENO.)

Node sidecar rješava mTLS trivijalno: `https.request({ key, cert, ca })` s per-tenant
ključem iz baze u memoriji. Isto vrijedi za **AS4** (2.0), koji je još zahtjevniji.

> **Zaključak §2:** mTLS je **jedini** preostali _tehnički_ argument za sidecar kod 1.0,
> i to **uvjetno**. Redoslijed provjere: (1) testiraj je li transportni cert obavezan;
> (2) ako nije → Workers-only; (3) ako jest → sidecar samo za taj poziv.

---

## 3. eRačun 2.0 (AS4/UBL) — posrednik ili vlastita Pristupna točka

Iz `03-*`: razmjena eRačuna ide **AS4 profilom** (ebMS3, kao Peppol/CEF eDelivery), s
UBL 2.1 (HR CIUS) i XAdES potpisom (RSA-SHA256). To je **stateful, kompleksan** protokol —
**nije Workers-friendly**. Dvije realne opcije (nisu isključive):

1. **Preko informacijskog posrednika** (FINA, Moj-eRačun, …) — pozovemo njihov REST/API
   iz **Workera** (obično običan HTTPS+token → **ne treba ni sidecar**). **Najbrži put do
   MVP-a**, bez vlastite certifikacije Pristupne točke. **Preporuka za fazu 1.** (Vidi
   `03-*` §11 — 34 posrednika s potvrdom o sukladnosti.)
2. **Vlastita Pristupna točka** — **zaseban servis** (ne Workers) koji radi AS4 + MPS/AMS +
   fiskalizacijsku poruku + **Završno testiranje na PTS-u**.
   - **✅ POTVRĐENO (open-source AS4 biblioteke):** zreli izbori su **Java**:
     **`phase4`** (`phax/ph-as4`) — lagana AS4 klijent/server biblioteka s ugrađenom
     Peppol/CEF eDelivery podrškom; postoji i **`phase4-peppol-standalone`** (gotov standalone
     AP). **Domibus** — CEF referentni AS4/ebMS3 Access Point (Java). **Nema zrele Node AS4
     biblioteke** → vlastiti AP realno znači **Java servis**, ne Workers i ne (nužno) Node
     sidecar. Veći opseg, kasnija faza.

> Za oba slučaja: UBL generiranje (XML string/template) i fiskalizacijska poruka **mogu na
> Workers**; **XAdES potpis i AS4 transport** idu u posrednika (opcija 1) ili zaseban Java
> AP (opcija 2).

---

## 4. Pohrana certifikata i privatnih ključeva (multi-tenant)

Načelo: **least exposure**. (Vidi i `04-*` i `05-*` §2.2.)

- Privatni ključ tenanta pohranjen **enkriptiran at-rest** u tablici `certifikat`
  (`05-*` §2.2). Enkripcija: AES-GCM s **master ključem** koji je Worker/sidecar secret
  (`wrangler secret put` / env), idealno preko KMS/Secret Store, ne u kodu.
- **Sigurnosni izbor (sada eksplicitan):** budući da je ZKI/XML-DSIG **tehnički izvediv na
  edge-u** (§1), pitanje "gdje dešifrirati ključ" je **sigurnosna**, ne tehnička odluka:
  - **(A) Sidecar drži plaintext ključ** → ključ nikad ne napušta sidecar; edge nikad ne
    vidi plaintext. Najbolja izloženost. Cijena: dodatna komponenta/hosting.
  - **(B) Edge dešifrira ključ u memoriji** za potpis → nema sidecara, ali plaintext ključ
    (kratkotrajno) živi u Worker izolatu. Prihvatljivo **samo uz jasnu sigurnosnu procjenu**
    (master ključ u Secret Store, bez logiranja, kratki životni vijek u memoriji).
- **Plaintext ključ nikad u bazi ni u logu.** Lozinka P12 i izvučeni PEM su tajne.
- Razmisliti o **envelope encryption po tenantu** (master ključ → per-tenant data key →
  ključ certifikata) radi lakše rotacije i opoziva.

> **Default preporuka:** za produkciju s tuđim (klijentskim) FINA ključevima → **(A)**,
> osim ako mjerenja latencije ili operativna jednostavnost ne prevagnu za **(B)** uz
> formalnu procjenu. Ovo je promjena tona: prva verzija je (B) tretirala kao "tehnički
> nužno izbjegavanje edge-a"; sada je to **svjesni sigurnosni trade-off**.

---

## 5. PDF i e-mail

- **PDF na Workers:**
  - **✅ POTVRĐENO:** `pdf-lib` (čisti JS) radi na Workers za jednostavan layout →
    dovoljno za račun. **⚠️ Poznata kvržica:** `@pdf-lib/fontkit` registracija custom
    fontova (`registerFontkit`) ima ESM problema na Workers (`registerFontkit is not a
    function`); postoje zaobilaznice (npr. `boxpdf`, provjereno da radi na Workers). Za
    standardne fontove/jednostavan račun nema problema.
  - **✅ POTVRĐENO (HTML→PDF vjernost):** **Cloudflare Browser Rendering / "Browser Run"
    (Puppeteer)** — moćno, ali **plaćeno**: traži **Workers Paid ($5/mj)** + naplata **po
    browser-minuti i po istovremenom browseru**; **Free plan cap 10 min/dan**. Podržani
    put je `@cloudflare/puppeteer` + Browser Rendering binding (REST `/pdf` endpoint također).
  - Alternativa: **Gotenberg** kao sidecar, ili vanjski HTML→PDF API preko `fetch()`.
  - **Preporuka MVP:** `pdf-lib` na Workers (bez custom-font komplikacija) za standardni
    račun; Browser Rendering samo ako treba puna HTML/CSS vjernost. Vidi `09-*`.
- **E-mail:** Cloudflare Email Sending / vanjski provider (Resend/SMTP) — vidi skill
  `cloudflare-email-service`. Deliverability (SPF/DKIM/DMARC) obavezno za račune.
- **QR kod** (`09-*`, `02-*` §10): generiranje QR-a je čisti JS → **na Workers** bez problema.

---

## 6. Predložena arhitektura (ASCII)

> Dijagram prikazuje **fazu 1 s uvjetnim sidecarom**. Ako se pokaže da transportni mTLS
> **nije** obavezan (§2), blok sidecara **nestaje** i sve u desnom dijelu preseljava se u
> Worker (ZKI/XML-DSIG/SOAP na edge, uz sigurnosnu procjenu iz §4-B).

```
                         ┌───────────────────── CLOUD (Cloudflare) ─────────────────────┐
   klijent (webshop,     │  domovina-fiskal Worker (Hono, nodejs_compat)                 │
   Google Forms,   POST  │   • POST /api/v1/racun     Bearer <apiKey> → tenant           │
   app, cron)  ────────► │   • validacija (zod), numeriranje (tablica `sekvenca`)        │
                         │   • upiši `racun` (status=nacrt→izdano), `stavka`,`pdv_...`   │
                         │   • ZKI (RSASSA-PKCS1-v1_5+SHA-1 → MD5)  [WebCrypto/node:crypto]│
                         │     └─ MD5 i node:crypto SU dostupni na Workers (✅)           │
                         │   • QR, PDF (pdf-lib), e-mail                                  │
                         │   • /admin  (Basic Auth) server-rendered HTML                 │
                         │   • D1: tenant, api_kljuc, certifikat(enc), poslovni_prostor, │
                         │         naplatni_uredaj, operater, kupac, racun, stavka,      │
                         │         pdv_raspodjela, naplata, poruka_log, sekvenca         │
                         │   • eRačun 2.0: poziv POSREDNIKA (REST/HTTPS) ── izravno ──►   │
                         │                                                               │
                         │   [AKO transportni mTLS obavezan] enqueue mTLS-SOAP job ──┐    │
                         └──────────────────────────────────────────────────────────┼────┘
                                     ▲  JIR/ZKI natrag (PATCH)                        │ claim (Bearer)
                                     │                                                ▼
                         ┌───────────┴──── SELF-HOSTED sidecar (UVJETAN, samo mTLS) ──────┐
                         │  • claim job → učitaj enc. certifikat, dešifriraj u memoriji  │
                         │  • (potpis već napravljen na edge-u; sidecar radi TRANSPORT)  │
                         │  • mTLS SOAP POST → CIS :8449  (test/prod)   [https.request]  │
                         │  • parsiraj JIR / Greske; retry+NakDost ako CIS pao           │
                         │  • PATCH natrag: {jir, status, greske}                        │
                         └───────────────────────────────────────────────────────────────┘
                                     │ mTLS (klijentski cert po tenantu)
                                     ▼
                    ┌────────────────────────────────────────────┐
                    │  CIS Porezna uprava  (B2C: SOAP :8449)      │
                    │  Posrednik (2.0: AS4) / vlastiti Java AP    │
                    └────────────────────────────────────────────┘
```

Napomene uz dijagram:
- **ZKI i XML-DSIG su premješteni u Worker** (nakon nalaza §1). Sidecar, ako uopće postoji,
  radi **samo transportni mTLS SOAP poziv** (ili ga po izboru §4-A radi cijeloga s ključem).
- **eRačun 2.0 posrednik** zove se **izravno iz Workera** (običan HTTPS) — nema sidecara.
- **Vlastiti AS4 AP** (ako se ikad radi) je **zaseban Java servis** (`phase4`/Domibus), ne
  ovaj sidecar.
- Gdje hostati (uvjetni) sidecar: Mac Mini (kao pipeline bridge) ili mali VPS; veza
  **Cloudflare Tunnel** ili javni HTTPS + Bearer.

---

## 7. Sinkrono vs. asinkrono — semantika fiskalizacije

Fiskalizacija **mora** podnijeti nedostupnost CIS-a (offline → izdaj sa ZKI, JIR
naknadno; `02-*` §8). Zato je **async queue prirodan model**, ne bug:

1. `POST /api/v1/racun` → Worker izračuna **ZKI** (potreban odmah za ispis — sada **na edge-u**,
   §1) i vrati **201 + {broj, zki, status:"izdano"}**. Račun je pravno izdan (ZKI dovoljan).
2. Fiskalizacija (JIR) ide **async**: bilo izravno s Workera (ako mTLS nije obavezan), bilo
   preko sidecara (ako jest). Kad JIR stigne → `status:"fiskalizirano"`, webhook/poll klijentu.
3. Ako CIS padne → job ostaje u redu, retry s **novim `IdPoruke`**, `NakDost=true`.

**Dilema ZKI-latencije (revidirana):** ZKI se sada računa **na Workeru** u koraku 1 (nema
round-tripa na sidecar samo za ZKI). Opcije:
- **(A) ZKI na edge-u, JIR async.** ✅ **nova preporuka** kad je (B-sigurnost iz §4)
  prihvatljiva ili kad transportni mTLS nije obavezan → najjednostavnije, bez sinkronog
  sidecar poziva.
- **(B) ZKI preko sidecara** (ako želimo da ključ nikad ne dođe na edge, §4-A) — sidecar
  izloži interni `POST /zki` (sinkrono) + `POST /fiskaliziraj` (queue). Latencija = lokalni HTTP.
- **(C) Potpuno async (i ZKI)** — API vraća `status:"u obradi"`, ZKI kasni. Lošiji UX/ispis. ❌

> Odabir ovisi o ishodu §4 (sigurnosni trade-off) i §2 (je li mTLS obavezan). Default za
> MVP: **(A)** ako sigurnosna procjena dopušta edge-ključ; inače **(B)**.

---

## 8. Runtime izbori — sažetak odluka (REVIDIRANO)

| Pitanje | Odluka (default) | Alternativa | Status |
|---|---|---|---|
| Gdje potpis (ZKI/XML-DSIG) | **Worker (edge)** — kripto radi | sidecar radi security-razlog | **promijenjeno** (bilo: sidecar) |
| MD5 / node:crypto na Workers | **dostupno, koristi se** | — | ✅ POTVRĐENO |
| mTLS transport prema CIS | **testiraj je li obavezan** → Workers ili uvjetni sidecar | pre-upload ≤1000 certova (loše) | ⚠️ DVOJBENO (fiskal. strana) |
| Dešifriranje ključa | **sidecar (least-exposure)** ili edge uz procjenu | — | sigurnosni izbor (§4) |
| AS4/eRačun 2.0 | **posrednik (faza 1, iz Workera)** → vlastiti Java AP | `phase4`/Domibus | odluka po fazi |
| Baza | **D1 (SQLite)** za MVP | Postgres+Hyperdrive ako preraste | odlučeno |
| Enkripcija certifikata | **AES-GCM, master ključ (secret/KMS)** | envelope per-tenant | odlučeno |
| PDF | **pdf-lib na Workers** | Browser Rendering (plaćeno) / Gotenberg | odlučeno |
| QR / e-mail | **Worker** | vanjski email provider | odlučeno |
| Model izvršenja | **async queue + ZKI na edge-u** | ZKI preko sidecara | ovisi o §2/§4 |
| Sidecar hosting (ako treba) | **Mac Mini / VPS + Cloudflare Tunnel** | javni HTTPS + Bearer | za potvrdu |

---

## 9. Otvorena pitanja (za `99-gap-analiza.md`)

- ⚠️ **NAJVAŽNIJE:** je li mTLS **klijentski** cert na CIS transportu **obavezan** (ili je
  dovoljan XML-DSIG potpis poruke uz 1-way TLS)? **Odgovor određuje treba li sidecar uopće
  za B2C.** Testirati s DEMO certifikatom. (`02-*` §7.3.)
- ✅ ~~Je li `node:crypto` `createHash('md5')` dostupan uz `nodejs_compat`?~~ → **DA**
  (POTVRĐENO; pun `node:crypto` od 04/2025; MD5 i u WebCrypto).
- ✅ ~~Podržava li CF per-request/dinamički klijentski cert na `fetch()`?~~ → **NE**
  (POTVRĐENO; `mtls_certificate` binding je statičan, per-Worker, limit 1000/račun).
- ⚠️ Radi li `xml-crypto` (exc-C14N, enveloped RSA-SHA1) pouzdano u Workers runtimeu uz
  `nodejs_compat`? Testirati — C14N je najosjetljiviji dio.
- ⚠️ Sigurnosna procjena: smijemo li dešifrirati tenantov privatni ključ u Worker izolatu
  (§4-B) ili inzistiramo na sidecaru (§4-A)?
- Odluka: **faza 1 = samo B2C fiskalizacija 1.0** (CIS SOAP) ili odmah i eRačun preko posrednika?
- Odluka: hosting (uvjetnog) sidecara (Mac Mini kao pipeline, ili VPS radi 24/7 dostupnosti).

---

## Izvori

> Datum pristupa svih Cloudflare izvora: **2026-07-04**. Provjereno na `developers.cloudflare.com`
> i službenom Cloudflare blogu; AS4 biblioteke na GitHubu/OpenPeppol.

**Cloudflare — WebCrypto / node:crypto (kripto, MD5, importKey):**
- Web Crypto (podržani algoritmi; **MD5 podržan**, digesti SHA-1/256/384/512+MD5;
  `RSASSA-PKCS1-v1_5` sign/verify/importKey/exportKey/generateKey):
  https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ (pristup 2026-07-04)
- Web Crypto (markdown izvor, verbatim lista algoritama i MD5 napomena):
  https://developers.cloudflare.com/workers/runtime-apis/web-crypto/index.md (pristup 2026-07-04)
- `node:crypto` na Workers (pun API uz `nodejs_compat`, iznimke: generateKeyPair DSA/DH,
  ed448/x448, FIPS):
  https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/ (pristup 2026-07-04)
- Changelog — poboljšana `node:crypto`/TLS podrška (08.04.2025.):
  https://developers.cloudflare.com/changelog/post/2025-04-08-nodejs-crypto-and-tls/ (pristup 2026-07-04)
- Blog — "A year of improving Node.js compatibility in Cloudflare Workers" (2025):
  https://blog.cloudflare.com/nodejs-workers-2025/ (pristup 2026-07-04)

**Cloudflare — mTLS binding (statičan, per-Worker; limit 1000/račun; 520 na proxied zonu):**
- mTLS binding (konfiguracija `mtls_certificates`, `fetch()` uvijek predstavlja cert):
  https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/ (pristup 2026-07-04)
- Blog — "Mutual TLS now available for Workers" (limit 1000 certifikata po računu):
  https://blog.cloudflare.com/mtls-workers/ (pristup 2026-07-04)
- Client certificates (mTLS) — SSL/TLS docs:
  https://developers.cloudflare.com/ssl/client-certificates/ (pristup 2026-07-04)

**Cloudflare — Browser Rendering / PDF (pdf-lib, fontkit, cijena):**
- Browser Rendering / Browser Run — cijena (Workers Paid $5/mj + po browser-minuti/concurrent):
  https://developers.cloudflare.com/browser-rendering/platform/pricing/ (pristup 2026-07-04)
- Generate PDFs (Browser Rendering `/pdf`, custom fonts):
  https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/ (pristup 2026-07-04)
- pdf-lib + fontkit ESM problem na Workers (issue) i zaobilaznice (`boxpdf`):
  https://github.com/cloudflare/workers-sdk/issues/8140 · https://earonesty.github.io/boxpdf/ (pristup 2026-07-04)

**AS4 / ebMS3 open-source biblioteke (vlastita Pristupna točka):**
- `phase4` (phax/ph-as4) — Java AS4 klijent/server, Peppol/CEF eDelivery ugrađen:
  https://github.com/phax/phase4 (pristup 2026-07-04)
- `phase4-peppol-standalone` — standalone AP primjer:
  https://github.com/phax/phase4-peppol-standalone (pristup 2026-07-04)
- Domibus — CEF referentni AS4/ebMS3 Access Point (Java):
  https://docs.edelivery.tech.ec.europa.eu/domibus/ (pristup 2026-07-04)
- Peppol AS4 profil (odnos AS4 ← CEF eDelivery ← OASIS AS4 ← ebMS3):
  https://docs.peppol.eu/edelivery/as4/specification/ (pristup 2026-07-04)

**Interni izvori (osnova domenskih tvrdnji):**
- `docs/knowledge/02-fiskalizacija-1.0-tehnicki.md` (ZKI RSA-SHA1+MD5, XML-DSIG exc-C14N,
  endpoint `:8449`, 1-way TLS napomena §7.3), `03-fiskalizacija-2.0-eracun.md` (AS4/UBL/posrednici),
  `04-certifikati-fina-akd.md` (P12→PEM, CA lanac), `05-podatkovni-model-multitenant.md`
  (tablice, enkripcija certifikata §2.2), `09-pdf-racun-i-qr-kod.md` (PDF/QR/email),
  `docs/reference/lokalni-artefakti.md` (pipeline bridge model, `xml-crypto`, `fiksal-hr-nodejs`).

### Napomena o promjeni preporuke (audit trag)
Prva (ručna) verzija ovog dokumenta navodila je **tri blokera** za Workers-only pristup, od
kojih je prvi ("MD5 ne postoji u WebCrypto") bio **glavni razlog** za obavezan Node sidecar.
Web-verifikacija 2026-07-04 pokazala je da je **MD5 podržan** i da je **cijeli `node:crypto`
dostupan** na Workers → **kripto više nije razlog za sidecar**. Preostaje **jedan uvjetni**
tehnički razlog (per-tenant transportni mTLS, i to samo ako ga CIS zahtijeva) te **jedan
sigurnosni izbor** (gdje dešifrirati ključ). Preporuka je stoga pomaknuta s "obavezan hibrid"
na **"Workers-first, sidecar samo uvjetno/sigurnosno"**.

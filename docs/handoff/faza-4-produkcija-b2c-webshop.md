# Faza 4: produkcijska B2C fiskalizacija za webshopove (automatski račun nakon kartice)

Plan je napisan 01.10.2026. **Implementirano istog dana (01.10.2026.), osim PROD koraka** —
stanje po koracima u tablici niže; kronologija i nalazi u
[`docs/research/faza-4-dnevnik-implementacije.md`](../research/faza-4-dnevnik-implementacije.md).

| Korak | Stanje | Commit |
|---|---|---|
| 4.7 Testovi | ✅ vitest + workers pool, 49 testova (`npm test`); predeploy/deploy:test traže typecheck + testove | `7a5198e` (+ testovi u svakom koraku) |
| 4.1 Idempotencija | ✅ | `b0dce30` |
| 4.2 Robusna fiskalizacija | ✅ lease, trag svake greške, fer sweep, alarmi, `/api/v1/zdravlje` | `d3a4e56` |
| 4.3 Storno | ✅ validacija + trigger, `POST /racun/:id/storno`, referenca u PDF-u/mailu | `7fc63fb`, `0bc11f4` |
| 4.4 Email i API | ✅ (4.4b webhook namjerno preskočen) | `764463b` |
| 4.5 Admin i sigurnost | ✅ kod; TEST `ADMIN_PASS` rotiran. ⏳ PROD: zaseban `ENC_MASTER_KEY`, pravi `DOKU_SOFTWARE_API_TOKEN` — čekaju odobrenje | `c1663de` |
| 4.6 CIS poslužiteljski cert | ✅ notAfter iz handshakea + alarm; najava zamjene za 12/2026 još nije objavljena | `26068e9` |
| 4.8.1 Push | ✅ | — |
| 4.8.2 TEST migracije + deploy | ✅ 0007–0009, verzija `a75738d8` (crons `*/15` + `0 6`) | — |
| 4.8.3 E2E na CIS TEST-u | ✅ na ITalku (tenant 1) — MARCIDEA nema demo cert (v. dnevnik §6); `ALARM_EMAIL` i `RESEND_API_KEY` na testu nisu postavljeni | — |
| 4.8.4 PROD | ✅ 1–4 (odobreno 01.10.2026.): backup → `secrets/prod-backup-2026-10-01-prije-0007.sql`, migracije 0007–0009, deploy `6fd7122a`, echo na PROD CIS ✅ (cert do 18.12.2026.). ⏳ 5: prvi pravi PROD račun — NAKON čišćenja (4.8.5) | — |
| 4.8.5 Čišćenje prod baze | ⏳ čeka odobrenje | — |
| 4.9 Onboarding MARCIDEA na PROD | 🟡 pripremljen `backend/scripts/dodaj-tenant.sh` (nije izvršen) | `fa2cf06` |
| Usput: bug FINA P12 upload | ✅ od `9bbb563` se FINA P12 nije mogao uploadati | `90bfda1` |

**Cilj.** Domovina Fiskal treba moći sigurno i automatski izdavati fiskalni B2C
račun na **velikom broju računa**. Webshop ga poziva nakon svake kartične
naplate (Stripe webhook), bez ljudskog nadzora. Prvi takav klijent je
**crosulja.hr**, tenant MARCIDEA d.o.o.

**Kontekst odluke.** Vlasnik Crošulje i Matija su se 30.09.2026. dogovorili:
- **na produkciji Crošulja zasad ostaje na Parri** (račune izdaje ručno);
- dugoročno rješenje je Domovina Fiskal;
- Fiskal se zato ojačava bez žurbe, a Crošulja prelazi tek kad ovaj plan
  prođe do kraja.

Analiza na strani webshopa nalazi se u
`~/git/crosulja/crosulja-hr/docs/24-automatski-racun-domovina-fiskal.md`.

Faza 4 u [`PLAN.md`](../../PLAN.md) („Produkcija B2C") razrađena je ovdje.

---

## 0. Utvrđeno stanje (30.09.2026.)

Sve je provjereno čitanjem koda te upitima nad obje D1 baze i nad deployima,
bez ikakvih izmjena.

| | PROD `fiskal-domovina-backend` | TEST `fiskal-domovina-backend-test` |
|---|---|---|
| Domena | fiskal.domovina.ai | fiskal-test.domovina.ai |
| Verzija | `403fda50` (17.07., ≈ `c8de58d`), **bez** `d373160` | `e857d05a` (03.08., s `d373160`) |
| Tenanti | samo ITalk | 5 (MARCIDEA = **id 5**: prostor `WEB`, uređaj `1`, **0 certifikata**) |
| `poruka_log` po okolini | **prod: 0**, dakle produkcijski CIS nikad nije pozvan | test: 4 |
| Ostalo | 2 ITalkova probna `fiskalni_b2c` računa s **TEST JIR-ovima**, kopirana pri razdvajanju okolina (troše prod slijed) | — |

- **Git:** lokalni `main` je 2 commita ispred `origin`. Commitovi `d373160`
  (EPC QR, fiskalni B2C bez naloga za plaćanje) i `bca9b73` (docs) **nisu
  pushani**.
- ⚠️ **`npm run deploy` deploya PRODUKCIJU.** Glavni worker u `wrangler.toml`
  je prod; test se deploya s `wrangler deploy --env test`.

## 1. Nalazi koje ova faza rješava

Poredano po težini. Brojevi linija vrijede za commit `bca9b73`.

| # | Nalaz | Gdje |
|---|---|---|
| N1 | **Nema idempotencije.** Ponovljeni zahtjev (Stripe retry, timeout klijenta, 500 nakon commita batcha) izda **drugi fiskalni račun** s novim brojem i JIR-om. | `validacija.ts:170-225`, `db.ts:493-570`, `racuni.ts:379` |
| N2 | **Račun bez ZKI-ja vječno blokira sweep.** Istek certifikata se ne provjerava prije trošenja broja (`racuni.ts:251-256` provjerava samo postojanje). `ucitajPotpisniMaterijal` tad vrati grešku, ali `fiskalizirajRacun` ne pozove `zapisiFiskalGresku`. Isto vrijedi za OIB mismatch i grešku mapiranja (`fiskalizacija.ts:140-144, 166-167`). `fiskal_pokusaja` ostane 0, pa ga `racuniZaNaknadnuDostavu` (`db.ts:804-815`, `ORDER BY id LIMIT 20`, **zajedničko svim tenantima**) uzima zauvijek. 20 takvih računa zaustavi naknadnu dostavu za sve. | |
| N3 | **Nema claima ni locka.** Cron, sinkroni POST i ručni `/fiskaliziraj` mogu isti račun poslati CIS-u istodobno. | `db.ts:804-815`, `racuni.ts:406-426` |
| N4 | **Nema alarma, limita pokušaja ni praćenja roka od 2 radna dana** (čl. 21. st. 2.). Greške `s001`–`s005` i `s013` postave `nak_dost=0` i račun ostane bez JIR-a, a da to nitko ne vidi. | `fiskalizacija.ts:207-220, 233-245` |
| N5 | **Sweep je spor i serijski.** 20 računa svakih 15 min; u najgorem slučaju 20 × 15 s timeouta, tj. oko 80 računa na sat. | `fiskalizacija.ts:233-245` |
| N6 | **Storno nije validiran.** Ne provjerava se je li original fiskalni, je li već storniran ni je li iznos ≤ originalu. Original ne prelazi u `storniran`, a PDF storna ne navodi original. | `racuni.ts:265-268`, `pdf/racun-pdf.ts` |
| N7 | **Sigurnost.** Test admin ima placeholder `ADMIN_PASS` iz `.dev.vars`; za prod treba provjeriti nije li isti. `ENC_MASTER_KEY` je isti na testu i produkciji. Na prod je TEST `DOKU_SOFTWARE_API_TOKEN`. Admin nema CSRF zaštitu. | `backend/.dev.vars`, `secrets/ops-naucen-kontekst.local.md` |
| N8 | **Certifikat poslužitelja CIS PROD** (Fina RDC 2020) istječe **18.12.2026.** Lanac je hardkodiran, a obnovu poslužiteljskog certa nitko ne prati. | `cis.ts:21-33`, `fiskal/ca/` |
| N9 | **Email za fiskalni račun.** Naslov je „Dokument …" (`NASLOVI` nema `fiskalni_b2c`). Za plaćeni račun tijelo ispisuje IBAN za plaćanje. Nema reply-to tenanta. Test nema `RESEND_API_KEY`. | `email.ts:20-24, 67, 76` |
| N10 | **API sitnice.** `limit=abc` daje 500. Popis ne vraća `jir`/`zki`. Nema pretrage po referenci. Nema obavijesti klijentu kad JIR stigne. | `racuni.ts:541-564`, `db.ts:740` |
| N11 | **Admin.** Nema izmjene tenanta (`u_sustavu_pdv`, naziv, adresa, IBAN). Nema deaktivacije prostora, uređaja ni operatera. Nema rute za brisanje API ključa. | `admin/app.ts` |
| N12 | **Nema automatskih testova** (samo `typecheck`). | `package.json` |

## 2. Plan rada

Svaki korak ide u **zaseban commit** i provjerava se na lokalnom D1 prije
sljedećeg.

### 4.1 Idempotencija (N1)

- Migracija `0007_idempotencija.sql`:
  - `racun.vanjska_referenca TEXT NULL`;
  - `racun.zahtjev_hash TEXT NULL` (SHA-256 kanoničkog JSON-a tijela, bez
    `vanjskaReferenca`);
  - `CREATE UNIQUE INDEX … ON racun(tenant_id, vanjska_referenca) WHERE vanjska_referenca IS NOT NULL`.
- API dobiva novo polje `vanjskaReferenca` (opcionalno, 1–100 znakova, `[\w./:-]`).
  Isto se prihvaća i kroz zaglavlje `Idempotency-Key`; ako su poslani i polje i
  zaglavlje, a razlikuju se, odgovor je 400.
- Ponašanje:

  | Situacija | Odgovor |
  |---|---|
  | referenca ne postoji | izdaj kao dosad, 201 |
  | referenca postoji, isti hash | **200** s postojećim računom + zaglavlje `Idempotent-Replay: true`; **ne fiskalizira ponovno** (JIR stiže sweepom) |
  | referenca postoji, drugi hash | **409** `{greska: 'vanjskaReferenca je već iskorištena za drukčiji račun', racunId}` |

- **Utrka dva istodobna zahtjeva.** Batch u `db.ts` (`INSERT racun`) padne na
  UNIQUE. Cijeli batch se tada vrati unatrag, uključujući `sekvenca+1`, pa
  **rupe nema**. Uhvati grešku constrainta, dohvati postojeći račun i vrati
  200 ili 409 kao gore. Testom dokazati da broj nije potrošen.
- `GET /api/v1/racun?vanjskaReferenca=…` vraća točno jedan račun ili 404.
  Klijent time nakon timeouta provjerava je li račun nastao.
- Isto vrijedi za sve tipove dokumenata (predračun, ponuda), ne samo za B2C.

### 4.2 Robusna fiskalizacija (N2, N3, N4, N5)

1. **Preduvjeti prije trošenja broja.** U `kreirajDokument` provjeriti i
   `cert.not_after` (409 „Certifikat je istekao …"). Opcionalno provjeriti i
   da OIB certifikata odgovara tenantu, jer je to jeftino.
2. **Svaka greška ostavlja trag.** U `fiskalizirajRacun` svaki rani izlaz
   (materijal, OIB, mapiranje, iznimka pri potpisu) mora pozvati
   `zapisiFiskalGresku(…, retryable)`, koji povećava `fiskal_pokusaja` i
   postavlja `fiskal_zadnji_pokusaj`:
   - istekao ili nedostupan certifikat je retryable, jer će se cert obnoviti;
   - greška mapiranja nije retryable.
3. **Claim (lease).** Migracija dodaje `racun.fiskal_zakljucano_do TEXT`. Prije
   slanja pokreni:

   ```sql
   UPDATE racun
      SET fiskal_zakljucano_do = datetime('now', '+60 seconds')
    WHERE id = ? AND jir IS NULL
      AND (fiskal_zakljucano_do IS NULL OR fiskal_zakljucano_do < datetime('now'))
   RETURNING id
   ```

   Ako ništa nije vraćeno, netko drugi već šalje: vrati `{ok:false, uTijeku:true}`.
   Nakon pokušaja lease se otpušta. Ovo koriste POST, ručni retry, admin i cron.
4. **Novi sweep:**
   - kandidati: `jir IS NULL AND status='izdano' AND tip='fiskalni_b2c'`,
     nezaključani, `fiskal_nak_dost=1 OR fiskal_pokusaja=0`;
   - **sortiranje po `fiskal_zadnji_pokusaj` (NULL prvi)**, a ne po `id`;
   - backoff: ne ponavljati prije `min(2^pokusaja min, 60 min)`;
   - fer raspodjela po tenantu: najviše N po tenantu u jednom prolazu;
   - konkurentnost 4–5 (`Promise.allSettled` u grupama), `LIMIT 50`;
   - račun stariji od 7 dana i bez JIR-a izlazi iz automatike: postavi
     `nak_dost=0` i diže alarm.
5. **Alarmi.** Novi modul `alarmi.ts` + dnevni cron (npr. `0 6 * * *`) i
   provjera na kraju svakog sweepa (deduplicirano preko tablice
   `alarm(kljuc, zadnje_slanje)`). Mail ide platformi (`ALARM_EMAIL` var) i
   kontaktu tenanta ako postoji. Alarm se diže kad:
   - račun bez JIR-a ima više od **24 h** (rok su 2 radna dana);
   - postoji račun s greškom nakon koje se ne radi retry;
   - certifikat tenanta ističe za ≤ 30 dana, i ponovno ≤ 7 dana;
   - poslužiteljski cert CIS-a ističe za ≤ 30 dana (vidi 4.6);
   - CIS echo ne prolazi više od 1 h.
6. **`GET /api/v1/zdravlje`** (bez autentikacije, bez podataka o tenantima)
   vraća `{cisEcho, sweepZadnji, racunaBezJira24h}`, za vanjski monitoring.

### 4.3 Storno (N6)

- Validacija `stornoZaId`:
  - original istog tenanta;
  - `tip_dokumenta='fiskalni_b2c'`;
  - ima ZKI;
  - nije `storniran`;
  - zbroj svih storna istog originala ≤ iznos originala (radi djelomičnih
    povrata).
- Puni storno postavlja original na `status='storniran'`. Djelomični dobiva
  polje `djelomicno_storniran` ili se računa iz zbroja; preporuka je
  izračunati, bez novog stupca.
- **Prečac `POST /api/v1/racun/:id/storno`:**
  - tijelo `{vanjskaReferenca, stavke?: [{redak, kolicina}], napomena?}`;
  - bez `stavke` stornira se cijeli račun: kopiraju se stavke s negativnom
    količinom ili cijenom (prema tome što ZKI i `validacija` dopuštaju, provjeri
    `util.ts:38-44`), uz isti način plaćanja, prostor i uređaj te operatera
    originala ili poslanog;
  - idempotentno preko 4.1.

  Webshop to koristi na Stripe `charge.refunded`.
- PDF i email storna navode **„Storno računa br. X od DD.MM.GGGG."**.

### 4.4 Email i API sitnice (N9, N10)

- `NASLOVI.fiskalni_b2c = 'Račun'`. Za račun koji nije predračun nema bloka
  s podacima za plaćanje. `replyTo` je e-mail tenanta.
- `limit` i `offset` se validiraju zodom: 400 umjesto 500.
- Popis vraća `jir`, `zki`, `vanjskaReferenca` i `fiskalizacija.status`.
- **Opcionalno (4.4b):** webhook prema klijentu. Po tenantu se postavljaju
  `webhook_url` i `webhook_tajna`; poziv `racun.fiskaliziran` ide s HMAC
  potpisom kad sweep dobije JIR. Bez toga klijent polla `GET /racun/:id`, što
  je za početak dovoljno.

### 4.5 Admin i sigurnost (N7, N11)

- **Izmjena tenanta:** naziv, adresa, IBAN i e-mail su slobodni.
  `u_sustavu_pdv` i `oznaka_slijednosti` smiju se mijenjati **samo dok tenant
  nema nijedan izdan dokument**; nakon toga je odgovor 409 s objašnjenjem.
- Deaktivacija prostora, uređaja i operatera (stupci `aktivan` već postoje)
  te brisanje deaktiviranog API ključa.
- **CSRF** za admin forme: double-submit token ili provjera `Origin`.
- **Rotacije.** Svaka rotacija na PROD traži **izričito odobrenje korisnika u
  sesiji**.
  - `ADMIN_PASS` na testu: jaka lozinka, `wrangler secret put ADMIN_PASS --env test`.
  - Provjeriti da prod `ADMIN_PASS` nije placeholder.
  - Zaseban `ENC_MASTER_KEY` za PROD. Na produkciji je danas samo ITalkov
    certifikat, pa je najjednostavnije: novi KEK, pa ponovni upload ITalkova
    P12. Druga mogućnost je skripta za re-wrap DEK-ova (`kripto.ts`).
  - Pravi `DOKU_SOFTWARE_API_TOKEN` na PROD.

### 4.6 CIS poslužiteljski certifikat (N8)

- Ugraditi provjeru isteka: konstanta s poznatim `notAfter` po okolini, plus
  alarm iz 4.2.5. Ako subtls izlaže lanac, bolje je očitati `notAfter` iz
  handshakea u echo pozivu.
- Prije 18.12.2026. provjeriti na `fina.hr` i stranicama Porezne je li najavljen
  novi poslužiteljski cert ili CA. Ako jest, dodati ga u `fiskal/ca/` **uz**
  stari (prihvaćaju se oba).

### 4.7 Testovi (N12)

Vitest + `@cloudflare/vitest-pool-workers`, lokalni D1 s migracijama. Testovi:

- ZKI na poznatom vektoru iz `docs/knowledge/02` / tehničke specifikacije;
- XML potpis (struktura i digest);
- numeriranje: 20 paralelnih POST-ova daje brojeve 1–20 bez rupa i duplikata;
- idempotencija: isti ključ ×10 paralelno daje 1 račun i ne troši brojeve;
  drugi payload daje 409;
- istekao cert daje 409 **prije** trošenja broja;
- račun s greškom potpisa ne blokira sweep: ima `pokusaja>0`, a ostali
  računi prolaze;
- claim: dva istodobna `fiskalizirajRacun` šalju samo jedan CIS poziv
  (CIS mockan);
- storno: cijeli, djelomični, dvostruki (409), storno nefiskalnog (400);
- `nacinPlacanja: 'KARTICA'` daje `NacinPlac=K` u XML-u.

Skripta je `npm test`, a typecheck i testovi moraju proći prije svakog deploya.

### 4.8 Puštanje

1. **Push** `main` (uključuje `d373160` i `bca9b73`).
2. **TEST:** `npx wrangler d1 migrations apply fiskal_domovina_test --remote --env test`,
   pa `npx wrangler deploy --env test`. Na testu postaviti `RESEND_API_KEY`.
3. **E2E na TEST CIS-u, tenant MARCIDEA (id 5):**
   - nabaviti demo certifikat na **OIB MARCIDEA-e 73208423335** (FINA DEMO
     smije tražiti integrator, `docs/knowledge/04` §3; ili AKD TESTCERTILIA)
     i uploadati ga s `okolina=test`;
   - scenarij:
     1. B2C `KARTICA` s `vanjskaReferenca`;
     2. ponovljeni isti zahtjev daje 200 replay;
     3. puni storno;
     4. djelomični storno;
     5. simulirani CIS timeout (`OKOLINA` test + nedostupan host u lokalnom
        devu) dovodi do naknadne dostave, a sweep donosi JIR;
     6. alarm mail stiže.
4. **PROD (samo uz izričito odobrenje korisnika):**
   1. backup prod D1 (`wrangler d1 export`);
   2. migracije;
   3. deploy;
   4. `GET /admin/cis/echo` na produkciji;
   5. **prvi pravi račun na PROD CIS-u** s ITalkovim produkcijskim certom
      (stvaran ITalkov promet ili račun + storno, uz dogovor s korisnikom).
5. **Čišćenje prod baze** (uz odobrenje): 2 ITalkova probna računa s TEST
   JIR-ovima i pripadna `sekvenca`. Prije toga eksport; vidi HANDOFF.
6. Ažurirati `HANDOFF.md`, `PLAN.md` (Faza 4 ✓), `docs/knowledge/99`
   i dnevnik.

### 4.9 Onboarding MARCIDEA-e na PROD (NE u ovoj sesiji)

Ovo čeka vlasnika Crošulje: PDV status, produkcijski certifikat, prostor `WEB`
prijavljen u ePoreznoj s OIB-om ITalka kao proizvođača, OIB operatera. U ovoj
fazi samo **pripremiti** `backend/scripts/dodaj-tenant.sh`, poopćenu iz
`dodaj-tenant-test.sh` s `--okolina test|prod`, koja na PROD traži potvrdu.
Skripta se **ne izvršava**.

## 3. API ugovor za klijente (webshop) nakon faze 4

```http
POST /api/v1/racun
Authorization: Bearer dfk_…
Idempotency-Key: CRO-2026-0201            # ili polje vanjskaReferenca

{ "tip": "FISKALNI_B2C", "vanjskaReferenca": "CRO-2026-0201",
  "poslovniProstor": "WEB", "naplatniUredaj": "1", "operaterOib": "…",
  "nacinPlacanja": "KARTICA", "valuta": "EUR", "kupac": {…}, "stavke": [ … ] }

201 → novi račun            200 + Idempotent-Replay → već postoji (isti zahtjev)
409 → referenca zauzeta drugim sadržajem, ili preduvjet (cert, prostor)
GET  /api/v1/racun?vanjskaReferenca=CRO-2026-0201   → nakon timeouta klijenta
GET  /api/v1/racun/:id                              → poll za JIR (fiskalizacija.status)
POST /api/v1/racun/:id/storno {vanjskaReferenca: "CRO-2026-0201-povrat-1", stavke?}
GET  /api/v1/racun/:id/pdf
```

**Pravilo za klijenta:** kad je odgovor 201 ili 200, ali `zki` je null, to je
greška u preduvjetu fiskalizacije. Račun postoji, a fiskal ga sam dovršava i
diže alarm. Klijent ne smije izdavati novi račun.

## 4. Izvan opsega

- Webshop strana (crosulja.hr): poziv s referencom, retry kroz queue ili cron,
  poll JIR-a, `charge.refunded` → storno. Radi se u repou crosulje nakon ove
  faze; vidi njegov `docs/24`.
- Verifikacija potpisa odgovora CIS-a i nove CIS metode iz 2026. (radno
  vrijeme, promjena načina plaćanja): `docs/knowledge/19` §4.1, zasebna
  stavka.
- Licenca i naplata tenanata: `docs/handoff/licenca-onboarding.md`.

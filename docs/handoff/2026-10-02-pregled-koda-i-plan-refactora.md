# Pregled implementacije backenda i plan refactora (2026-10-02)

**Autor pregleda:** Claude Fable 5.1 (`claude-fable-5-1`), kao neovisni reviewer.
**Namjena:** ulazni dokument za sesiju u kojoj Claude Opus 5.5 radi refactor.
**Opseg:** `backend/` na commitu `4d1b67d` (main, čisto radno stablo). Ništa nije
mijenjano — ovo je isključivo analiza i prijedlog.

> Pravilo za izvršitelja: svaki nalaz niže ima oznaku težine i točnu lokaciju
> (`datoteka:redak` na commitu `4d1b67d`). Redoslijed izvođenja je u §6 i nije
> proizvoljan — ovisnosti među koracima su namjerne. Ne preskakati §5 („što NE dirati").

---

## 0. Sažetak za one koji čitaju samo prvi ekran

- **Premisa „većinu je radio Opus" je netočna.** Po `Co-Authored-By` trailerima,
  **Fable 5** je napisao ~6.700 od ~10.300 redaka u `backend/` (faze 0–3, SSO,
  okoline, onboarding po OIB-u). **Opus 5.5** je napisao ~2.700 (cijela Faza 4:
  idempotencija, robusnost, storno, CSRF **i svi testovi**). Opus 4.8 je radio
  docs i doku eRačun MVP; Opus 5 samo EPC QR. **Fable 5.1 se u povijesti ne
  pojavljuje.** Detalji u §1.
- **Baseline je zelen:** `npm run typecheck` prolazi, `npm test` = 49/49 (15 s).
- **Kvaliteta je iznad prosjeka** za projekt ove veličine: numeriranje bez rupa
  kroz jedan D1 batch, lease, fer sweep, kanonski XML po konstrukciji, testovi u
  workerd-u s pravim D1 i zabranjenim pravim CIS-om. To treba sačuvati.
- **Jedan kritičan nalaz (K1):** Fina CA certifikati (`backend/src/fiskal/ca/*.pem`)
  **nisu u gitu** — ignorira ih `*.pem` iz `.gitignore`. Svježi clone se ne
  builda, a projekt je javan/open-source. Popravak je trivijalan, ali mora biti
  prvi.
- **Dva visoka nalaza:** admin forma za fiskalni B2C račun ne računa ZKI ni ne
  fiskalizira sinkrono (K2); ne-PDV obveznik kroz API dobiva kategoriju `Z`
  umjesto `E` (K3), što se prenosi i u CIS XML i u doku eRačun.
- **Strukturni problem:** `db.ts` (1.405 redaka, 12 domena) i `api/racuni.ts`
  (997 redaka: CORS + auth + servis + serializacija + 20 ruta). Refactor je
  mehanički i siguran ako se radi s barrel exportom (§6, koraci 2–3).
- **Testovi:** 49 integracijskih testova je dobro, ali **nijedan unit test ne
  pokriva novčano-kritične čiste funkcije** (`izracunajIznose`, `uCente`,
  `mapirajZaCis`, `parsirajOdgovor`, HUB3/EPC payload). Popis u §4.
- **Nema CI-ja** (`.github/` ne postoji). Da postoji, K1 bi bio uhvaćen u srpnju.

---

## 1. Tko je što napisao (git history)

Metoda: `git log --format='%(trailers:key=Co-Authored-By)'` + `git blame
--line-porcelain` po datoteci, mapirano na model iz commita. Brojevi su živi
redci na `4d1b67d` (bez `package-lock.json`, `0003_kpd2025.sql`, fontova).

| Model (trailer) | Commitova | Dodano u `backend/` | Što |
|---|---|---|---|
| Claude **Fable 5** | 25 | **+6.746 / −435** | Faza 0 skela, Faza 1 dokumenti+PDF+email, Faza 2 B2C fiskalizacija (ZKI, XML-DSIG, subtls transport, P12 parser, AKD), dashboard SSO, TEST/PROD okoline, onboarding po OIB-u, doku konvencije |
| Claude **Opus 5.5** | 13 | +2.702 / −165 | Faza 4 (4.1–4.7): idempotencija, lease, sweep, alarmi, storno + trigger, CSRF, izmjena tenanta, CIS cert nadzor, **sav `test/`**, FINA P12 fix, skripta onboardinga |
| Claude Opus 4.8 (1M) | 10 | +793 / −8 | docs 00–15, HANDOFF, doku eRačun MVP (`eracun/doku.ts`, `eracun/eracun.ts`) |
| Claude Opus 5 (1M) | 2 | +113 / −23 | EPC QR uz HUB3, fiskalni bez naloga za plaćanje |
| Claude Fable 5.1 | **0** | — | — |

Raspodjela živih redaka po datoteci (blame):

| Datoteka | Fable 5 | Opus 5.5 | Ostali |
|---|---|---|---|
| `src/db.ts` | 1.002 | 285 | — |
| `src/api/racuni.ts` | 635 | 307 | — |
| `src/admin/app.ts` | 590 | 99 | — |
| `src/admin/views.ts` | 592 | 46 | — |
| `src/fiskal/fiskalizacija.ts` | 228 | 89 | — |
| `src/fiskal/cis.ts` | 210 | 41 | — |
| `src/fiskal/xml.ts`, `zki.ts`, `certifikat.ts`, `kripto.ts`, `registri.ts`, `auth/gotrue.ts` | sve | 7 (certifikat) | — |
| `src/pdf/racun-pdf.ts` | 347 | 28 | Opus 5: 61 |
| `src/pdf/hub3.ts` | 89 | — | Opus 5: 46 |
| `src/alarmi.ts`, cijeli `test/`, migracije 0007–0009 | — | sve | — |
| `src/eracun/doku.ts`, `eracun.ts` | 37 | — | Opus 4.8: ostatak |
| `src/validacija.ts` | 336 | 9 | — |

Napomena reviewera: ja sam Fable 5.1 i pregledavam kod koji je većinom napisao
Fable 5. Nalazi niže su u kodu **oba** glavna autora (K1, K3, K4, K13, K15, K16 u
Fable-ovom kodu; K7, K10, K11, K12 u Opusovom; K2 na spoju). Nisam štedio nikoga.

---

## 2. Što je dobro (i ne smije se „popraviti")

Ovo je popis obrazaca koji su **ispravni i dokazani** (testom ili E2E na CIS-u).
Refactor ih smije premještati, ne mijenjati semantiku.

1. **Numeriranje bez rupa** — `db.ts:567-648` (`upisiRacun`): `sekvenca` upsert +
   `INSERT racun … SELECT … FROM sekvenca` + stavke preko subselecta, sve u
   jednom `db.batch()` (transakcija). Utrka na UNIQUE (`vanjska_referenca`,
   trigger storna) vraća i `sekvenca+1`. Dokazano: `test/fiskalizacija.test.ts:987`
   (20 paralelnih), `test/idempotencija.test.ts:758`.
2. **Izdavanje skice** — `db.ts:740-797`: inkrement sekvence je uvjetovan time da
   je skica još `nacrt` (`skicaJeNacrt`), pa ponovljeni „izdaj" ne troši broj.
3. **Lease fiskalizacije** — `db.ts:920-931`, `fiskalizacija.ts:148-171`: atomski
   `UPDATE … RETURNING`, samoistječe nakon 60 s. (Jedna rupa: K7.)
4. **Fer sweep s backoffom** — `db.ts:951-975`: `ROW_NUMBER() OVER (PARTITION BY
   tenant_id)`, `1 << pokusaja` min; jedan tenant s pokvarenim certom ne guši druge.
5. **XML kanonski po konstrukciji** — `fiskal/xml.ts`: exc-C14N oblik se ne
   računa nego gradi; RSA-SHA256 (SHA-1 vraća `s004`). E2E potvrđen JIR na CIS
   TEST-u (FINA i AKD). **Ne dirati bez novog E2E-a.**
6. **ZKI** — `fiskal/zki.ts`: vektor testa računa Node OpenSSL neovisno o kodu
   pod testom (`test/globalni-setup.ts:245-249`).
7. **Transport** — `fiskal/cis.ts:85-146`: `cloudflare:sockets` + subtls s Fina
   CA kao trust anchorom, ručni HTTP/1.1 s chunked dekodiranjem. Jedini način
   bez sidecara; dokumentirano zašto.
8. **Kripto envelope** — `kripto.ts`: per-cert DEK (AES-256-GCM) omotan KEK-om iz
   secreta; plaintext ključa samo u memoriji poziva; nikad u logu.
9. **Testna infrastruktura** — `vitest-pool-workers`, pravi D1 s migracijama,
   `postaviCisTransport()` umjesto `vi.mock` (koji u workers poolu ne djeluje —
   dokumentirano u dnevniku), setup koji **baca** ako test dotakne pravi CIS.
   U repou nema nijednog ključa — generira se pri svakom pokretanju.
10. **CSRF za Basic Auth admin** — `admin/app.ts:81-94`: `Origin`, inače
    `Sec-Fetch-Site`; klijenti bez oba (curl) prolaze. Svjesni trade-off, testiran.
11. **Novac u centima (integer)**, iznosi kao decimalni stringovi, zaokruživanje
    po skupini (EN 16931 BR-CO) — `validacija.ts:272-312`.
12. **Hrvatski komentari s pravnim referencama** (čl. 21. st. 2., čl. 79., čl. 90.)
    — to je dokumentacija koju Opus mora **zadržati** pri premještanju koda.

---

## 3. Nalazi

Težina: **K** = kritično (blokira build/deploy ili krši zakon), **V** = visoko
(pogrešan podatak prema PU/kupcu ili sigurnost), **S** = srednje (robusnost,
operativa), **N** = nisko (higijena, dug). Svaki nalaz ima: lokaciju, posljedicu,
popravak, test koji ga dokazuje.

### K1 (kritično) — Fina CA certifikati nisu u repozitoriju

- **Gdje:** `.gitignore:10` (`*.pem`), `backend/src/fiskal/cis.ts:21-22`
  (`import finaDemoCa2020 from './ca/fina-demo-ca-2020.pem'`), `wrangler.toml`
  `[[rules]] type="Text" globs=["**/*.pem"]`.
- **Dokaz:** `git ls-files backend/src/fiskal/ca` → prazno; `git check-ignore -v`
  → `.gitignore:10:*.pem`. Datoteke postoje samo lokalno (5. 7. 2026.).
  `git log --all -- 'backend/src/fiskal/ca/*'` → nikad commitano.
- **Posljedica:** svaki `git clone` (CI, drugi stroj, vanjski kontributor javnog
  repoa) ne može ni typecheckati ni deployati: bundler ne nalazi modul. Testovi
  prolaze samo zato što datoteke postoje na ovom Macu. Ni docs (`11-*`, README)
  ne spominju odakle PEM-ovi dolaze.
- **Zašto ignore pravilo postoji:** štiti privatne ključeve (`.pem` tenanata).
  Ali CA certifikati su **javni** (Fina ih objavljuje) — nisu tajna.
- **Popravak:**
  1. U `.gitignore` dodati iznimku ispod `*.pem`:
     `!backend/src/fiskal/ca/*.pem`.
  2. Commitati oba PEM-a. U `backend/src/fiskal/ca/README.md` (ili u `cis.ts`
     zaglavlje) navesti **izvor (URL na fina.hr), datum preuzimanja i SHA-256
     otisak** svakog CA-a, po konvenciji iz `CLAUDE.md` (svaka činjenica ima izvor).
  3. Dodati test koji provjerava da bundlani PEM parsira u `TrustedCert` i da
     subject sadrži „Fina Demo CA 2020" / „Fina RDC 2020".
  4. Dodati GitHub Actions workflow (`.github/workflows/ci.yml`): `npm ci`,
     `npm run typecheck`, `npm test`. Ovo je i zaštita od ponavljanja.
- **Rizik popravka:** nikakav.

### K2 (visoko) — Admin „Novi dokument" za FISKALNI_B2C ne računa ZKI i ne fiskalizira

- **Gdje:** `admin/app.ts:626-631` zove `kreirajDokument` i odmah redirecta.
  API put (`api/racuni.ts:509-523`, `izdajIOdgovori`) nakon `kreirajDokument`
  sinkrono zove `fiskalizirajRacun` (ZKI + JIR).
- **Posljedica:** račun izdan iz admina je u bazi `izdano` **bez ZKI-ja** dok ga
  cron sweep ne pokupi (do 15 min; `fiskal_pokusaja = 0` jest kandidat). PDF u
  tom prozoru nema blok „Fiskalni podaci". ZKI po zakonu mora biti na računu u
  trenutku izdavanja — ovo je formalna povreda, a ne samo kozmetika. Admin
  stranica računa nudi ručni gumb „⚡ Fiskaliziraj", što prikriva problem.
- **Popravak:** izvući zajednički servis `izdajDokument(env, tenant, model)`
  (vidi S2) koji radi: `kreirajDokument` → ako `FISKALNI_B2C` i nije
  `ponovljen` → `fiskalizirajRacun` → vrati `{ racun, fiskalizacija, ponovljen }`.
  API i admin ga oba zovu; API ga serializira u JSON, admin u redirect s
  porukom (`?ok=` kao kod `/racun/:id/fiskaliziraj`).
- **Test:** admin POST `/tenant/:id/dokument/novi` s `tip=FISKALNI_B2C` uz
  `cisVracaJir()` → redak ima `zki` i `jir` odmah; uz `cisNedostupan()` → ima
  `zki`, `fiskal_pokusaja = 1`, `fiskal_nak_dost = 1`.

### K3 (visoko) — Ne-PDV obveznik: API dodjeljuje kategoriju `Z` umjesto `E`

- **Gdje:** `api/racuni.ts:229` — default kategorije za slobodnu stavku je
  `s.pdvStopa === '0' ? 'Z' : 'S'`. `validacija.ts:322-334` (`provjeriPdvPravila`)
  za `!uSustavuPdv` provjerava **samo stopu**, ne kategoriju. Admin katalog
  (`admin/app.ts:474`) za ne-PDV tenanta ispravno stavlja `'E'`. Pravilo:
  `docs/knowledge/10-*` §14.6 — „Ne-PDV izdavatelj → … kategorija `E`".
- **Posljedica (CIS):** `mapirajZaCis` (`fiskalizacija.ts:94-104`) stavlja `Z`
  u `<Pdv><Porez><Stopa>0.00</Stopa>…`, a `E` u `IznosOslobPdv`. Ne-PDV obveznik
  (`USustPdv=false`) tako šalje PDV blok s nultom stopom umjesto iznosa
  oslobođenog PDV-a. ⚠️ Nije provjereno odbija li CIS TEST takav zahtjev;
  neovisno o tome podatak je sadržajno pogrešan (oslobođeno ≠ nulta stopa).
- **Posljedica (eRačun/doku):** `mapiranje.ts:97-108` šalje `taxCategory: 'Z'`
  umjesto `'E'`; uz to **nikad** ne šalje `taxExemptionReason`, a HR CIUS za `E`
  traži razlog izuzeća (BT-121, `10-*` §7.3). E2E na doku TEST-u 15. 7. je
  prošao sa `S-25` pa ovo nije bilo vidljivo.
- **Popravak:**
  1. `provjeriPdvPravila` neka **vraća normalizirane stavke**: za ne-PDV tenanta
     svaka stavka dobiva `pdvKategorija = 'E'` (i stopa `'0'`), uz postojeću
     klauzulu čl. 90. Pozivatelj (`kreirajDokument`) upisuje normalizirane.
  2. Alternativno/dodatno: zod `superRefine` na dokumentu ne može znati tenanta,
     pa normalizacija ostaje u servisu — ali default u `razrijesiStavke` neka
     ostane `Z` samo za PDV obveznika.
  3. `mapirajZaDoku`: za `E` postaviti `taxExemptionReason` iz
     `racun.klauzula_pdv` (čl. 90. st. 1.), za `AE` isto (čl. 75. st. 3.).
- **Test:** `napraviTenanta({ uSustavuPdv: false })` + POST s `pdvStopa: 0` bez
  kategorije → stavka `E`, `pdv_raspodjela.kategorija_pdv = 'E'`, potpisani XML
  sadrži `<tns:IznosOslobPdv>` i **ne** sadrži `<tns:Pdv>`; `mapirajZaDoku` daje
  `taxCategory: 'E'` + `taxExemptionReason`.

### K4 (srednje) — Hash idempotencije ovisi o tekstualnom obliku brojeva

- **Gdje:** `validacija.ts:58-67` (`iznosShema`): string ulaz vraća
  `String(v).trim()`, broj vraća `v.toFixed(2)`. `kolicina` isto
  (`validacija.ts:101-112`). `hashZahtjeva` (`api/racuni.ts:244-247`) hashira
  model **nakon** zoda.
- **Posljedica:** `netoCijena: "10"` i `netoCijena: 10` daju `'10'` i `'10.00'`
  → različit `zahtjev_hash` → **409 „iskorištena za drukčiji račun"** na
  legitimnom retryju ako klijent (npr. PHP `json_encode`, ili retry iz drugog
  koda) serijalizira broj drukčije. Test `idempotencija.test.ts:706` varira samo
  `pdvStopa` (koja jest normalizirana), pa ovo ne hvata. Isti podatak u bazi
  ostaje `'10'` umjesto `'10.00'` (kozmetika, ali nedosljedno).
- **Popravak:** `iznosShema` vraća `izCenti(uCente(v))`; `kolicina` vraća
  `izTisucinki(uTisucinke(v))` (dodati `izTisucinki` u `util.ts`, bez repnih
  nula ili s fiksne 3 — odabrati jedno i dokumentirati). Time hash postaje
  neovisan o obliku, a baza dosljedna.
- **Test:** tri POST-a s `'10'`, `10`, `'10.0'` i `kolicina` `'2'`, `2`, `'2.000'`
  → 201, 200, 200 (isti id).

### K5 (srednje, sigurnost) — GoTrue: e-mail bind ne provjerava potvrđenost adrese

- **Gdje:** `auth/gotrue.ts:33-40` čita samo `id` i `email` iz
  `GET /auth/v1/user`; `db.ts:1306-1320` (`findKorisnikTenant`) i
  `api/racuni.ts:143-146` vežu `user_id` na redak po `lower(user_email)` pri
  prvoj prijavi.
- **Posljedica:** ako dijeljeni GoTrue dopušta registraciju bez potvrde e-maila
  (`enable_confirmations=false` ili magic-link iznimke), napadač se registrira
  s e-mailom vlasnika tenanta i na prvoj prijavi dobiva članstvo (uloga
  `vlasnik`). Docs `16-*` §4 pretpostavljaju „verificirani e-mail iz JWT-a", ali
  kod to ne provjerava.
- **Popravak:** u `verificirajGotrueToken` pročitati `email_confirmed_at`
  (GoTrue ga vraća) i vratiti `emailPotvrdjen: boolean`; u middlewareu bind po
  e-mailu dopustiti **samo** ako je potvrđen (inače 403 s jasnom porukom).
  Match po `user_id` ostaje bez te provjere.
- **Test:** mock `fetch` prema `SUPABASE_URL` (nema testa za JWT put uopće —
  vidi §4) s i bez `email_confirmed_at`.

### K6 (srednje) — Vanjski `fetch` pozivi nemaju timeout

- **Gdje:** `auth/gotrue.ts:25` (na putu svakog dashboard zahtjeva),
  `eracun/doku.ts:119`, `email.ts:142` (Resend), `registri.ts:44,69,85,246,264`.
- **Posljedica:** zaglavljeni upstream drži Worker zahtjev do platformskog
  limita; dashboard korisnik čeka bez poruke; sweep eRačuna (kad dođe) bi se
  serijski zaglavio.
- **Popravak:** `util.ts` helper `sTimeoutom(ms)` → `AbortSignal.timeout(ms)`;
  GoTrue 5 s, doku 20 s, Resend 15 s, sudreg/VIES 10 s, firecrawl 70 s
  (dokumentirano ~60 s). Poruka greške neka razlikuje timeout od HTTP greške.

### K7 (srednje) — Lease se otpušta bez provjere vlasništva

- **Gdje:** `db.ts:933-935` (`otkljucajFiskalizaciju`: `SET
  fiskal_zakljucano_do = NULL WHERE id = ?`), poziva se u `finally`
  (`fiskalizacija.ts:170`).
- **Posljedica:** ako pokušaj A traje dulje od 60 s (CIS timeout je 15 s, ali
  D1 upisi + subtls handshake + hladni start mogu dodati), lease istekne,
  pokušaj B ga uzme, pa A-ov `finally` **obriše B-ov lease** → C može poslati
  paralelno s B-om. Vjerojatnost mala, posljedica (dva `RacunZahtjev` istog
  ZKI-ja) nije opasna za PU (isti ZKI, drugi IdPoruke), ali krši invarijantu
  koju lease obećava. Ni tenant nije u `WHERE`.
- **Popravak:** lease kao token: `zakljucajZaFiskalizaciju` vraća
  `{ id, istjece }` i otpuštanje radi `WHERE id = ? AND tenant_id = ? AND
  fiskal_zakljucano_do = ?` (točna vrijednost koju smo postavili). Bez nove
  kolone.
- **Test:** ručno postaviti lease u prošlost, pokrenuti A (CIS mock čeka na
  brani), B uzme novi lease, otpustiti A → B-ov lease mora ostati.

### K8 (srednje) — Lebdeći promise u subtls callbacku

- **Gdje:** `fiskal/cis.ts:116-118`: `(podaci) => { void pisac.write(podaci); }`.
- **Posljedica:** ako socket padne usred handshakea ili ga timer zatvori
  (`cis.ts:97-99`), `write` odbija bez `catch` → unhandled rejection u
  izolatu; u Workers runtimeu to završava u logu, ali može maskirati pravu
  grešku i, ovisno o verziji, srušiti invokaciju.
- **Popravak:** `pisac.write(podaci).catch((e) => { prvaGreska ??= e; })` i
  nakon `tls.read()` petlje, ako je `prvaGreska`, baciti nju. Također `timer`
  neka postavi `isteklo = true` da poruka greške kaže „timeout 15 s" umjesto
  generičkog „socket closed".

### K9 (srednje) — Nema globalnog `onError`

- **Gdje:** `index.ts` (nema `app.onError`), ni na `apiV1`/`admin`.
- **Posljedica:** svaka neuhvaćena iznimka (D1 greška, NaN bind iz K13, bug)
  vraća Honoov plain-text `Internal Server Error`. Webshop klijent dobiva
  ne-JSON tijelo na JSON API-ju; admin dobiva bijelu stranicu.
- **Popravak:** `apiV1.onError` → `c.json({ greska: 'Interna greška', id }, 500)`;
  `admin.onError` → HTML s porukom; oboje `console.error` s `c.req.method`,
  `c.req.path`, tenant id (ako je postavljen) i stackom. `id` = `crypto.randomUUID()`
  u odgovoru i logu, da se iz prijave klijenta nađe log.

### K10 (srednje) — `/api/v1/zdravlje` miješa zdravlje platforme i backlog tenanata

- **Gdje:** `index.ts:45-66`: `ok = cisOk && sweepSvjez && racunaBezJira24h === 0`.
- **Posljedica:** jedan tenant s isteklim certom (ili koji ignorira alarm)
  drži **globalni** health na 503 danima → vanjski monitor budi dežurnog za
  problem koji ima vlasnika i već ima alarm mailom. Dežurni nauči ignorirati
  503 → stvarni pad CIS echa prođe nezapaženo.
- **Popravak:** `ok` samo iz `cisOk && sweepSvjez` (platforma radi); backlog
  ostaje u tijelu kao `racunaBezJira24h` + novo polje `tenanataSBacklogom`
  (broj, bez id-eva). Ako treba, zaseban `GET /api/v1/zdravlje/backlog` → 503
  kad postoji backlog, za one koji baš to žele nadzirati.

### K11 (srednje) — Alarm `bez-retryja` po računu, do 100 mailova dnevno

- **Gdje:** `alarmi.ts:120-130` + `db.ts:1030-1041` (`LIMIT 100`).
- **Posljedica:** tenant s pogrešnim podacima (npr. nepoznat način plaćanja na
  50 računa) generira 50 zasebnih alarma dnevno platformi **i** tenantu.
- **Popravak:** agregirati po tenantu kao `bez-jira-24h` (ključ
  `bez-retryja:<tenant>`, tekst s prvih 20 brojeva računa i ukupnim brojem),
  interval 24 h. Zadržati i pojedinačni ključ samo ako je `broj = 1`? Ne —
  jednostavnije je uvijek agregirati.

### K12 (nisko) — `zaustaviStareBezJira` može neograničeno proširivati `fiskal_greska`

- **Gdje:** `db.ts:979-992`: `WHERE … AND (fiskal_nak_dost = 1 OR fiskal_pokusaja = 0)`;
  UPDATE postavlja `nak_dost = 0`, ali ne dira `pokusaja`, i omata poruku
  `'Automatska … zaustavljena … Zadnja greška: ' || COALESCE(fiskal_greska, '—')`
  bez `slice`.
- **Posljedica:** račun s `pokusaja = 0` stariji od 7 dana (moguće: Worker
  ubijen između INSERT-a i prvog pokušaja, a sweep 7 dana nije radio) matcha
  **svakih 15 min** i poruka se omata u samu sebe dok D1 ne odbije red.
- **Popravak:** u isti UPDATE dodati `fiskal_pokusaja = MAX(fiskal_pokusaja, 1)`
  i `fiskal_zadnji_pokusaj = datetime('now')`, pa red više ne matcha; poruku
  ograničiti na 2000 znakova (kao `zapisiFiskalGresku`).

### K13 (nisko) — Rute bez validacije `:id`

- **Gdje:** `api/racuni.ts:681` (`/racun/:id/pdf`), `:699` (`/racun/:id/posalji`),
  svi admin `Number(c.req.param('id'))` (`admin/app.ts:152,159,196,…`).
- **Posljedica:** `/racun/abc/pdf` → `Number('abc') = NaN` → D1 `bind(NaN)`
  baca → 500 (uz K9: plain-text). Ostale API rute to ispravno rade (400).
- **Popravak:** helper `idIzParametra(c, 'id'): number | Response` u
  `api/pomocno.ts`; koristiti svugdje. Admin isto (404 „Tenant ne postoji").

### K14 (nisko) — `racun.status = 'fiskaliziran'` znači dvije stvari

- **Gdje:** `db.ts:881-893` (`zapisiJir` → `'fiskaliziran'` kad stigne JIR) i
  `eracun/eracun.ts:29-32` (`statusRacunaIzDoku` → `'fiskaliziran'` kad doku
  javi `FISCALIZED`/`DELIVERED`).
- **Posljedica:** popisi/filteri po statusu ne razlikuju B2C JIR od eRačuna;
  `BEZ_JIRA` (`db.ts:943`) to zaobilazi jer gleda `tip_dokumenta`, ali svaki
  budući upit mora pamtiti tu zamku.
- **Popravak:** eRačun neka koristi `status = 'poslan'` + `eracun_status`
  (već postoji); prikaz izvodi iz `eracun_status`. `RacunRow.status` tipizirati
  kao union (vidi S5).

### K15 (nisko) — PDF ponovno računa osnovicu stavke vlastitom formulom

- **Gdje:** `pdf/racun-pdf.ts:235-241` (`Math.round(Number(s.kolicina) * 1000)`,
  `/ 1e7`) duplicira `validacija.ts:277-284`.
- **Posljedica:** dva mjesta istine za iznos retka; promjena zaokruživanja na
  jednom mjestu tiho razilazi PDF od baze.
- **Popravak (preporučeno):** migracija `0010` dodaje `stavka.iznos TEXT`
  (osnovica nakon popusta, u centima kao string) koju `kreirajDokument` upisuje
  iz `izracunajIznose().osnovicePoStavci`; PDF, API (`racunUOdgovor`) i admin je
  **čitaju**, ne računaju. Backfill postojećih redaka jednim UPDATE-om s istom
  formulom (SQLite) ili skriptom.
  Minimalno: izvući `osnovicaStavkeCenti(cijena, kolicina, popust)` u `util.ts`
  i zvati ga s oba mjesta.

### K16 (nisko, sigurnosna higijena) — `pkcs12_encrypted` se čuva, a nikad ne koristi

- **Gdje:** `db.ts:307-354` (`createCertifikat`), `admin/app.ts:369-372`,
  `kripto.ts:33-61`. Nakon parsiranja pri uploadu, P12 blob (koji sadrži isti
  privatni ključ) se više nigdje ne čita.
- **Posljedica:** dvostruka kopija ključa u bazi bez potrebe; veća površina
  kod curenja D1 backupa (`secrets/prod-backup-*.sql` sadrži te blobove).
- **Popravak:** migracija `0010`: rekreirati `certifikat` bez
  `pkcs12_encrypted`/`enc_iv` (SQLite ne dropa NOT NULL stupac in-place; ili
  `ALTER … DROP COLUMN` ako D1 verzija podržava — provjeriti). `fingerprint_sha256`
  ostaje (računa se iz P12 pri uploadu). Dokumentirati u `04-*` §7.

### K17 (nisko) — Sitna otkrivanja

- `index.ts:12-40`: `GET /` bez autentikacije vraća `brojaci` (broj tenanata i
  računa). Nije tajna, ali nije ni potrebno javno — ostaviti samo `servis`,
  `okolina`, `api` opis.
- `wrangler.toml:61`: PROD `DASHBOARD_ORIGIN` sadrži `http://localhost:3000`.
  Praktično za razvoj protiv proda, ali CORS s credentials prema localhostu na
  produkciji je nepotreban rizik; premjestiti samo u `[env.test.vars]`.

### K18 (nisko) — Verzija na dva mjesta

- `package.json` `"version": "0.4.0"` i `admin/views.ts:25` `APP_VERSION = 'v0.4.0'`.
  Faza 4 nije bumpala nijedno. **Popravak:** `import pkg from '../../package.json'`
  (`resolveJsonModule` je uključen) i `APP_VERSION = \`v${pkg.version}\``; bump na
  `0.5.0` uz ovaj refactor.

### K19 (nisko) — Zastarjeli indeksi

- `0004_fiskalizacija.sql:27` `ix_racun_ceka_jir` (`status = 'izdano'` samo —
  od 0009 sweep gleda i `storniran`; `ix_racun_sweep` ga pokriva).
- `0006_eracun_doku.sql:46` `ix_racun_eracun_ceka` — nijedan upit ga ne koristi.
- **Popravak:** `DROP INDEX` u `0010`.

### K20 (nisko) — Float u CIS mapiranju

- `fiskalizacija.ts:116-117`: `(oslobCenti / 100).toFixed(2)` — koristiti
  `izCenti(oslobCenti)` (postoji, integer-safe, negativni storno).

### K21 (nisko) — AE provjera prije razrješenja kataloga

- `api/racuni.ts:296` gleda `model.stavke[].pdvKategorija` **prije**
  `razrijesiStavke`; proizvod iz kataloga s `pdv_kategorija = 'AE'` prolazi na
  B2C račun. Premjestiti provjeru iza `razrijesiStavke` (na `razrijeseno.stavke`).

### K22 (nisko, perf) — D1 upis pri svakom API pozivu

- `api/racuni.ts:105` `touchApiKljuc` preko `waitUntil` → jedan `UPDATE` po
  zahtjevu. Na volumenu webshopa zanemarivo; ipak jeftino: `findTenantByApiKeyHash`
  neka vrati i `zadnje_koristen_at`, a touch se preskače ako je mlađi od 60 s.

### K23 (provjeriti) — Batch s 500 stavki

- `validacija.ts:202` dopušta do 500 stavki; `upisiRacun` gradi **jedan D1
  batch s 2 + 500 + n statementa** (`db.ts:638-641`). ⚠️ Nisam našao dokumentiran
  limit broja statementa u `db.batch()`, ali postoji limit duljine SQL-a i broja
  vezanih parametara po statementu (ovdje 18 — u redu). **Popravak:** dodati
  test s 500 stavki (i 50 PDV skupina); ako padne, spustiti `max` ili dijeliti
  stavke u više batcheva uz kompenzaciju kao u `upisiSkicu` (`db.ts:726-732`).

### K24 (dizajnersko pitanje, ne bug) — Storno na drugom prostoru/uređaju

- `api/racuni.ts:309-324`: `stornoZaId` kroz `POST /racun` ne traži isti
  `poslovniProstor`/`naplatniUredaj` kao original (`/racun/:id/storno` ih
  kopira, pa je tamo u redu). Fiskalizacija 1.0 ne veže storno na original, pa
  PU to ne vidi; ali izvještaji po prostoru postaju nekonzistentni. Preporuka:
  zahtijevati isti PP/NU (409), osim ako postoji poslovni razlog — tada
  dokumentirati u `10-*` §2.3.

---

## 4. Testovi — što nedostaje

Postojećih 49 testova su integracijski (worker → D1 → mock CIS). Pokrivaju Fazu 4
izvrsno, a faze 0–3 **samo neizravno**. Nijedna od ovih čistih funkcija nema
izravni test, iako o njima ovisi novac ili pravna valjanost:

| Funkcija | Datoteka | Što testirati |
|---|---|---|
| `izracunajIznose` | `validacija.ts:272` | zaokruživanje po skupini vs. po stavci (klasični primjer 3 × 0,33 @ 25 %), popust 33,33 %, negativne cijene (storno), miješane kategorije, `osnovicePoStavci` zbroj = `neto` |
| `uCente` / `izCenti` / `uTisucinke` | `util.ts:19-45` | `'-0.5'`, `'0.005'` (odbijeno), `'1e3'` (odbijeno), velike vrijednosti, `izCenti(-5)` = `'-0.05'` |
| `pomnoziCijenuKolicinu`, `pdvIznos` | `util.ts:48-58` | half-up na granici (`…5`), negativno |
| `provjeriPdvPravila` | `validacija.ts:316` | ne-PDV + stopa 0 → klauzula; ne-PDV + 25 → greška; AE miješan → greška (nakon K3: normalizacija na `E`) |
| `mapirajZaCis` | `fiskalizacija.ts:82` | S/AA → `pdv[]`; Z → `pdv[]` sa 0; E → `iznosOslobPdv`; O → `iznosNePodlOpor`; AE → greška; skica → greška; način plaćanja nepoznat → greška; `oibPrimatelja` iz kupca |
| `zahtjevXml` | `xml.ts:64` | prazan `pdv[]` → bez `<tns:Pdv>`; `IznosOslobPdv` prisutan; escape `&<>` u tekstu; `NakDost=true` |
| `parsirajOdgovor` | `cis.ts:217` | JIR; više `<Greska>`; SOAP `faultstring`; echo; entiteti; prazno tijelo |
| `parsirajHttp` / `dechunk` | `cis.ts:148,180` | chunked s ekstenzijama, `Content-Length`, UTF-8 u tijelu, neispravna statusna linija |
| `greskaJeRetryable` | `cis.ts:249` | tablica s001–s013 |
| `hub3Payload` / `epcQrPayload` | `hub3.ts:43,73` | transliteracija, limiti polja, negativni iznos baca, >331 B baca, 15-znamenkasti iznos |
| `kanonskiJson` + `hashZahtjeva` | `util.ts:88`, `racuni.ts:244` | redoslijed ključeva, `undefined`, ugniježđeni nizovi; nakon K4: `'10'`/`10`/`'10.0'` isti hash |
| `mapirajZaDoku` + `dokuTaxCategory` | `mapiranje.ts` | `S-25`, `Z`, `E` (+ razlog nakon K3), bez KPD → greška, bez IBAN-a uz `30` → greška, buyer `taxCompanyID` HR+OIB |
| `parsirajP12` AKD put | `certifikat.ts` | postoji samo FINA oblik (`test/certifikat.test.ts`); generirati EC-potpisan leaf u `globalni-setup.ts` da se pokrije `bag.asn1` grana (komentar `certifikat.ts:51-75` opisuje regresiju koja se već dogodila) |
| `zagrebDijelovi` | `zki.ts:11` | ljetno/zimsko, ponoć (`'24'` → `'00'`), 31. 12. 23:30 UTC → sljedeća godina |
| `godinaZagreb` | `util.ts:116` | 31. 12. 23:30 UTC = sljedeća godina u Zagrebu (prijelaz godine numeracije) |
| `izdajSkicu` utrka | `db.ts:740` | dva paralelna `POST /racun/:id/izdaj` → jedan 200, jedan 409, sekvenca +1 (komentar tvrdi, test ne postoji) |
| `oznaka_slijednosti = 'N'` | `db.ts:570-571` | dva uređaja istog prostora imaju **odvojene** slijedove; za `'P'` dijele |
| GoTrue middleware | `api/racuni.ts:109-153` | mock `fetch`: valjan JWT + `X-Tenant-Id` → 200; bez zaglavlja → 400; tuđi tenant → 403; email-bind na prvoj prijavi; `operater` → 403 na `/postavke/*`; cache 60 s |
| Admin `POST /tenant/:id/dokument/novi` | `admin/app.ts:550` | RACUN, skica, FISKALNI_B2C (K2) |
| `generirajRacunPdf` | `racun-pdf.ts:115` | barem: vraća PDF (`%PDF`), >1 stranice za 60 stavki, storno „ZA POVRAT", bez naloga za fiskalni, s HUB3 za RACUN |
| `/api/v1/zdravlje` nakon K10 | `index.ts:45` | backlog tenanta ne ruši `ok` |
| 500 stavki (K23) | `db.ts:567` | end-to-end |

Preporučena organizacija: `test/jedinicni/*.test.ts` za čiste funkcije (brzi,
bez D1), postojeći ostaju `test/*.test.ts`. Vitest config može imati dva
projekta, ali i jedan workers pool radi — čiste funkcije ne trebaju D1.

---

## 5. Što NE dirati (bez izričitog razloga i novog E2E-a na CIS TEST-u)

1. `fiskal/xml.ts` — bilo koja promjena bajtova (razmak, redoslijed atributa,
   escape) ruši potpis (`s004`). Samo premještanje datoteke je dopušteno.
2. `fiskal/zki.ts` — format datuma s razmakom vs. `T` i RSA-SHA1+MD5.
3. `fiskal/cis.ts:85-146` transport — osim K8 (catch na write) ništa.
4. `db.ts:567-797` (`upisiRacun`, `stavkeIPdvStmts`, `upisiSkicu`, `izdajSkicu`)
   — logika sekvence. Smije se premjestiti u `db/racun.ts` **bez promjene SQL-a**.
5. Migracije `0001`–`0009` — nikad se ne mijenjaju; sve ide u `0010+`.
6. Trigger `tr_storno_provjera` / `tr_storno_puni` — testirani na razini baze.
7. `kripto.ts` — format omota (IV-ovi, hex) je kompatibilnost s postojećim
   redovima u PROD bazi.
8. Hrvatske poruke grešaka koje testovi matchaju regexom (`/Certifikat je
   istekao/`, `/premašuje preostali iznos/`, `/već u cijelosti storniran/` …) —
   promjena teksta = promjena testa, svjesno.
9. Ugovor API-ja prema webshopu (`docs/handoff/faza-4-*` §3): nazivi polja,
   statusi, `Idempotent-Replay`, 200/201/409 semantika. crosulja.hr se na to
   oslanja.

---

## 6. Plan refactora — redoslijed i pravila

**Pravila za svaki korak:** zaseban commit (hrvatska poruka, `Co-Authored-By`),
prije commita `cd backend && npm run typecheck && npm test` mora biti zelen
(49 + novi testovi). Behaviour-mijenjajući koraci (3, 4, 5) dobivaju **prvo
test koji pada**, pa popravak. Bez deploya u ovoj sesiji; na kraju `/wrap-up`.
Ne mijenjati `wrangler.toml` osim K17.

### Korak 0 — CI i K1 (pola sata)
1. `.github/workflows/ci.yml`: `ubuntu-latest`, Node 22, `npm ci`,
   `npm run typecheck`, `npm test` (vitest-pool-workers radi u CI-ju bez
   Cloudflare računa jer je `remoteBindings: false`). Push → workflow mora pasti
   zbog K1. To je dokaz nalaza.
2. K1: iznimka u `.gitignore`, commit PEM-ova, `ca/README.md` s izvorom/otiskom,
   test parsiranja CA-a. CI zelen.

### Korak 1 — Mehaničko razdvajanje `db.ts` (bez promjene ponašanja)
- Novi direktorij `src/db/` s modulima po domeni:
  `tenant.ts` (tenant, api_kljuc, korisnik_tenant), `prostor.ts` (prostor,
  uređaj, operater), `certifikat.ts`, `doku.ts`, `racun.ts` (upis, skica,
  izdaj, čitanje, kontekst, kupac), `fiskal.ts` (ZKI/JIR/greška/lease/sweep/
  BEZ_JIRA/log poruka), `nadzor.ts` (sustav_stanje, alarmi, brojaci),
  `katalog.ts` (proizvod, KPD), `greske.ts` (S4).
- `src/db/index.ts` = barrel koji re-exporta **sve** postojeće nazive. Stari
  `import … from '../db'` i dalje radi — **nijedan drugi file se ne mijenja** u
  ovom koraku. Obrisati `src/db.ts`.
- Komentare s pravnim referencama premjestiti zajedno s funkcijama.
- Provjera: `git diff --stat` dira samo `src/db*`; testovi zeleni.

### Korak 2 — Razdvajanje `api/racuni.ts` i izvlačenje servisa izdavanja
- `src/api/auth.ts`: CORS + Bearer middleware (`racuni.ts:66-154`) kao
  `export const apiAuth = …`; `RUTE_BEZ_TENANTA`.
- `src/dokumenti/izdavanje.ts`: `kreirajDokument`, `razrijesiStavke`,
  `hashZahtjeva`, `ishodPostojeceg`, `SEKVENCA_ZA_TIP`, `TIP_U_DB` + **novi**
  `izdajDokument(env, tenant, model)` koji objedinjuje kreiranje i sinkronu
  fiskalizaciju (temelj za K2). `KreiranjeIshod` ostaje, ali statusi 400/404/409
  neka postanu `vrsta: 'validacija' | 'ne_postoji' | 'sukob'` koje API sloj
  mapira u HTTP (admin ih mapira u poruke) — HTTP kodovi ne pripadaju servisu.
- `src/api/serializacija.ts`: `racunUOdgovor`, `fiskalizacijaIzRetka`, popis.
- `src/api/pomocno.ts`: `idIzParametra` (K13), `cijeliBroj` zod helper,
  `jsonTijelo(c)` (ponavljani `c.req.json().catch(() => ({}))`).
- `src/api/racuni.ts`: samo rute dokumenata; `src/api/postavke.ts`: postavke +
  moji-tenanti + ja; `src/api/index.ts` sklapa `apiV1`.
- Admin `app.ts` uvozi `izdajDokument` iz `dokumenti/izdavanje.ts` (ne više iz
  `api/racuni.ts` — admin koji uvozi API modul je smjer ovisnosti naopačke).

### Korak 3 — Ispravci ponašanja s testom koji pada prvi
Redom: **K2** (admin fiskalizira), **K3** (kategorija `E` + `taxExemptionReason`),
**K4** (normalizacija iznosa/količine; migracija nije potrebna — stari redci s
`'10'` i dalje parsiraju), **K21** (AE iza kataloga).

### Korak 4 — Robusnost i sigurnost
**K5** (email_confirmed_at), **K6** (timeouti), **K7** (lease token), **K8**
(catch na write), **K9** (onError), **K12** (zaustavi + pokusaja), **K13**.

### Korak 5 — Operativa
**K10** (zdravlje), **K11** (agregirani alarm). Oba mijenjaju `test/robusnost.test.ts`
očekivanja — svjesno, s obrazloženjem u commitu.

### Korak 6 — Migracija `0010` (jedna, za sve sheme)
`stavka.iznos` + backfill (K15), drop `pkcs12_encrypted`/`enc_iv` (K16, ako D1
podržava `DROP COLUMN`; inače rekreacija tablice po uzoru na `0002`), drop
zastarjelih indeksa (K19). Lokalno `wrangler d1 migrations apply --local`,
testovi zeleni. **Deploy migracije na TEST/PROD nije dio ove sesije** —
zabilježiti u HANDOFF kao sljedeći korak koji traži odobrenje.

### Korak 7 — Tipovi i sitnice
S5 (`RacunStatus` union, `Env.OKOLINA: 'test' | 'prod'`, jedan `okolinaIzEnv` u
`src/okolina.ts`, obrisati `okolinaZaDoku`), S4 (`db/greske.ts`:
`jeUniqueGreska(e, stupac?)` zamjenjuje šest `String(e).includes('UNIQUE')`),
S6 (`operaterBezPostavki(c: ApiKontekst)`), K14, K17, K18, K20, K22.

### Korak 8 — Testovi iz §4
Najprije novčane funkcije (`izracunajIznose`, `uCente`), zatim CIS mapiranje i
parsiranje, zatim GoTrue put, zatim ostalo. K23 (500 stavki) ovdje.

### Korak 9 — Admin helper (S3), opcionalno
`admin/app.ts` ima 10 ruta istog oblika: učitaj `detaljData` → `parseBody` →
validiraj → na grešku `renderTenantDetaljPage({ ...d, greska })` sa statusom →
inače redirect. Helper `akcijaTenanta(c, async (d, form) => string | null)`
smanji ~150 redaka. Nije hitno; raditi samo ako koraci 0–8 stanu u budžet.

---

## 7. Procjena i rizici

| Korak | Trajanje (Opus, fokusirano) | Rizik | Kako se rizik vidi |
|---|---|---|---|
| 0 | 0,5 h | nikakav | CI crven → zelen |
| 1 | 1 h | nizak (mehanički) | testovi + `git diff --stat` |
| 2 | 1,5 h | nizak-srednji | testovi; admin test za K2 |
| 3 | 1,5 h | srednji (mijenja podatke koji idu prema CIS-u) | novi testovi; **E2E na CIS TEST-u s ne-PDV tenantom** prije deploya (nije u ovoj sesiji) |
| 4 | 1,5 h | nizak | testovi |
| 5 | 0,5 h | nizak | izmijenjeni testovi |
| 6 | 1 h | srednji (shema) | lokalne migracije; backfill upit provjeriti na kopiji PROD backupa iz `secrets/` |
| 7 | 1 h | nizak | typecheck |
| 8 | 2 h | nikakav | — |

Ukupno ~10 h rada; razumno je podijeliti u dvije sesije (0–4, pa 5–8) s
`/wrap-up` između.

---

## 8. Otvorena pitanja za vlasnika (ne blokiraju refactor)

1. **K3/CIS:** želimo li prije deploya E2E na CIS TEST-u s ne-PDV tenantom
   (`USustPdv=false` + `IznosOslobPdv`)? Preporučujem da — to je jedina stvar
   u ovom planu koju testovi ne mogu dokazati.
2. **K5:** kako je konfiguriran dijeljeni GoTrue (`enable_confirmations`)?
   Ako je potvrda obavezna, K5 je dubinska obrana; ako nije, K5 je rupa.
3. **K16:** smije li se P12 blob obrisati iz baze (i iz budućih backupa)? Nema
   poznate upotrebe; FINA/AKD P12 vlasnik ionako čuva sam.
4. **K24:** je li storno na drugom prostoru/uređaju poslovno dopušten?
5. **K10:** tko gleda `/zdravlje` — vanjski monitor ili samo čovjek? To
   određuje je li razdvajanje platforma/backlog potrebno.

---

## 9. Metoda pregleda (za reproducibilnost)

- Pročitan **cijeli** `backend/src` (≈6.900 redaka), `backend/test`, migracije
  `0001`–`0009`, `wrangler.toml`, `package.json`, `vitest.config.ts`, skripte,
  `HANDOFF.md`, `PLAN.md`, `docs/handoff/faza-4-*`, `docs/research/faza-4-*`,
  relevantni dijelovi `02-*` i `10-*`.
- Pokrenuto: `git log` s trailerima, `git blame` po datoteci, `git ls-files`,
  `git check-ignore`, `npm run typecheck`, `npx vitest run` (49/49, 15,3 s).
- Nije pokrenuto: deploy, `wrangler dev`, pravi CIS, doku, GoTrue. Nalazi koji
  bi to tražili označeni su ⚠️ (K3 ponašanje CIS-a, K23 limit batcha).
- Nije mijenjana nijedna datoteka osim ovog dokumenta.

# Odluke — dashboard: passkey i pozivnice

Svaka odluka ima broj, datum, razlog i uvjet revizije. Odluka se ne briše: zamjenjuje je nova
odluka koja to kaže. Sesija SN numerira od N00 (S1 od 100, S2 od 200…).

## S0 (23. 11. 2026.)

**1. Opseg.** Prijava u customer dashboard prelazi s GoTrue (Google, e-mail OTP) na passkey,
s pozivnicom kao jedinim ulazom. Sve u fiskal Workeru i D1. Ne mijenja se: `dfk_` API,
`/admin` prijava (Access + passkey), model tenanta i uloga (`vlasnik`/`knjigovodja`/`operater`).
*Razlog:* korisnikova odluka; neovisnost o `api.domovina.ai`. *Revizija:* nikad za `dfk_` i `/admin`.

**2. Dashboard na istom Workeru.** Next static export s `basePath: "/app"` servira fiskal Worker
kroz static assets na `fiskal.domovina.ai/app` i `fiskal-test.domovina.ai/app`. Isti origin
znači kolačić `__Host-`, nema CORS-a za dashboard, rpID = hostname (kao admin u
`src/admin/auth/passkey.ts`). Pages projekti i `fiskal-app.domovina.ai` idu u mirovinu (S7).
*Razlog:* korisnikova odluka; passkey i kolačić su vezani uz domenu, a `pages.dev` za TEST bi
bio cross-site. *Revizija:* ako Workers assets ne mogu servirati export (mjeri S4).

**3. GoTrue odmah van, bez paralelnog razdoblja.** Nema prijelaza u kojem rade oba načina.
Postojeći korisnici dobiju pozivnicu odmah nakon PROD deploya (S6). *Razlog:* korisnikova
odluka; malo stvarnih korisnika. *Revizija:* ako S6 mjerenje pokaže više aktivnih korisnika nego
što korisnik može obavijestiti u jednom danu.

**4. Pozivnice izdaju superadmin i vlasnik.** Superadmin u `/admin` za bilo koji tenant i ulogu.
Vlasnik u dashboardu za svoj tenant, samo uloge `knjigovodja` i `operater`. *Razlog:* korisnikova
odluka. *Revizija:* zahtjev da vlasnik poziva drugog vlasnika ide kroz admina.

**5. Odvojene tablice od admina.** `korisnik`, `korisnik_passkeys`, `korisnik_sesije`,
`korisnik_izazovi`, `pozivnice`; ništa iz `admin_*` se ne dijeli, kolačić ima drugo ime
(`__Host-fiskal_app`). Passkey registriran na dashboardu ne otvara `/admin` i obrnuto, iako je
rpID isti. *Razlog:* granica ovlasti ostaje u shemi, ne u `if`-u. *Revizija:* nema.

**6. Veza s tenantima ostaje po e-mailu.** `korisnik_tenant` se ne gradi iznova: veže se
`lower(korisnik_tenant.user_email) = korisnik.email`. Stupci `user_id`/`bound_at` (GoTrue) ostaju
u shemi neiskorišteni dok ih kasnija migracija ne makne. *Razlog:* manja migracija, nema
kopiranja tablice u produkciji. *Revizija:* S1 smije odlučiti drukčije ako je join neizvediv u
`src/db/tenant.ts`, uz zapis u bloku 100.

**7. Pozivnica.** Po uzoru na logomedo (`docs/admin.md`): token u fragmentu linka
(`/app/poziv#…`), u D1 samo sha-256; vrijedi 72 h i jednom; troši se tek nakon uspješne
registracije passkeya, pa „Odustani” ne troši link; nova pozivnica za isti e-mail i tenant
poništava staru; može se opozvati. Pozivnica nosi `tenant_id` i `uloga`; „novi passkey”
postojećem korisniku nosi `korisnik_id` bez tenanta. Link se prikaže jednom, šalje ga čovjek
(Worker ne šalje mail u ovom lancu). *Revizija:* slanje maila kroz `src/email.ts` je zaseban posao.

**8. Sesija i CSRF.** Kao admin: 12 h trajanja, istek nakon 2 h neaktivnosti, `HttpOnly`,
`Secure`, `SameSite=Lax`, `Path=/`. Svaki zahtjev s kolačićem koji nije GET/HEAD mora imati
`Origin` jednak originu Workera. Deaktivacija korisnika odmah briše njegove sesije.

**9. Testovi.** Vitest u `@cloudflare/vitest-pool-workers` kao postojeći `test/admin-prijava.test.ts`;
bez mreže, `skipped 0`. WebAuthn verify u testovima mockan kao u logomedo `passkey.test.ts`.

## S1 (23. 11. 2026.)

**100. Migracija `0014_dashboard_passkey.sql`.** Prvi slobodan broj (0013 je u međuvremenu commitan).
`korisnik.email` i `pozivnice.email` imaju `CHECK (email = lower(trim(email)))`, pa je `UNIQUE` na
stupcu ujedno jedinstvenost „u lower” i `ON CONFLICT (email)` radi bez izraznog indeksa.
*Revizija:* nema.

**101. Pravila pozivnice u shemi.** `pozivnice` ima dva CHECK-a: ili `tenant_id + uloga` bez
`korisnik_id` (za tenant), ili `korisnik_id` bez tenanta i uloge („novi passkey”); i
`stvorio_tip = 'admin' OR uloga IN ('knjigovodja','operater')`. Vlasnik tako ni izravnim upisom
ne izda pozivnicu za vlasnika ni za novi passkey. *Revizija:* ako vlasnik smije pozivati vlasnika (odluka 4).

**102. Izazovi vezani uz subjekt.** `korisnik_izazovi` ima `korisnik_id` (namjena `register`,
prijavljeni dodaje ključ) i `poziv_id` (namjena `poziv`), ne e-mail kao admin: izazov iz jedne
pozivnice ne vrijedi za drugu pozivnicu istog e-maila u drugom tenantu. *Revizija:* nema.

**103. Uvjeti iskorištenja u samom UPDATE-u (potvrđeno 23. 11. 2026.).** Potrošnja pozivnice (`pozivnice.ts`
`SMIJE`) uspije samo ako: pozivnica je otvorena; korisnik s tim e-mailom nije deaktiviran, osim
kad je pozivnicu za tenant izdao admin (tada ga iskorištenje reaktivira, kao logomedo 105);
„novi passkey” traži da korisnik postoji, da je e-mail njegov i da je aktivan; korisnik nema već
5 ključeva. Ista provjera je u `provjeri`, pa S2 može odbiti prije WebAuthn ceremonije.
*Razlog:* vlasnik ne smije poništiti adminovu deaktivaciju; granica od 5 ključeva vrijedi i za pozivnice.
*Revizija:* S3 ako admin treba eksplicitnu reaktivaciju bez pozivnice.

**104. Postojeći korisnik i nova pozivnica za tenant (potvrđeno 23. 11. 2026.).** Aktivni korisnik koji je već
aktivan član tog tenanta ne dobiva pozivnicu (`vec_clan`; promjena uloge ide izravno, S2/S3).
Aktivni korisnik pozvan u **drugi** tenant iskorištava pozivnicu kao i novi: registrira još jedan
passkey (do 5). *Razlog:* jedan tok za sve pozivnice u S1. *Revizija:* S2 smije dodati
„prihvati pozivnicu prijavljen” (bez novog passkeya) ako se pokaže potrebnim.

**105. Članstvo pri iskorištenju.** Postojeći redak `korisnik_tenant` (isti tenant,
`lower(user_email)` = e-mail pozivnice, i stari GoTrue s velikim slovima) dobiva ulogu iz pozivnice
i `aktivan = 1`; inače se upisuje novi redak s e-mailom malim slovima. Join po e-mailu (odluka 6)
je izvediv, `src/db/tenant.ts` se u S1 ne dira. *Revizija:* nema.

**106. Sesija.** Metode `passkey` i `poziv` (prijava odmah nakon iskorištene pozivnice).
`getSession` vraća null i za deaktiviranog korisnika (uz `obrisiSveSesije` pri deaktivaciji);
sve funkcije primaju `sada` radi testova vremena. *Revizija:* nema.

**107. `test/backup.test.ts` briše tablice u krugovima.** DROP po redoslijedu `sqlite_master` pada
s „no such table: main.tenant” jer `korisnik` ima dijete `pozivnice` s FK na već obrisani `tenant`
(ni obrnuti `rowid` ne pomaže: migracije prepisuju tablice). Test sada ponavlja neuspjele DROP-ove
dok ne nestane sve. Produkcijski restore ide u praznu bazu i ne briše ništa, pa ga ovo ne dira.
*Revizija:* nema.

## S2 (23. 11. 2026.)

**200. Gdje žive rute.** Prijava, pozivnica i odjava (`src/api/app-auth.ts`, `appAuthJavno`) ne
traže sesiju, pa su montirane na `/api/v1` u `src/index.ts` **prije** `apiV1` (kao `/zdravlje`).
Moji passkeyi (`passkeyRute`) i članovi (`src/api/clanovi.ts`) idu kroz `apiAuth`. Origin
provjera u javnom sub-appu stoji samo na njegovim putanjama: `use('*')` bi, montiran uz `apiV1`,
hvatao i `dfk_` mutacije webshopova (test to pokriva). *Revizija:* nema.

**201. Kolačić samo bez `Authorization`.** `apiAuth` gleda kolačić `__Host-fiskal_app` tek kad
zaglavlja `Authorization` nema; `dfk_` i GoTrue grana ostaju prve i nepromijenjene. `dfk_` uz
kolačić ne traži `Origin`: stranica s tuđeg origina ne može poslati `Authorization` bez CORS
preflighta. *Revizija:* S5 (GoTrue grana van).

**202. Origin.** Za svaku ne-GET/HEAD s kolačićem i za sve javne rute prijave (i login CSRF)
`Origin` mora biti točno `new URL(req.url).origin` (shema + host + port). Nedostaje ili je drugi
→ 403. Preglednik ga šalje sam na same-origin `fetch` POST/DELETE, pa app (S4) ne radi ništa
posebno. *Revizija:* nema.

**203. `ApiKorisnik` je unija s `izvor`** (`'gotrue'` | `'passkey'`). Passkey grana veže članstvo
`lower(user_email) = korisnik.email` (`findClanstvoPoEmailu`, `listMojiTenantiPoEmailu`), bez obzira
na GoTrue `user_id` u retku. `/ja` za passkey vraća `{email, ime, korisnikId, prijava: {metoda, od, do},
tenanti}`; za GoTrue je oblik isti kao prije. *Revizija:* S5 (unija postaje jedan oblik).

**204. Statusi i oblici.** Pozivnica koja ne vrijedi (istekla, iskorištena, opozvana, kriv token)
→ 410 s jednom porukom; neuspjela prijava → 401 bez razloga; `poziv/potvrdi` → 201 + kolačić.
Moji passkeyi: `GET /passkeyi` (uz `dodavanje`: razlog odbijanja ili null), `POST /passkeyi/opcije`
i `/potvrdi` (svježa prijava < 10 min, bilo kojom metodom), `DELETE /passkeyi/:id` (zadnji → 409;
uvjet je u samom DELETE-u, `obrisiKljucOsimZadnjeg`). Tijela: `{token}`, `{token, odgovor, oznaka}`,
`{odgovor}`. *Revizija:* S4 ako app treba drukčiji oblik.

**205. Članovi (potvrđeno 23. 11. 2026.).** Samo `uloga = 'vlasnik'` u tom tenantu (do S5 i uz GoTrue prijavu).
Vlasnik poziva knjigovođu/operatera (`vlasnik` → 403, `vec_clan`/`neaktivan` → 409, ostalo 400),
opoziva pozivnice svog tenanta (tuđa → 404) i deaktivira **samo knjigovođu ili operatera**, nikad
sebe (409) ni drugog vlasnika (403: to radi admin, S3). Deaktivacija = `korisnik_tenant.aktivan = 0`
i opoziv otvorenih pozivnica tog e-maila u tenantu; sesije ostaju (korisnik može biti u drugim
tenantima), a pristup tenantu prestaje sljedećim zahtjevom jer se članstvo provjerava svaki put.
Ponovni ulazak je nova pozivnica (novi passkey, odluka 104). Popis pozivnica pokazuje samo
`stvorioTip`, ne e-mail administratora. Link pozivnice vraća samo `POST /clanovi/pozivnica`.
*Revizija:* ako korisnik želi da vlasnik deaktivira suvlasnika.

**206. WebAuthn u testovima kroz objekt `webauthn`.** `vi.mock('@simplewebauthn/server')` prestaje
djelovati čim je `src/app-auth/passkey.ts` u grafu `src/index.ts`: vitest-pool-workers učita main
modul prije testne datoteke, pa je modul već evaluiran s pravim funkcijama (izmjereno: 4 S1 testa
pala). Provjere sad idu kroz `webauthn.verify*`, a `test/pomocno/webauthn-mock.ts` ih zamijeni
`vi.spyOn` (obrazac `postaviCisTransport`). *Revizija:* nema.

**207. `X-Tenant-Id` kroz `Number.isSafeInteger`** u obje korisničke grane (prije `isInteger`).
Sitno; ponašanje za ispravne vrijednosti isto. *Revizija:* nema.

## S3 (23. 11. 2026.)

**300. Trag radnji: nova tablica `korisnik_aktivnost` (migracija 0015).** Fiskal nije imao tablicu
aktivnosti/audita (`poruka_log` je samo CIS). Zapis: `tko` (e-mail admina ili vlasnika; `skripta` za
bearer), `tko_tip`, `radnja` (`poziv.izdan`, `poziv.opozvan`, `korisnik.deaktiviran`, `korisnik.aktiviran`,
`clanstvo.deaktivirano`, `clanstvo.aktivirano`), `email`, `korisnik_id`, `tenant_id`, `pozivnica_id`,
`detalji` (JSON). Bez stranih ključeva (zapis preživi brisanje tenanta) i bez prije/poslije i poništavanja
(za razliku od logomedo `aktivnost`). Bilježe se i vlasnikove radnje iz `/api/v1/clanovi`. Iskorištenje
pozivnice nije zaseban zapis: vidi se u `pozivnice.iskoristena_at`/`passkey_id`. Gdje radnja već ide
batchem (deaktivacija, članstvo), zapis je u istom batchu; kod izdavanja i opoziva ide odmah iza. Prikaz:
zadnjih 50 na `/admin/korisnici`. *Revizija:* nema.

**301. Gdje je UI.** Nova stranica `/admin/korisnici` (`src/admin/korisnici.ts`, `views-korisnici.ts`,
link „Korisnici” u navigaciji) za cijeli račun: nova pozivnica (e-mail, ime, tenant, uloga), otvorene
pozivnice, korisnici s tenantima i ulogama, „Novi passkey”, deaktiviraj/aktiviraj, trag. Detalj tenanta
dobiva sekciju „Korisnici dashboarda”: isti obrazac s tim tenantom, otvorene pozivnice tenanta s
opozivom (vraća na tenant, `povratak` samo `/admin/tenant/<id>`), članovi sa stanjem passkey računa i
(de)aktivacijom članstva. Link pozivnice prikazuje se samo u odgovoru na izdavanje (uvijek na
`/admin/korisnici`). *Revizija:* nema.

**302. Admin deaktivacija korisnika** = `korisnik.aktivan = 0` + brisanje svih sesija + opoziv svih
otvorenih pozivnica tog e-maila (svi tenanti) + zapis s brojem obrisanih sesija i opozvanih pozivnica.
Passkeyi i retci `korisnik_tenant` ostaju; „Aktiviraj” vraća pristup bez pozivnice. Ponovljena radnja
(već deaktiviran / već aktivan) ne radi ništa i ne ostavlja zapis. „Novi passkey” deaktiviranom → 409.
*Revizija:* nema.

**303. Članstvo u tenantu iz admina (potvrđeno 23. 11. 2026.).** Postojeća ruta `/admin/tenant/:id/korisnici/:kid/
(de)aktiviraj` ostaje (admin smije i vlasnika i vraćanje bez pozivnice, odluka 205); deaktivacija
članstva sada opoziva i otvorene pozivnice tog e-maila u tenantu (isto kao vlasnik) i ostavlja zapis.
Uklonjen je samo `POST /admin/tenant/:id/korisnici` (dodavanje e-maila bez pozivnice); `createKorisnikTenant`
u `src/db` ostaje zbog GoTrue testova do S5. *Revizija:* S5 (GoTrue van).

**304. Statusi admin ruta.** Odbijena pozivnica re-renderira stranicu s porukom: 400 (e-mail, bez tenanta),
404 (nema tenanta/korisnika, opoziv nepostojeće ili zatvorene), 409 (`vec_clan`, `neaktivan`). Uspjeh
izdavanja i „Novi passkey” → 200 sa stranicom i linkom; ostalo → 303. *Revizija:* nema.

## S4 (23. 11. 2026.)

**400. Serviranje.** App je Next static export s `basePath: "/app"`, `trailingSlash: false`;
`backend/scripts/build-app.sh` builda app (putanja `FISKAL_APP_DIR`, zadano repo na DOMOVINA2TB)
i kopira `out/` u `backend/app-dist/app/` (gitignored). `[assets]` i `[env.test.assets]`:
`directory = "./app-dist"`, `run_worker_first = ["/api/*", "/admin/*"]`, `not_found_handling`
ostaje `none` (nema dinamičkih ruta). `deploy` i `deploy:test` zovu `build:app`; skripta upozori
ako app ima necommitane promjene, ali ne staje. Ista app ide na TEST i PROD (relativni API).
Nalaz: `../research/2026-11-23-workers-assets-next-basepath.md`. *Revizija:* nema.

**401. Zaglavlja za `/app/*` (potvrđeno; CSP dodan u S7, odluka 701).** `build-app.sh` piše `app-dist/_headers`:
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
Bez CSP-a (Next inline skripte traže hash/nonce). *Revizija:* ako se želi CSP.

**402. Pozivnica u appu.** Token se čita iz `location.hash` i odmah briše iz adrese
(`history.replaceState`), šalje se samo u tijelu POST-a. Posljedica: reload stranice nakon
čitanja daje „Link nije potpun”, pa korisnik ponovno otvara link iz poruke (neuspjeli pokušaj
u istoj stranici dohvaća nove opcije sam). Nakon uspjeha `router.replace("/dashboard")`.
*Revizija:* nema.

**403. Stanje prijave iz `/api/v1/ja`.** `AuthProvider` drži `ja` (200 = prijavljen, inače null);
svaki API 401 šalje događaj `fiskal:odjavljen` pa se vraća prijava. Odjava = `POST /odjava`
pa `ja = null`. Prijava nema registraciju (ulaz je samo pozivnica). *Revizija:* nema.

**404. Nove stranice:** `/app/dashboard/passkeyi` (svi) i `/app/dashboard/clanovi` (link u
navigaciji samo kad je odabrani tenant `vlasnik`; backend ionako vraća 403). Brisanje zadnjeg
passkeya je onemogućeno i u UI-ju (server 409). Poruka za Windows bez Hello PIN-a / Chrome bez
sinkronizacije je sklopivi tekst „Windows traži USB sigurnosni ključ?” na prijavi i pozivnici.
*Revizija:* nema.

**405. Lokalni razvoj samo kroz Worker.** `npm run dev:app` u backendu
(`wrangler dev --local-upstream localhost:8787`). Bez `--local-upstream` wrangler dev Workeru
daje host rute (`fiskal.domovina.ai`), pa rpID i linkovi pozivnica ne odgovaraju localhostu.
`next dev` na :3000 ostaje samo za izgled (nema `/api/v1`). Iz appa su maknuti `build:test`,
`deploy`, `deploy:test` (Pages) i sve varijable okoline; README appa prepisan sada jer uvjet
„`grep -ri supabase` prazan” uključuje README (S7 ga samo dopunjuje mirovinom Pagesa).
*Revizija:* S7.

## S5 (23. 11. 2026.)

**500. GoTrue i CORS van iz `/api/v1`.** Obrisani `src/auth/gotrue.ts`, GoTrue grana `apiAuth`,
`apiCors`, `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DASHBOARD_ORIGIN` (env i `wrangler.toml` obje
okoline), `TIMEOUT_MS.gotrue`, `test/gotrue.test.ts` (7 testova). Bearer koji nije `dfk_` → 401.
CORS za `dfk_` nije trebao: `DASHBOARD_ORIGIN` je sadržavao samo dashboard domene i localhost, pa
browser webshop ni prije nije dobivao `Access-Control-Allow-Origin` (webshopovi zovu server-side).
Novi testovi: JWT → 401, `/ja` bez prijave → 401, preflight/GET sa starog origina bez ACAO.
*Revizija:* nema.

**501. Stupci `korisnik_tenant.user_id` i `bound_at` ostaju (potvrditi).** Ništa ih više ne čita ni
ne piše; brisanje stupca u D1/SQLite znači rebuild tablice uz FK-ove, a dobitak je nula. Bez
migracije u S5. *Revizija:* ako se ikad radi rebuild `korisnik_tenant` iz drugog razloga.

**502. Uklonjene DB funkcije GoTrue puta:** `findKorisnikTenant`, `bindKorisnikTenant`,
`listMojiTenanti`, `createKorisnikTenant` (zatvara reviziju odluke 303). Članstvo ide samo kroz
`findClanstvoPoEmailu` / `listMojiTenantiPoEmailu`. `ApiKorisnik` ostaje objekt s `izvor: 'passkey'`
(postojeće provjere `izvor === 'passkey'` ostaju valjane). *Revizija:* nema.

## S6 (23. 11. 2026.)

**600. PROD deploy bez pozivnica.** Mjerenje prije deploya: PROD `korisnik_tenant` ima **0** redova
(2 tenanta), nitko se nikad nije prijavio u stari dashboard
([../research/2026-11-23-prod-korisnik-tenant-mjerenje.md](../research/2026-11-23-prod-korisnik-tenant-mjerenje.md)).
Uvjet revizije odluke 3 nije ispunjen, a uvjet „za svaki aktivni red postoji pozivnica” je prazno
ispunjen. S6 ne izdaje nijednu pozivnicu; prvu PROD pozivnicu (npr. vlasnik tenanta 2) korisnik
izdaje sam u `/admin/korisnici` kad mu zatreba. *Revizija:* nema.

**601. Redoslijed PROD-a.** `migrations apply DB --remote` (0014 ✅, 0015 ✅), zatim `npm run deploy`
(Worker verzija `643fffac-78e7-45f9-98b2-bd626d31d6bc`, 45 assetsa pod `/app`). Ispravak S5
napomene: `npm run deploy` **ima** `predeploy` (typecheck + testovi), pa ih pokreće; S6 ih je
pokrenuo i ručno. *Revizija:* nema.

**602. Stvarni `dfk_` zahtjev nakon deploya nije viđen u S6 (potvrditi).** Sesija nema PROD ključ.
`dfk_` grana radi (krivi ključ → 401, `/api/v1/zdravlje` 200), a ključ tenanta 2 zadnji put korišten
2026-11-23 12:09 UTC, prije deploya. Provjera: `zadnje_koristen_at` u `api_kljuc` nakon idućeg
webshop računa (S7, korak 0). *Revizija:* ako nakon idućeg webshop zahtjeva `zadnje_koristen_at` ne
napreduje ili webshop javi grešku.

## S7 (23. 11. 2026.)

Korisnikovi odgovori na vrata S6→S7: **1b** (preusmjeriti, Pages projekte zadržati), **2a** (S7
miče staru domenu iz GoTrue), potvrđene odluke 103, 104, 205, 303, osnovni CSP za `/app/*`.

**700. 301 preko zasebnog malog Workera, ne Redirect Rule ni grane glavnog Workera.**
`fiskal-app-preusmjeravanje` (`backend/src/preusmjeravanje/stara-app-domena.ts`,
`backend/wrangler.preusmjeravanje.toml`, `npm run deploy:preusmjeravanje`) ima rute na zoni
`fiskal-app.domovina.ai/*` i `fiskal-app-test.domovina.ai/*` i vraća 301 na
`https://fiskal(-test).domovina.ai/app` + putanja + upit (`/app` se ne udvostručuje). Razlozi:
wranglerov OAuth token nema dozvolu za DNS ni Rulesets (Redirect Rule bi radio korisnik u
dashboardu); glavni Worker servira `/app/*` iz assetsa prije koda, pa bi grana po hostu
na staroj domeni ondje dala dashboard umjesto 301. Ruta na zoni presreće zahtjev prije Pagesa,
pa custom domene i DNS CNAME ostaju na Pages projektima netaknuti (sve je reverzibilno:
brisanje Workera vraća stari app). TEST domena je uključena radi simetrije. Izmjereno:
`curl -sI` na obje stare domene → `301`, `location: …/app/…`. Version `aa41025d`.
*Revizija:* kad se Pages projekti brišu, prvo se s njih skidaju custom domene; DNS zapis
mora ostati proxied (npr. `AAAA 100::`) da ruta Workera i dalje hvata promet.

**701. CSP za `/app/*`** (revizija 401, tekst korisnika bez izmjena): `default-src 'self';
script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';
img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'` u `build-app.sh`. Provjera u pregledniku
(TEST i PROD, čisti kontekst): stranica prijave se hidrira, 0 CSP grešaka u konzoli
(jedine greške su očekivani `401` na `/api/v1/ja` i `404` na `/favicon.ico`, oboje i prije);
PDF otvoren kao `blob:` (kao `otvoriPdf`) se prikazuje unatoč `object-src 'none'`.
Sam passkey ceremonijal nije izveden (traži biometriju korisnika); CSP ne utječe na
WebAuthn, a `fetch` na `/api/v1` prolazi. TEST `6d7bddcc`, PROD `a798ed14` (kod Workera
isti kao `643fffac`, mijenja se samo `_headers`). *Revizija:* hash-based `script-src` bez
`'unsafe-inline'` (otvoreno).

**702. GoTrue `ADDITIONAL_REDIRECT_URLS` (domovina-api, Coolify):** maknuta 4 unosa
`https://fiskal-app.domovina.ai/**`, `https://fiskal-app-test.domovina.ai/**`,
`https://domovina-fiskal-app.pages.dev/**`, `https://domovina-fiskal-app-test.pages.dev/**`
(28 → 24), kroz `domovina-api/scripts/coolify-env-set.sh … --recreate-service=supabase-auth`
(Coolify DB + host `.env`, recreate samo `supabase-auth`; kontejner `healthy`, 0 pojava
`fiskal-app` u njegovu okolišu). TEST domena i `pages.dev` adrese su maknute uz PROD domenu
jer pripadaju istom umirovljenom appu (potvrditi). `http://localhost:3000/**` i
`http://localhost:8787/**` ostaju jer ih koriste drugi projekti. Vraćanje: isti skript s
dodanim unosima. *Revizija:* nema.

**703. Provjera iz S6 (odluka 602) ostaje otvorena.** PROD u 13:14 UTC: ključ tenanta 2 zadnje
korišten `2026-11-23 12:09:16`, ali tenant 2 još nema nijedan račun u `racun`, dakle webshop
od deploya nije izdavao. Nema znaka greške. *Revizija:* prvi webshop račun tenanta 2.

## Nakon lanca: pozivnica e-mailom (24. 11. 2026.)

**800. Pozivnica se odmah šalje e-mailom (revizija odluke 7).** `src/app-auth/pozivnica-email.ts`:
pozivnica za tenant ide pošiljateljem tenanta ako ga ima (vlastiti Resend, `posaljiPorukuTenanta`
u `src/email-tenant.ts`), inače i na njegovu grešku s `racuni@domovina.ai`; „novi passkey” uvijek
kanalom platforme. Reply-To je vlasnik kad poziva vlasnik; kad poziva admin, Reply-To iz postavke
tenanta ili ništa (adminov e-mail se ne otkriva). Slanje ne ruši izdavanje: link se i dalje vrati
jednom (admin flash, `link` u JSON-u) kao rezerva, uz `poslano`/`emailGreska`. Stanje slanja ide u
`detalji` zapisa `poziv.izdan` (`poslano`, `kanal`) — bez nove radnje, pa bez migracije CHECK-a.

**801. „Pošalji ponovno” = nova pozivnica istih podataka.** Token se ne sprema (samo sha-256), pa
se stari link ne može ponovno poslati: `ponovnoIzdaj` izdaje novu (isti e-mail, ime, tenant, uloga
ili korisnik), staru poništava (i kad je istekla) i šalje mail. Zapis `poziv.izdan` nosi
`zamjenjuje: <stari id>`. Rute: `POST /admin/korisnici/pozivnica/:id/posalji-ponovno` i
`POST /api/v1/clanovi/pozivnica/:id/posalji-ponovno` (vlasnik, samo svoj tenant; pozivnicu za
vlasnika ne može, 403 kao kod izdavanja). Iskorištena ili opozvana: 404.

**802. Link u mailu pozivnice je goli tekst, bez `<a href>`.** Na TEST-u 25. 11. 2026. mail je
otišao Resendom tenanta (susret.com.hr) s uključenim praćenjem klikova. Gumb je prepisan u
`links.susret.com.hr/CL0/https:%2F%2F…%2Fapp%2Fpoziv%23<token>`, pa bi token iz fragmenta završio u
putanji i u Resendovim logovima. Gmail goli URL sam pretvori u link, a Resend ga ne dira. Odbačeno:
slanje pozivnica uvijek kanalom platforme (korisnik je odabrao goli link).

**803. Pozivnica za postojeći račun prihvaća se prijavom.** Kad e-mail već ima račun s passkeyem
(npr. druga firma), izrada novog ključa na istom uređaju pada zbog `excludeCredentials`
(„Ovaj uređaj već ima passkey…”). `POST /api/v1/poziv/prijava` (izazov iz `/prijava/opcije`) provjeri
postojeći passkey, traži da mu e-mail bude e-mail pozivnice (drukčije 403, pozivnica ostaje), i u
jednom batchu potroši pozivnicu i upiše članstvo s ulogom iz pozivnice (`iskoristiPrijavom`). Sesija
je izvora `passkey`. `/poziv/opcije` vraća `imaPasskey`, pa dashboard prijavu nudi kao glavnu radnju.
Pozivnica za „novi passkey” (`korisnik_id`) se prijavom ne prihvaća (409).

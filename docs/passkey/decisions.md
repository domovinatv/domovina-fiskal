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

**103. Uvjeti iskorištenja u samom UPDATE-u (potvrditi).** Potrošnja pozivnice (`pozivnice.ts`
`SMIJE`) uspije samo ako: pozivnica je otvorena; korisnik s tim e-mailom nije deaktiviran, osim
kad je pozivnicu za tenant izdao admin (tada ga iskorištenje reaktivira, kao logomedo 105);
„novi passkey” traži da korisnik postoji, da je e-mail njegov i da je aktivan; korisnik nema već
5 ključeva. Ista provjera je u `provjeri`, pa S2 može odbiti prije WebAuthn ceremonije.
*Razlog:* vlasnik ne smije poništiti adminovu deaktivaciju; granica od 5 ključeva vrijedi i za pozivnice.
*Revizija:* S3 ako admin treba eksplicitnu reaktivaciju bez pozivnice.

**104. Postojeći korisnik i nova pozivnica za tenant (potvrditi).** Aktivni korisnik koji je već
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

**205. Članovi (potvrditi).** Samo `uloga = 'vlasnik'` u tom tenantu (do S5 i uz GoTrue prijavu).
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

**303. Članstvo u tenantu iz admina (potvrditi).** Postojeća ruta `/admin/tenant/:id/korisnici/:kid/
(de)aktiviraj` ostaje (admin smije i vlasnika i vraćanje bez pozivnice, odluka 205); deaktivacija
članstva sada opoziva i otvorene pozivnice tog e-maila u tenantu (isto kao vlasnik) i ostavlja zapis.
Uklonjen je samo `POST /admin/tenant/:id/korisnici` (dodavanje e-maila bez pozivnice); `createKorisnikTenant`
u `src/db` ostaje zbog GoTrue testova do S5. *Revizija:* S5 (GoTrue van).

**304. Statusi admin ruta.** Odbijena pozivnica re-renderira stranicu s porukom: 400 (e-mail, bez tenanta),
404 (nema tenanta/korisnika, opoziv nepostojeće ili zatvorene), 409 (`vec_clan`, `neaktivan`). Uspjeh
izdavanja i „Novi passkey” → 200 sa stranicom i linkom; ostalo → 303. *Revizija:* nema.

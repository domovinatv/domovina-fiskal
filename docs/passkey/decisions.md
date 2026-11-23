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

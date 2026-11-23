# TODO — dashboard: passkey i pozivnice umjesto GoTrue

Radna lista. Čuva se u repou da napredak preživi između sesija. Označene stavke su gotove
i provjerene (`cd backend && npm run typecheck && npm test` zelen; za app i `npm run build`
u repou appa). Odluke idu u [decisions.md](decisions.md).

Plan po sesijama: [plan.md](plan.md). Handoff po sesiji: [handoffs/](handoffs/).

Legenda: `[x]` gotovo · `[ ]` otvoreno · `[~]` u radu · `(!)` traži korisnika · `→ Sn` planirana sesija

## F0 — temelj u backendu (ništa javno)

- [x] Izmjeriti polazno stanje: broj testova, `skipped`, prvi slobodan broj migracije → S1 (a5aad75)
- [x] Migracija: `korisnik`, `korisnik_passkeys`, `korisnik_sesije`, `korisnik_izazovi`, `pozivnice` → S1 (a5aad75)
- [x] `backend/src/app-auth/passkey.ts` (iz logomedo `src/lib/admin/passkey.ts`, hints `client-device`/`hybrid`) → S1 (a5aad75)
- [x] `backend/src/app-auth/sesija.ts`: kolačić `__Host-fiskal_app`, sha-256 u D1, 12 h / 2 h neaktivnosti → S1 (a5aad75)
- [x] `backend/src/app-auth/pozivnice.ts`: 72 h, jednokratna, troši se tek nakon verify, nova poništava staru, opoziv → S1 (a5aad75)
- [x] Testovi za sva tri modula (bez mreže, `skipped 0`) → S1 (a5aad75)

## F1 — API i administracija

- [x] Rute prijave pod `/api/v1/prijava/*` i `/api/v1/poziv/*` (opcije + potvrda), `/api/v1/odjava`, `GET /api/v1/ja`, `/api/v1/passkeyi` → S2 (fec47e2)
- [x] `/api/v1` grana za kolačić sesije + `X-Tenant-Id` → `korisnik_tenant`; Origin provjera za mutacije s kolačićem → S2 (fec47e2)
- [x] Vlasnik: `GET/POST /api/v1/clanovi` (popis, pozovi knjigovođu/operatera, opozovi pozivnicu, deaktiviraj člana svog tenanta) → S2 (fec47e2)
- [ ] `/admin`: pozivnice za bilo koji tenant i ulogu, popis otvorenih, opoziv, „Novi passkey”, deaktivacija/aktivacija korisnika → S3
- [ ] Aktivnost/trag za radnje nad pozivnicama i korisnicima → S3

## F2 — dashboard na istom Workeru

- [ ] App: `basePath: "/app"`, build u assets fiskal Workera (`[assets]` u `wrangler.toml`, obje okoline) → S4
- [ ] App: `lib/auth.tsx` na passkey (`@simplewebauthn/browser`), stranice prijava, poziv (`#token`), moji passkeyi, članovi (vlasnik) → S4
- [ ] App: `lib/fiskal.ts` same-origin `/api/v1` s kolačićem, bez Bearer JWT; `@supabase/supabase-js` i `lib/supabase.ts` obrisani → S4
- [ ] Lokalni e2e kroz `wrangler dev`: pozivnica → passkey (virtualni autentifikator) → popis računa → S4

## F3 — GoTrue van, TEST

- [ ] Backend: obrisati `src/auth/gotrue.ts`, GoTrue granu iz `src/api/auth.ts`, `DASHBOARD_ORIGIN`/CORS za dashboard, GoTrue env → S5
- [ ] SPOT: `docs/knowledge/24-dashboard-passkey.md`; `16-dashboard-sso.md` označen kao zamijenjen; indeks → S5
- [ ] TEST: migracija pa `deploy:test`; smoke `fiskal-test.domovina.ai/app` → S5
- [ ] (!) Korisnik na TEST-u registrira passkey iz pozivnice i izda račun → vrata prije S6

## F4 — PROD i mirovina starog

- [ ] Izmjeriti PROD `korisnik_tenant` (aktivni redovi po tenantu, tko se ikad prijavio) → S6
- [ ] (!) Korisnik bira termin i javlja korisnicima (SUSRET) → vrata prije S6
- [ ] PROD: migracija, deploy, pozivnice izdane za sve aktivne redove; korisnik šalje linkove → S6
- [ ] (!) Mirovina: Pages projekti `domovina-fiskal-app` i `-test`, `fiskal-app.domovina.ai` → 301 na `fiskal.domovina.ai/app`, GoTrue redirect URL maknut → S7
- [ ] README appa i memorija ažurirani → S7

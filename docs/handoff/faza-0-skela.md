# PROMPT — Faza 0: Skela (Worker + Hono + D1 + multi-tenant)

> Zalijepi ovo kao zadatak u novu Claude Code sesiju u repou `domovina-fiskal`.
> Preduvjet: pročitaj `HANDOFF.md`, `CLAUDE.md`, `docs/knowledge/05-podatkovni-model-multitenant.md`,
> `docs/knowledge/00-INDEX.md`, `docs/reference/fira-custom-webshop-api.md`.

## Cilj
Postavi produkcijsku skelu backend servisa po uzoru na `../pipeline.domovina.ai/backend`
(Cloudflare Worker + Hono + D1 + server-rendered admin + Bearer API), bez ijedne fiskalne
funkcije. Rezultat: deployan servis koji prima tenante i vraća zdravlje.

## Zadaci
1. **Bootstrap**: `backend/` s `package.json`, `tsconfig.json`, `wrangler.toml`
   (`[[routes]] custom_domain=true` za `fiskal.domovina.ai` ili sl.), `.dev.vars.example`.
   Hono app u `src/index.ts`. Skripte: `dev`, `typecheck`, `db:migrate:local`, `deploy`.
2. **D1 migracije** (`backend/migrations/0001_init.sql`) — implementiraj shemu iz
   `docs/knowledge/05-*` §6: `tenant, api_kljuc, certifikat, poslovni_prostor,
   naplatni_uredaj, operater, kupac, sekvenca, racun, stavka, pdv_raspodjela, naplata,
   poruka_log`. Poštuj invarijante iz §6.1 (numeriranje, jedinstvenost oznaka po OIB-u).
3. **Auth**: `/api/*` Bearer (hash API ključa u `api_kljuc`), `/admin/*` Basic Auth.
   API ključ = tenant identitet (vidi multi-tenant lanac u `HANDOFF.md`).
4. **Validacija**: zod sheme za naš `RacunModel` (payload = kupac + stavke + tip), po uzoru na
   `docs/reference/fira-custom-webshop-api.md` ali **strože** (jasna obvezna/opcionalna polja,
   dobre poruke grešaka). Pun Unicode (utf8mb4-ekvivalent; sjeti se emoji buga iz Fira reference).
5. **API skela** (bez fiskalizacije): `POST /api/v1/racun` (validira, upiše `racun`+`stavka`,
   dodijeli broj iz `sekvenca` atomarno, status `nacrt`/`izdano`), `GET /api/v1/racun/:id`,
   `GET /api/v1/racun`. Vrati 201 + broj računa. (JIR/ZKI dolaze u fazi 2.)
6. **Admin skela** (`src/admin/views.ts`): popis tenanta, računa; forma za tenant + poslovni
   prostor + naplatni uređaj + operater + upload certifikata (samo sprema enkriptirano, ne koristi još).
7. **Enkripcija certifikata at-rest**: AES-GCM, master ključ iz `wrangler secret`. (`04-*`, `11-*` §4)

## Definicija gotovog (verify)
- `npm run typecheck` prolazi; `npm run db:migrate:local` kreira shemu.
- Pokreni `wrangler dev`, kreiraj tenant + API ključ, pošalji `POST /api/v1/racun` → 201 s brojem
  `{redniBroj}-{oznPP}-{oznNU}`; dohvat vraća račun. Admin prikazuje tenanta i račun.
- Pokreni `/verify` skill i dokaži tok. Zatim commit + push.

## Ne raditi u ovoj fazi
Fiskalizaciju (ZKI/JIR/CIS), eRačun/AS4, PDF, email, naplatu. To su faze 1–3.

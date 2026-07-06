# PROMPT — Dashboard za krajnje korisnike + SSO (dijeljeni GoTrue)

> Preduvjet: Faze 0–2 gotove i deployane (`fiskal.domovina.ai`). **Prvo pročitaj
> `docs/knowledge/16-dashboard-sso.md` u cijelosti** — ovo je sažeti izvršni prompt,
> tamo su sve odluke, model podataka, API ugovori, sigurnost i izvori.

## Cilj
Krajnji korisnik (vlasnik SME-a / knjigovođa) prijavi se **jednom** (dijeljeni
GoTrue SSO, `api.domovina.ai`) i dobije **puni self-service** pristup do **M od N**
tenanata, s **dropdown prebacivanjem** tenanta. Frontend = **novi Next.js repo**
(obrazac `pinka-finance/app`); fiskal Worker ostaje **čisti API** + dobije
korisnički auth mod.

## ⚠️ Struktura repoa — NIJE monorepo (dva odvojena git repoa)
- **Backend izmjene** (zadaci 1–6) → u **OVAJ** repo `domovina-fiskal` (`/Users/ms/git/domovinatv/domovina-fiskal`).
- **Next.js frontend** (zadaci 7–10) → **NOVI, ZASEBAN git repo** izvan ovog stabla:
  `/Users/ms/git/domovinatv/domovina-fiskal-app` (org `domovinatv`, javan). **NE**
  kreiraj Next app kao poddirektorij `domovina-fiskal/` — to bi bio slučajni monorepo,
  suprotno odluci D1. Obrazac je `pinka-finance/app` = vlastiti repo, odvojen od `domovina-api`.
- Zato "commit + push (oba repoa)" na kraju znači **dva** repoa.

## Nepromjenjive odluke (NE preispituj — potvrđene 2026-07-06)
- **Identitet** u GoTrue; **autorizacija** (tenant-membership + uloge) u fiskal **D1**, keyed po GoTrue `sub` s email-bind fallbackom.
- JWT verify = **delegacija na `GET /auth/v1/user`** (apikey + Bearer). **NE** kopiraj HS256 `JWT_SECRET` u Worker. JWKS/asimetrično je kasniji end-state.
- `/admin` (Basic Auth superuser) ostaje **netaknut i odvojen** od dashboarda.
- Dashboard **ne čita Supabase RLS-om** — zove `fiskal.domovina.ai/api/v1` s korisnikovim JWT-om (podaci su u D1).

## Zadaci — BACKEND (ovaj repo)
1. **Migracija `backend/migrations/0005_dashboard_korisnici.sql`** — tablica `korisnik_tenant` (DDL u `16-*` §4).
2. **Dvorežimski auth middleware** u `backend/src/api/racuni.ts:44` — granaj po obliku tokena: `dfk_` → postojeći put; JWT (`eyJ…`) → korisnički put (verify vs GoTrue → `X-Tenant-Id` → `korisnik_tenant` → 403/400/bind → `c.set('tenant')` + `c.set('korisnik')`). Downstream rute nepromijenjene. (`16-*` §5)
3. **Novi endpointi:** `GET /api/v1/moji-tenanti` (+ opc. `/ja`) — `16-*` §6. Uloge minimalno (`16-*` §6, operater bez postavki).
4. **CORS** (`hono/cors`) na `/api/v1`, preflight prije autha; origin iz `DASHBOARD_ORIGIN` (`16-*` §7).
5. **`Env` tipovi + `wrangler.toml`:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DASHBOARD_ORIGIN` (vars; `16-*` §10). Ažuriraj `src/types.ts`.
6. **`/admin` "Dashboard pristup"** po tenantu — dodaj/ukloni `email + uloga` (`16-*` §11).

## Zadaci — FRONTEND (NOVI repo)
7. Kreiraj **zaseban** repo `domovina-fiskal-app` (org `domovinatv`, javan) na putanji `/Users/ms/git/domovinatv/domovina-fiskal-app` — Next 14 App Router, `output: export`, CF Pages, Tailwind + lucide + hr i18n. Posudi `lib/supabase.ts` i `lib/auth.tsx` iz `pinka-finance/app` (prilagodi: v1 = email OTP + Google).
8. **`lib/fiskal.ts`** — API klijent, lijepi `Bearer <access_token>` + `X-Tenant-Id`; bazni URL `NEXT_PUBLIC_FISKAL_API_URL`.
9. **Tenant switcher** iz `GET /moji-tenanti` (context + localStorage).
10. **Stranice** (`16-*` §9): `/` (AuthGate), `/dashboard`, `/dashboard/novi`, `/dashboard/racun/[id]`, `/dashboard/proizvodi`, `/dashboard/postavke`.

## Zadaci — KONFIG (izvan repoa, ⚠️ zatraži/dokumentiraj)
11. U `domovina-api` (Coolify env): dodaj dashboard domenu + `http://localhost:3000` u `ADDITIONAL_REDIRECT_URLS`. Uključi Google OAuth ako već nije za tu domenu.

## Redoslijed rada
Backend 1→6 prvo (testabilno `curl`-om s pravim GoTrue JWT-om), pa frontend 7→10, pa konfig 11. Sve komentare/UI/commite na **hrvatskom** (CLAUDE.md).

## Definicija gotovog
Puna lista u `16-*` §12. Ukratko: JWT+X-Tenant-Id scope radi (krivi tenant→403), `dfk_` regresija prolazi, `/moji-tenanti` puni dropdown, novi repo login→switch→izdavanje/fiskalizacija/slanje, `/admin` dodaje pristup. `.claude/skills/verify` + commit + push (oba repoa).

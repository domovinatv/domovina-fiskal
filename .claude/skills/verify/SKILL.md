---
name: verify
description: Pokreni i provjeri domovina-fiskal backend (Cloudflare Worker + Hono + D1) lokalno — build, migracije, admin i API tok.
---

# Verifikacija — domovina-fiskal backend

Sve se izvodi iz `backend/`.

## Pokretanje

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # popuni ADMIN_USER/ADMIN_PASS + ENC_MASTER_KEY (openssl rand -hex 32)
npm run db:migrate:local          # D1 shema u .wrangler/state
npx wrangler dev --port 8787      # pozadinski; server je spreman kad GET / vrati JSON
```

## Tok koji dokazuje da servis radi

1. `GET http://localhost:8787/` → JSON s `brojaci` (health).
2. Admin (Basic Auth iz `.dev.vars`): `POST /admin/tenanti` (naziv + valjan OIB) →
   303 na `/admin/tenant/:id`; zatim redom `POST …/prostori`, `…/uredjaji`
   (`poslovni_prostor_id` iz selecta), `…/operateri`.
3. `POST /admin/tenant/:id/kljucevi` → sirovi ključ `dfk_…` je u HTML flashu
   (`grep -o 'dfk_[0-9a-f]*'`) — prikazuje se samo jednom.
4. `POST /api/v1/racun` s `Authorization: Bearer <dfk_…>` i payloadom
   `{tip: "RACUN"|"PONUDA", poslovniProstor, naplatniUredaj, stavke:[…]}` →
   201 s `brojRacuna` oblika `{redniBroj}/{oznPP}/{oznNU}`.
5. `GET /api/v1/racun/:id` i `GET /api/v1/racun` vraćaju isto (scoped na tenant).

## Vrijedne probe

- Valjan test OIB (mod-11): `12345678903`, `98765432106`.
- Paralelno izdavanje (10× curl u pozadini) pa provjera numeracije direktno u D1:
  `npx wrangler d1 execute fiskal_domovina --local --command "SELECT COUNT(*), COUNT(DISTINCT redni_broj), MAX(redni_broj) FROM racun" --json`
  — broj redaka = distinct = max → bez rupa.
- `tip: FISKALNI_B2C` mora vratiti 501 (fiskalizacija je faza 2).
- Upload certifikata: `curl -F 'p12=@file' -F 'okolina=test' /admin/tenant/:id/certifikati`;
  u D1 `length(pkcs12_encrypted)` = original + 16 (GCM tag), `fingerprint_sha256`
  = sha256 originala.

## Zamke

- Shell cwd: wrangler naredbe rade samo iz `backend/` (tamo je wrangler.toml).
- `wrangler d1 execute … --json` ispisuje i banner — parsati kroz `python3 -c 'json.load(...)[0]["results"]'` uz `2>/dev/null`.
- Bez `ADMIN_USER`/`ADMIN_PASS` u `.dev.vars` admin vraća 503 (safe default).

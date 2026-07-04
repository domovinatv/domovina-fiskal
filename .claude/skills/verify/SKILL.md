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
- Upload certifikata (od faze 2 traži i LOZINKU — P12 se parsira, ključ izvlači):
  `curl -F 'p12=@file' -F 'lozinka=…' -F 'okolina=test' /admin/tenant/:id/certifikati`;
  u D1 provjeri `oib_certifikata` = tenant OIB i `length(kljuc_pem_encrypted) > 0`.

## Fiskalizacija B2C (faza 2) — E2E protiv CIS TEST-a

Preduvjeti: FINA DEMO cert + lozinka (lokalno u `backend/.tajne/`, gitignored);
prostor mora biti označen „prijavljen" (`POST /admin/tenant/:id/prostori/:pid/cis-status`).
CIS TEST servisni prozori: radnim danom 16–17 h, nedjeljom 8–12 h.

1. `GET /admin/cis/echo` (Basic Auth) → `{"ok":true}` — mrežni put (subtls) radi.
2. `POST /api/v1/racun` s `tip: "FISKALNI_B2C"`, `operaterOib` (obavezan),
   `nacinPlacanja: "GOTOVINA"` → 201 s `zki` (32 hex), `jir` (UUID od CIS-a),
   `fiskalniQr` (`porezna.gov.hr/rn?jir=…`), `status: "fiskaliziran"`.
3. PDF (`GET /api/v1/racun/:id/pdf`) nosi blok „Fiskalni podaci" (ZKI, JIR, QR).
4. Offline/naknadna dostava: privremeno pokvari TEST host u `src/fiskal/cis.ts`
   → račun ostane `izdano` sa ZKI + `fiskal_nak_dost=1`; vrati host pa
   `curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"` (dev pokrenut s
   `--test-scheduled`) → sweep šalje `NakDost=true` s NOVIM IdPoruke → JIR.
5. Audit: `poruka_log` ima zahtjev+odgovor XML za svaki pokušaj.

Zamka: XML-DSIG je RSA-SHA256/SHA-256 (SHA1 → `s004`); ZKI je RSA-SHA1+MD5.

## Zamke

- Shell cwd: wrangler naredbe rade samo iz `backend/` (tamo je wrangler.toml).
- `wrangler d1 execute … --json` ispisuje i banner — parsati kroz `python3 -c 'json.load(...)[0]["results"]'` uz `2>/dev/null`.
- Bez `ADMIN_USER`/`ADMIN_PASS` u `.dev.vars` admin vraća 503 (safe default).

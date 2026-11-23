# CLAUDE.md — domovina-fiskal

Open-source SaaS za izdavanje HR fiskaliziranih računa (alternativa fira.finance).
Vidi `README.md` za viziju, `docs/knowledge/00-INDEX.md` za single point of truth.

## Faza
Trenutno: **RESEARCH / PLANNING**. Prvo činjenično znanje u `docs/`, tek onda kod.

## Konvencije
- **Jezik:** svi komentari, logovi, admin UI, docs — **hrvatski** (kao cijeli ekosustav).
- **Izvori:** svaka činjenična tvrdnja u `docs/knowledge/*` mora imati izvor (URL) i
  datum pristupa. Nesigurno/proturječno se eksplicitno označava ⚠️.
- **Secrets:** NIKAD u repo (javan). Certifikati/ključevi tenanata su najosjetljiviji —
  vidi `docs/knowledge/04-*` i `05-*` za pohranu (enkripcija at-rest, KMS/secret store).
- **Stack (planirano):** Cloudflare Worker + Hono + D1, server-rendered admin, Bearer
  API, po uzoru na `../pipeline.domovina.ai`. Runtime za potpis/SOAP: vidi `docs/knowledge/11-*`.

## Struktura docs
- `docs/knowledge/NN-*.md` — činjenične teme (SPOT).
- `docs/reference/*.md` — reference iz prve ruke (Fira API, lokalni artefakti).
- `docs/research/*` — sirovi istraživački materijali (po potrebi).
- `PLAN.md` — plan implementacije.

## Lanac: passkey prijava za dashboard (umjesto GoTrue)

**Gotovo 23. 11. 2026. (S0–S7).** Dashboard je na `fiskal.domovina.ai/app` (passkey + pozivnice),
`fiskal-app(-test).domovina.ai` 301 preusmjerava mali Worker `fiskal-app-preusmjeravanje`
(`backend/wrangler.preusmjeravanje.toml`). Plan i odluke u `docs/passkey/`; što je ostalo otvoreno
(brisanje Pages projekata, odluka 602) piše u „Otvoreno nakon lanca” u `docs/passkey/handoffs/README.md`.

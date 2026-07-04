# HANDOFF — nastavak nakon `/clear`

Ovaj dokument je **ulazna točka za novu Claude sesiju**. Research/planning faza je gotova;
slijedi implementacija. Pročitaj ovo, pa relevantni prompt iz `docs/handoff/`.

## Gdje je znanje (single point of truth)
- **`docs/knowledge/00-INDEX.md`** — glavni indeks + destilat. Dokumenti 01–15 + 99.
- **`docs/reference/`** — Fira API (`fira-custom-webshop-api.md`), Fira UI obilazak
  (`fira-ui-walkthrough.md`), lokalni artefakti.
- **`PLAN.md`** — fazni plan. **`docs/knowledge/99-gap-analiza.md`** — nepotvrđeno prije koda.

## Što je projekt
Open-source multi-tenant SaaS za **izdavanje hrvatskih računa** (alternativa fira.finance):
- **B2C fiskalizacija 1.0** (ZKI/JIR/QR preko CIS SOAP-a) — vidi `02-*`.
- **eRačun 2.0** (UBL 2.1 / HR CIUS preko AS4/**posrednika**) — vidi `03-*`, `12-*`, `13-*`.
- Nefiskalne **ponude/računi** (PDF/email/QR) — vidi `09-*`.

## Fiksirane arhitektonske odluke (NE re-litigirati bez razloga)
1. **Stack:** Cloudflare Worker + **Hono** + **D1**, server-rendered admin (Basic Auth),
   Bearer API, **hrvatski jezik svugdje**. Uzor: `../pipeline.domovina.ai`. (`CLAUDE.md`)
2. **Multi-tenant lanac** (potvrđen na Firi): `Webshop(apiKey/tajni ključ)` → `Slijed računa`
   → `Poslovni prostor` + `Naplatni uređaj` + `Operater(OIB)` → `Račun`. Payload = kupac +
   stavke + tip; sve o izdavatelju server-side. Shema: `05-*`.
3. **Kripto NIJE razlog za sidecar** — MD5 i pun `node:crypto` rade na Workers (`nodejs_compat`).
   ZKI/XML-DSIG izvedivi na edge-u. Sidecar samo ako: (a) CIS traži per-tenant transportni mTLS,
   ili (b) sigurnosno ne želimo dešifrirati ključ na edge-u. (`11-*`)
4. **eRačun 2.0 = preko posrednika (faza 1)** — doku / ePoslovanje(Pondi) / FINA API; posrednik
   potpisuje svojim certom preko punomoći → tenant bez vlastitog 2.0 certa. Vlastita PT (Domibus)
   tek faza 2. Ekonomija/break-even: `15-*`. Postupak posrednika: `14-*`.

## Redoslijed implementacije → promptovi
Izvedi fazu po fazu. Svaki prompt je samostalan; pokreni ga u novoj sesiji.
1. [`docs/handoff/faza-0-skela.md`](docs/handoff/faza-0-skela.md) — Worker+Hono+D1 skela, multi-tenant, migracije, admin, validacija.
2. [`docs/handoff/faza-1-dokumenti-pdf.md`](docs/handoff/faza-1-dokumenti-pdf.md) — ponude/računi (nefiskalni) + PDF + QR + email.
3. [`docs/handoff/faza-2-fiskalizacija-b2c.md`](docs/handoff/faza-2-fiskalizacija-b2c.md) — B2C fiskalizacija 1.0 (ZKI/JIR/CIS TEST, DEMO cert).
4. [`docs/handoff/faza-3-eracun-2.0.md`](docs/handoff/faza-3-eracun-2.0.md) — eRačun 2.0 preko posrednika + eIzvještavanje.

## Pravila rada
- Prije koda provjeri ⚠️ stavke iz `99-gap-analiza.md` i „Razrješenje otvorenih ⚠️" sekcije u `12-15`.
- **Secrets NIKAD u repo** (javan!). Certifikati/tajni ključevi enkriptirani at-rest (`04-*`, `05-*`).
- Commit poruke i sve na hrvatskom. Push na `origin/main` (`domovinatv/domovina-fiskal`).
- Nakon svake faze: `/verify` (pokreni app i dokaži da radi), pa commit.

## Stanje repoa na dan handoffa (2026-07-04)
Samo dokumentacija (17 knowledge + 3 reference docs). **Nema još koda.** Prvi kod = faza 0.
